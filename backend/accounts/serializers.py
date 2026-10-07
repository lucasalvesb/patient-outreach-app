from django.contrib.auth import get_user_model
from rest_framework import serializers


class UserSummarySerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = ["id", "username", "display_name"]

    def get_display_name(self, user):
        return user.get_full_name() or user.username


class UserSerializer(UserSummarySerializer):
    is_admin = serializers.BooleanField(source="is_staff", read_only=True)

    class Meta(UserSummarySerializer.Meta):
        fields = UserSummarySerializer.Meta.fields + ["is_admin"]


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)
