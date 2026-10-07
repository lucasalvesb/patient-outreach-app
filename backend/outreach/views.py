from django.conf import settings
from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import UserSummarySerializer

from . import selectors
from .csv_import.service import commit_import, discard_import, preview_import
from .models import ImportBatch
from .pagination import StandardPagination
from .permissions import IsAdmin
from .serializers import (
    ActionSerializer,
    AdminPatientFilterSerializer,
    AdminPatientSerializer,
    ImportBatchDetailSerializer,
    ImportBatchSerializer,
    ImportUploadSerializer,
    LogActionSerializer,
    PatientWorkSerializer,
    PoolPatientSerializer,
    ReassignSerializer,
    RecordSerializer,
)
from .workflow import claim_patient, log_action, reassign_patient

ADMIN_ONLY = [IsAuthenticated, IsAdmin]


# --- Agents -----------------------------------------------------------------


class PoolView(generics.ListAPIView):
    serializer_class = PoolPatientSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        return selectors.pool_patients(search=self.request.query_params.get("search", ""))


class ClaimView(APIView):
    def post(self, request, pk):
        claim_patient(pk, request.user)
        patient = selectors.patients_with_history().get(pk=pk)
        return Response(PatientWorkSerializer(patient).data)


class MyWorkView(generics.ListAPIView):
    serializer_class = PatientWorkSerializer

    def get_queryset(self):
        return selectors.agent_work(self.request.user)


class LogActionView(APIView):
    def post(self, request, pk):
        serializer = LogActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = log_action(pk, request.user, **serializer.validated_data)
        record = selectors.records_with_history().get(pk=result.record.pk)
        return Response(
            {
                "action": ActionSerializer(result.action).data,
                "record": RecordSerializer(record).data,
                "patient_released": result.patient_released,
            },
            status=status.HTTP_201_CREATED,
        )


# --- CSV imports (admin) ----------------------------------------------------


class ImportListView(generics.ListAPIView):
    """GET: import history. POST: upload a CSV and get its preview."""

    permission_classes = ADMIN_ONLY
    serializer_class = ImportBatchSerializer
    pagination_class = StandardPagination
    parser_classes = [MultiPartParser]
    queryset = ImportBatch.objects.select_related("uploaded_by").defer("content", "rows")

    def post(self, request):
        serializer = ImportUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["file"]
        # Read one byte past the limit: enough to reject an oversized file without loading all of it.
        data = upload.read(settings.OUTREACH_IMPORT_MAX_BYTES + 1)
        batch = preview_import(user=request.user, filename=upload.name, data=data)
        return Response(ImportBatchDetailSerializer(batch).data, status=status.HTTP_201_CREATED)


class ImportDetailView(generics.RetrieveDestroyAPIView):
    """GET: a preview or a finished import, with its rows. DELETE: discard a preview."""

    permission_classes = ADMIN_ONLY
    serializer_class = ImportBatchDetailSerializer
    queryset = ImportBatch.objects.select_related("uploaded_by")

    def destroy(self, request, *args, **kwargs):
        discard_import(kwargs["pk"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ImportCommitView(APIView):
    permission_classes = ADMIN_ONLY

    def post(self, request, pk):
        batch = commit_import(pk)
        return Response(ImportBatchDetailSerializer(batch).data)


# --- Admin overview -----------------------------------------------------------


class AdminPatientListView(generics.ListAPIView):
    permission_classes = ADMIN_ONLY
    serializer_class = AdminPatientSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        filters = AdminPatientFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return selectors.admin_patients(**filters.validated_data)


class AdminPatientDetailView(generics.RetrieveAPIView):
    permission_classes = ADMIN_ONLY
    serializer_class = PatientWorkSerializer

    def get_queryset(self):
        return selectors.patients_with_history()


class ReassignView(APIView):
    permission_classes = ADMIN_ONLY

    def post(self, request, pk):
        serializer = ReassignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reassign_patient(pk, serializer.validated_data["agent_id"])
        patient = selectors.admin_patients().get(pk=pk)
        return Response(AdminPatientSerializer(patient).data)


class FilterOptionsView(APIView):
    permission_classes = ADMIN_ONLY

    def get(self, request):
        options = selectors.filter_options()
        return Response(
            {
                "clinics": options.clinics,
                "visit_types": options.visit_types,
                "agents": UserSummarySerializer(options.agents, many=True).data,
            }
        )
