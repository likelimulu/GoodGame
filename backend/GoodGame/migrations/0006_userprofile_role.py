from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("GoodGame", "0005_postcomment"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Admin"),
                    ("contributor", "Contributor"),
                    ("developer", "Developer"),
                    ("moderator", "Moderator"),
                ],
                default="contributor",
                max_length=20,
            ),
        ),
    ]
