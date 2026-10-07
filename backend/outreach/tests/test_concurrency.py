"""Races between agents, run on real concurrent database connections.

`timezone.now` is slowed down so each transaction holds its position for a
moment: without row locking, both threads would pass their checks before
either commits, and these tests would fail.
"""

import threading
import time

import pytest
from django.db import connection
from django.utils import timezone

from outreach.exceptions import ConflictError
from outreach.models import ActionType
from outreach.tests.factories import make_patient, make_record
from outreach.workflow import claim_patient, log_action

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def slow_clock(monkeypatch):
    """Returns a switch that makes every timezone.now() call take a while (setup stays fast)."""
    real_now = timezone.now

    def now():
        time.sleep(0.3)
        return real_now()

    return lambda: monkeypatch.setattr(timezone, "now", now)


def run_together(*calls):
    """Run each callable in its own thread (own DB connection), started at the same moment."""
    barrier = threading.Barrier(len(calls))
    results = [None] * len(calls)

    def run(index, call):
        try:
            barrier.wait()
            results[index] = call()
        except Exception as exc:  # noqa: BLE001 - the test inspects what each thread raised
            results[index] = exc
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(i, call)) for i, call in enumerate(calls)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    return results


def test_two_agents_claiming_the_same_patient_at_once_only_one_wins(agent, other_agent, slow_clock):
    patient = make_patient()
    make_record(patient)

    slow_clock()
    results = run_together(
        lambda: claim_patient(patient.pk, agent),
        lambda: claim_patient(patient.pk, other_agent),
    )

    conflicts = [result for result in results if isinstance(result, ConflictError)]
    winners = [result for result in results if not isinstance(result, Exception)]
    assert len(conflicts) == 1, results
    assert len(winners) == 1, results
    patient.refresh_from_db()
    assert patient.assigned_to == winners[0].assigned_to


def test_closing_the_last_two_records_at_once_still_releases_the_patient(agent, slow_clock):
    patient = make_patient(assigned_to=agent)
    first = make_record(patient, visit_type="Annual Physical")
    second = make_record(patient, visit_type="Flu Shot")

    slow_clock()
    results = run_together(
        lambda: log_action(first.pk, agent, action_type=ActionType.NOT_INTERESTED),
        lambda: log_action(second.pk, agent, action_type=ActionType.NOT_INTERESTED),
    )

    assert not any(isinstance(result, Exception) for result in results), results
    assert sorted(result.patient_released for result in results) == [False, True]
    patient.refresh_from_db()
    assert patient.assigned_to is None
