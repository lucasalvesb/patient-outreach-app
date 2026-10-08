# Patient Visit Outreach

A small app for call-center agents who reach patients due for a visit. An admin uploads a
CSV of due patients, sees a preview of what each row will do, and imports it. Agents claim a
patient from the unassigned pool, call them, and log how each call went. Once every one of a
patient's records is closed, the patient is released automatically.

- **Backend:** Django 5.2 (LTS) + Django REST Framework, PostgreSQL 17, pytest
- **Frontend:** React 19 + TypeScript, Vite, TanStack Query, React Router, Vitest + Testing Library
- **All data is fake.**

All the must-haves are done, plus every bonus item:
- an admin view with filters
- reassigning a patient
- protection against two agents claiming the same patient at once
- frontend tests
- a Docker setup

---

## Quick start (Docker)

Requires Docker Desktop (or Docker Engine with Compose v2).

```bash
docker compose up --build
```

Open **http://localhost:8080**. Demo accounts are created on startup:

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `outreach-admin-2026` | Admin: imports files, sees all patients, reassigns (can also work the pool) |
| `agent1` | `outreach-agent-2026` | Agent |
| `agent2` | `outreach-agent-2026` | Agent |

The demo passwords are deliberately not `admin123`-style. Chrome flags well-known passwords as
breached and interrupts every login with a "change your password" dialog.

Ports:
- **8080:** the app (nginx serving the React build and proxying `/api` to Django).
- **5433:** Postgres, published so local development can use it.

Change them with `APP_PORT` or `POSTGRES_HOST_PORT` if they are taken.

To start over with an empty database: `docker compose down -v`.

## A five-minute walkthrough

1. **Import (admin).** Log in as `admin` and go to **Import**. Upload `sample_data/assignment_sample.csv`,
   the starter file from the brief. The preview shows **2 will be created, 1 skipped as duplicate,
   2 rejected**, with a reason on every rejected row:
   - Row 3 duplicates row 2 once it's cleaned up: ` ab1001 ` becomes `AB1001`, visit type matching
     ignores case, and `02/14/1980` is a valid date.
   - Row 4's DOB `1975-13-40` isn't a date.
   - Row 5 has no account number.

   Click **Import 2 records**.

   `sample_data/demo_patients.csv` is a bigger file with 16 patients and a mix of bad rows:
   - a duplicate
   - an impossible date
   - missing fields
   - a future visit
   - a DOB that conflicts with an earlier row
   - an unquoted comma
   - call notes pasted into the name column (220 characters, over the 200 limit)

   It also has very long values that are valid: a 67-character name, a long clinic and visit
   type, a surname that is one 28-letter word, and a patient due for five visits at four
   clinics. Imported after the starter file, it shows **22 will be created, 3 skipped as
   duplicates, 7 rejected**.
2. **Claim (agent).** In another browser or a private window, log in as `agent1`. **Pool** lists
   unassigned patients with open records, most overdue first. Claim *Jane Testperson*.
3. **Call.** In **My work**, each open record has an outcome pad: *No Answer* and *Voicemail* keep
   the record open, while *Scheduled* (which asks for the appointment date) and *Not Interested*
   close it. Every call shows up in the record's history. Closing the last open record releases
   the patient.
4. **Oversee (admin).** **All patients** filters by records (open or all closed), assigned agent,
   clinic, visit type and name or account. **Details** shows every record and its call history,
   and lets you reassign the patient or send them back to the pool.

## Local development

Prerequisites:
- Python 3.11 or newer (developed on 3.14)
- Node 22.22 or newer (React Router 8 requires it)
- Docker, for Postgres

```bash
# 1. Database (Postgres on localhost:5433)
docker compose up -d db

# 2. Backend on http://127.0.0.1:8000
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows PowerShell; on macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py seed_demo      # the demo accounts above
python manage.py runserver

# 3. Frontend on http://localhost:5173 (proxies /api to the backend)
cd frontend
npm install
npm run dev
```

The backend reads its configuration from environment variables, with defaults that match the
compose database:

