from rest_framework import authentication


class SessionAuthentication(authentication.SessionAuthentication):
    """Django session auth that answers 401 (not 403) when nobody is logged in.

    DRF only sends 401 when the authenticator names a WWW-Authenticate scheme;
    this lets the frontend tell "log in again" apart from "not allowed".
    """

    def authenticate_header(self, request):
        return "Session"
