// Calendar dates ("1980-02-14") have no time zone. Parsing them with `new Date(iso)`
// treats them as UTC midnight, which shows the previous day west of Greenwich, so
// they are always formatted in UTC here.
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "1980-02-14" -> "Feb 14, 1980" */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(`${iso}T00:00:00Z`));
}

/** An ISO timestamp in the viewer's local time: "Oct 7, 2026, 3:04 PM" */
export function formatDateTime(iso: string): string {
  return DATE_TIME_FORMAT.format(new Date(iso));
}

/** A local date as "YYYY-MM-DD" (the format of <input type="date">). */
export function toISODate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Age in whole years on the given day. */
export function ageOn(dobISO: string, today: Date = new Date()): number {
  const [year, month, day] = dobISO.split("-").map(Number);
  const hadBirthday = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  return today.getFullYear() - year - (hadBirthday ? 0 : 1);
}

/** How long ago a calendar date was: days under a month, months under two years, then years. */
export function timeSince(iso: string, today: Date = new Date()): string {
  const [year, month, day] = iso.split("-").map(Number);
  let months = (today.getFullYear() - year) * 12 + (today.getMonth() + 1 - month);
  if (today.getDate() < day) months -= 1;

  if (months < 1) {
    const then = Date.UTC(year, month - 1, day);
    const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const days = Math.round((now - then) / 86_400_000);
    return days <= 0 ? "today" : `${plural(days, "day")} ago`;
  }
  if (months < 24) return `${plural(months, "month")} ago`;
  return `${plural(Math.floor(months / 12), "year")} ago`;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}
