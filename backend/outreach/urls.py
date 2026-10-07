from django.urls import path

from . import views

urlpatterns = [
    path("pool/", views.PoolView.as_view()),
    path("patients/<int:pk>/claim/", views.ClaimView.as_view()),
    path("my-work/", views.MyWorkView.as_view()),
    path("records/<int:pk>/actions/", views.LogActionView.as_view()),
    path("imports/", views.ImportListView.as_view()),
    path("imports/<int:pk>/", views.ImportDetailView.as_view()),
    path("imports/<int:pk>/commit/", views.ImportCommitView.as_view()),
    path("admin/patients/", views.AdminPatientListView.as_view()),
    path("admin/patients/<int:pk>/", views.AdminPatientDetailView.as_view()),
    path("admin/patients/<int:pk>/reassign/", views.ReassignView.as_view()),
    path("admin/filter-options/", views.FilterOptionsView.as_view()),
]
