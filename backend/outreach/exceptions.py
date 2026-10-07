"""Business-rule errors raised by the service layer, and how the API reports them."""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import exceptions as drf_exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class DomainError(Exception):
    """A request that breaks a business rule; carries the HTTP status the API should use."""

    status_code = 400

    def __init__(self, message):
        super().__init__(message)
        self.message = message


class ConflictError(DomainError):
    """The request conflicts with the current state (already claimed, already closed, ...)."""

    status_code = 409


class NotPermittedError(DomainError):
    status_code = 403


def api_exception_handler(exc, context):
    """DRF's handler, plus domain errors -> {"detail"} and model validation errors -> 400."""
    if isinstance(exc, DomainError):
        return Response({"detail": exc.message}, status=exc.status_code)
    if isinstance(exc, DjangoValidationError):
        detail = exc.message_dict if hasattr(exc, "error_dict") else exc.messages
        exc = drf_exceptions.ValidationError(detail)
    return drf_exception_handler(exc, context)