| Variables | Default |
| --- | --- |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `localhost`, `5433`, `outreach`, `outreach`, `outreach` |
| `DJANGO_DEBUG` | `true` locally (`false` in Docker) |
| `DJANGO_SECRET_KEY` | required when debug is off |
| `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` | localhost values |
| `TIME_ZONE` | `America/New_York` |

Django's own admin is available at `/django-admin/` for poking at data. Create an account
there with `python manage.py createsuperuser`.

## Tests

```bash
# Backend: 143 tests, against the real Postgres (needs the db container running)
cd backend && pytest
# ...or with nothing but Docker:
docker compose run --rm backend pytest

# Frontend: 39 tests, plus a type check
cd frontend && npm test && npm run typecheck
```

What they cover:

- **CSV parsing and planning** are pure functions with focused unit tests: header matching,
  date formats, every validation message, account clean-up, duplicates within the file and
  against the database, conflicting patient identities, and the exact outcome of the starter
  file.
- **The import service** checks that a preview writes nothing, that a commit re-validates
  against data added after the preview, and that a preview can be committed only once or
  discarded.
- **Workflow rules:**
  - Claiming, including when someone else holds the patient.
  - Every call outcome, and the appointment date rules.
  - Closed records refusing further calls.
  - Only the assigned agent may log calls.
  - Release once the last record closes, and reassigning.
- **Race conditions** are tested with real concurrent database connections:
  - Two agents claiming the same patient at the same moment: exactly one wins and the other
    gets a conflict.
  - Two records of the same patient closed at the same moment: the patient is still
    released.

  Both tests fail if the row locking is removed.
- **The API** is covered end to end, including permissions, 401 vs 403, and CSRF on login and
  on writes.
- **Frontend:**
  - The outcome pad: the date appears only for Scheduled, validation, and server errors.
  - The import preview: counts, reasons, filters.
  - The API client: CSRF header, error messages, 401 handling.
  - Routing and auth redirects.
  - A claim conflict in the pool.
  - Release in My work.
  - Long table values: a tooltip with the full text only when the value is cut short.

## How it works

### Data model

- **Patient** is identified by its normalized account number. `assigned_to` is the agent
  working the patient; empty means unassigned.
- **OutreachRecord** is one visit a patient is due for: clinic, visit type, last visit, and a
  status of `open` or `closed`. A database constraint makes *patient + visit type
  (case-insensitive) + last visit* unique, which is the duplicate rule.
- **OutreachAction** is one logged call: outcome, agent, notes, and an appointment date. A
  check constraint requires the date for *Scheduled* and forbids it for the other outcomes.
- **ImportBatch** is one uploaded file: who uploaded it, its contents, the per-row outcomes
  shown in the preview, and later the final result.

### CSV import

```
upload ─► parse (clean + validate each row) ─► plan (identity, duplicate checks) ─► stored preview
confirm ─► re-parse + re-plan against current data ─► create patients/records ─► stored result
```

Parsing and planning have no database access. The service loads only what they need: the
existing patients and records for the account numbers in the file.

Committing re-checks every row, so a record added between preview and confirm becomes a
duplicate instead of a second copy. The UI says so when the outcome changed. Commits are
serialized with a Postgres advisory lock, and the unique constraint is the final safety net.

### Claiming and closing safely

Every operation that changes who has a patient, or closes one of their records, first locks
that patient's row (`SELECT … FOR UPDATE`):

- **Claiming:** if two agents claim at once, the second waits, sees the patient is taken, and
  gets a `409 Conflict`. The pool also refreshes every 30 seconds.
- **Logging a call:** this takes the same lock. When an agent closes two records of one
  patient at the same moment, the second close sees the first, so "all records closed → release
  the patient" can never be missed.

### API

All endpoints are under `/api/` and use session authentication plus a CSRF token on writes. Not
logged in → `401`; not allowed → `403`; business-rule conflicts → `409`; validation errors →
`400` with per-field messages.

