from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    # Django's own admin lives at /django-admin/ so /admin/ stays free for the React app.
    path("django-admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("outreach.urls")),
]
