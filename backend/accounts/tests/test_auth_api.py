import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_login_starts_a_session_and_returns_the_user(api_client, agent):
    response = api_client.post("/api/auth/login/", {"username": "agent1", "password": "pw-agent1"})

    assert response.status_code == 200
    assert response.json() == {"id": agent.id, "username": "agent1", "display_name": "agent1", "is_admin": False}
    assert api_client.get("/api/auth/me/").status_code == 200


def test_admins_are_flagged(api_client, admin_user):
    response = api_client.post("/api/auth/login/", {"username": "admin", "password": "pw-admin"})

    assert response.json()["is_admin"] is True


def test_wrong_password_is_rejected(api_client, agent):
    response = api_client.post("/api/auth/login/", {"username": "agent1", "password": "nope"})

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid username or password."}


def test_anonymous_requests_get_401(api_client):
    assert api_client.get("/api/auth/me/").status_code == 401
    assert api_client.get("/api/pool/").status_code == 401


def test_logout_ends_the_session(agent_client):
    assert agent_client.post("/api/auth/logout/").status_code == 204
    assert agent_client.get("/api/auth/me/").status_code == 401


def test_login_requires_the_csrf_token(agent):
    client = APIClient(enforce_csrf_checks=True)
    credentials = {"username": "agent1", "password": "pw-agent1"}

    assert client.post("/api/auth/login/", credentials).status_code == 403

    client.get("/api/auth/csrf/")
    token = client.cookies["csrftoken"].value
    assert client.post("/api/auth/login/", credentials, HTTP_X_CSRFTOKEN=token).status_code == 200


def test_writes_from_a_logged_in_session_require_the_csrf_token(agent):
    client = APIClient(enforce_csrf_checks=True)
    client.login(username="agent1", password="pw-agent1")

    response = client.post("/api/auth/logout/")

    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]
