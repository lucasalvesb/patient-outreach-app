from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

# username, password, first name, last name, is admin. Local demo only.
# The passwords avoid breached-password lists, which Chrome warns about on every login.
DEMO_USERS = [
    ("admin", "outreach-admin-2026", "Alex", "Morgan", True),
    ("agent1", "outreach-agent-2026", "Jamie", "Rivera", False),
    ("agent2", "outreach-agent-2026", "Sam", "Chen", False),
]


class Command(BaseCommand):
    help = "Create the demo admin and agent logins (existing users are left untouched)."

    def handle(self, *args, **options):
        User = get_user_model()
        for username, password, first_name, last_name, is_admin in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"first_name": first_name, "last_name": last_name, "is_staff": is_admin},
            )
            if created:
                user.set_password(password)
                user.save(update_fields=["password"])
                role = "admin" if is_admin else "agent"
                self.stdout.write(f"Created {role} '{username}' (password: {password})")
            else:
                self.stdout.write(f"'{username}' already exists; left unchanged")
