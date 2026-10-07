import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def fast_password_hashing(settings):
    # The production hasher is deliberately slow; tests create many users.
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture
def agent(db):
    return get_user_model().objects.create_user(username="agent1", password="pw-agent1")


@pytest.fixture
def other_agent(db):
    return get_user_model().objects.create_user(username="agent2", password="pw-agent2")


@pytest.fixture
def admin_user(db):
    return get_user_model().objects.create_user(
        username="admin", password="pw-admin", is_staff=True
    )


@pytest.fixture
def api_client():
    return APIClient()


def _logged_in_client(user):
    client = APIClient()
    client.force_login(user)
    return client


@pytest.fixture
def agent_client(agent):
    return _logged_in_client(agent)


@pytest.fixture
def other_agent_client(other_agent):
    return _logged_in_client(other_agent)


@pytest.fixture
def admin_client(admin_user):
    return _logged_in_client(admin_user)