| Method | Path | Who | What |
| --- | --- | --- | --- |
| GET | `auth/csrf/` | anyone | sets the CSRF cookie |
| POST | `auth/login/`, `auth/logout/` | anyone | start or end a session |
| GET | `auth/me/` | logged in | the current user |
| GET | `pool/?search=&page=` | logged in | unassigned patients with open records, most overdue first |
| POST | `patients/{id}/claim/` | logged in | claim a patient and all their open records |
| GET | `my-work/` | logged in | my patients with every record and its call history |
| POST | `records/{id}/actions/` | assigned agent | log a call `{action_type, appointment_date?, notes?}`; the response includes the updated record and `patient_released` |
| GET, POST | `imports/` | admin | import history; upload a CSV to get a preview |
| GET, DELETE | `imports/{id}/` | admin | a preview or result with its rows; discard a preview |
| POST | `imports/{id}/commit/` | admin | import a previewed file |
| GET | `admin/patients/?search=&status=&agent=&clinic=&visit_type=` | admin | all patients with assignment and record counts |
| GET | `admin/patients/{id}/` | admin | one patient with records and call history |
| POST | `admin/patients/{id}/reassign/` | admin | `{"agent_id": <user id or null>}` |
| GET | `admin/filter-options/` | admin | clinics, visit types and agents for the filters |

### Project layout

```
backend/
  config/                 settings and root URLs
  accounts/               session login API
  outreach/
    models.py             Patient, OutreachRecord, OutreachAction, ImportBatch
    csv_import/
      parsing.py          read and clean rows (pure)
      planning.py         create / duplicate / reject decisions (pure)
      service.py          preview, commit and discard against the database
    workflow.py           claim, log a call, release, reassign
    selectors.py          read queries behind the API
    views.py, serializers.py, urls.py
    management/commands/seed_demo.py
    tests/
frontend/
  src/
    api/                  fetch client (CSRF, error messages), endpoints, types
    auth/                 session state and route guards
    components/           outcome pad (LogCallForm), ImportPreview, RecordPanel, ...
    pages/                Login, Pool, My work, Import, All patients
    styles/app.css
sample_data/              CSV files to try the import with
docker-compose.yml
```

## Assumptions and decisions

Where the brief left something open, this is the call I made.

### CSV import

- **Columns.** The file needs `Account No, Patient Name, DOB, Clinic, Visit Type, Last Visit`.
  Header names are matched ignoring case and extra spaces, and any other columns are ignored.
  A missing column rejects the whole file with a message, and nothing is stored.
- **Encoding and size.** Files can be UTF-8 (with or without a BOM) or Windows-1252, which is
  what Excel often writes. The limits are 5 MB and 10,000 rows.
- **Dates.** `YYYY-MM-DD` or US `MM/DD/YYYY`. Two-digit years and impossible dates are
  rejected. DOB can't be in the future or before 1900. Last Visit can't be in the future or
  before the DOB.
- **Account numbers** are trimmed and uppercased (` ab123 ` → `AB123`). Nothing else is
  changed.
- **Text fields** (name, clinic, visit type) are trimmed and runs of spaces collapsed. Clinic
  and visit type reuse the first spelling already in the system (or earlier in the file), so
  `maple clinic` is stored as `Maple Clinic` and the filters don't show case variants.
- **Bad rows.** Every problem in a row is listed, not just the first. Other rows still import.
  A row with more values than the header (usually an unquoted comma, as in `Lee, Pat`) gets
  that single explanation instead of a cascade of shifted-column errors.
- **Patient identity is the account number.** If a row uses an existing account number but a
  different name or DOB, it is **rejected** rather than silently merged or overwritten. The
  same applies to an earlier row in the same file. Calling the wrong person about their health
  is the error this guards against. Names are compared ignoring case and spacing.
- **Duplicates** are *same account + visit type (ignoring case) + last visit*, as the brief says.
  Clinic is not part of the key. Rows are checked against **all** existing records, open or
  closed, so re-uploading last month's list doesn't reopen finished outreach. A repeat within
  the same file is reported as a duplicate of the earlier row.
