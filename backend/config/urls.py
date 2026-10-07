from django.contrib import admin
from django.urls import path

urlpatterns = [
    # Django's own admin lives at /django-admin/ so /admin/ stays free for the React app.
    path("django-admin/", admin.site.urls),
]
