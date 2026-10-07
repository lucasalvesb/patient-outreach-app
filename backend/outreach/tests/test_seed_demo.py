import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

pytestmark = pytest.mark.django_db


def test_creates_the_demo_admin_and_agents():
    call_command("seed_demo")

    users = get_user_model().objects.order_by("username")
    assert [(user.username, user.is_staff) for user in users] == [
        ("admin", True),
        ("agent1", False),
        ("agent2", False),
    ]
    # Deliberately not "admin123"-style passwords: browsers flag those as breached and
    # interrupt every demo login with a "change your password" warning.
    assert users.get(username="admin").check_password("outreach-admin-2026")
    assert users.get(username="agent1").check_password("outreach-agent-2026")
    assert users.get(username="agent2").check_password("outreach-agent-2026")


def test_running_it_again_leaves_existing_users_alone():
    call_command("seed_demo")
    admin = get_user_model().objects.get(username="admin")
    admin.set_password("changed-by-someone")
    admin.save()

    call_command("seed_demo")

    assert get_user_model().objects.count() == 3
    admin.refresh_from_db()
    assert admin.check_password("changed-by-someone")