- **Blank lines** are skipped. Row numbers in the preview match spreadsheet rows, with the
  header as row 1.
- **The preview is saved** and the confirm step re-validates it, as described above. Previews
  that are never confirmed can be discarded; until then they stay in the import history marked
  "Preview only".
- **New records for a claimed patient** go straight to that agent's work, because claims are
  per patient. New records for a released patient put them back in the pool.

### Workflow

- **Roles.** Any logged-in user can work the pool. Admins (Django `is_staff`) can also import,
  see all patients and reassign.
- **Claims are per patient.** An agent gets all of the patient's open records, including ones
  imported later.
- **Who logs calls.** Only the agent holding a patient can log calls on their records. Admins
  reassign rather than log calls on someone's behalf.
- **Closed records stay closed.** There is no way to reopen one, and logging a call on it
  returns `409`.
- **Appointment dates.** *Scheduled* needs a date of today or later. The other outcomes must
  not send a date. Notes are optional (up to 1,000 characters).
- **Released means unassigned.** A released patient has nothing open, so they don't appear in
  the pool.
- **Reassign** moves a patient to another active user, or back to the pool. A patient with
  nothing open can't be assigned.
- **No agent-side "unclaim".** Not asked for; an admin can send a patient back to the pool.
- **"Today"** for date checks uses `TIME_ZONE` (default `America/New_York`), on the assumption
  that the call center is in the US.

### Look and feel

- **Suffolk Health's colors, exactly.** Taken from suffolkhealth.com (theme settings and
  computed styles, October 2026): teal `#52BDB5`, page `#F8FBFD`, white `#FFFFFF`, black
  `#000000` headings, navy `#151D23` menu text, gray `#575757` body text, `#E2EEF2` borders,
  `#DCF3F2` and `#EAF7FC` panels, slate `#7C929F`, and their contact form's `#686E77` field
  border and `#555555` placeholder. They are defined once, at the top of
  `frontend/src/styles/app.css`.
- **Their shapes.** Pill buttons, flat cards with 20px corners, 15px tiles, 3px form fields,
  the header shadow and the slight fade on button hover all follow their site.
- **Fonts.** Their typeface, Gilmer, is a paid font, so the app uses Golos Text, the closest
  open-license match: the same letter shapes, and text runs within about 1% of Gilmer's width.
  Form fields use Open Sans, as on their contact form. Both come from npm, so no font loads from
  a third-party server.
- **Text on teal is navy, not white.** White on `#52BDB5` is 2.3:1, and WCAG AA asks for 4.5:1.
  Navy on teal is 7.5:1, and every text color pair in the app passes AA. To match their site
  exactly instead, set `--on-brand` to `#FFFFFF`.
- **Red and amber are the only colors not from their site.** It has no error or warning states,
  and rejected rows and unanswered calls need them.
- **Long values.** Names, clinics and visit types can be up to 200 characters. In the list
  tables a value takes at most two lines on a desktop (three on tablets, four on phones, where
  columns are narrower), then ends in "…"; hovering shows the full value. Only values that are
  actually cut get the tooltip. The Details panel on All patients and My work always show
  everything, wrapped. A table that runs out of room scrolls sideways in its own box rather
  than squeezing words apart.

### Security and operations

- **Sessions.** Session cookie plus CSRF, which suits a same-origin single-page app with no
  tokens in local storage. Sessions last one 8-hour shift. Login is also CSRF-protected.
- **Not production-hardened**, since deployment is out of scope:
  - no HTTPS or secure-cookie settings
  - no login throttling
  - the Docker secret key is a placeholder
  - the demo accounts are seeded on startup

## What I'd do next

- An audit trail of claims and reassignments (who had the patient, and when).
- Outreach policies, for example a maximum number of attempts or automatic closing for
  unreachable patients, and callbacks at a requested time.
- Live updates (server-sent events) instead of polling the pool.
- Browser end-to-end tests (Playwright) and a CI pipeline running both suites.
- Login throttling, HTTPS-only cookies, and structured logs that never contain patient data.
