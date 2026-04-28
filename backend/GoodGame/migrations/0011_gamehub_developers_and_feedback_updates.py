from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("GoodGame", "0010_developerfeedback"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="gamehub",
            name="developers",
            field=models.ManyToManyField(
                blank=True,
                related_name="developed_hubs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="developerfeedback",
            name="from_user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="submitted_feedback",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddIndex(
            model_name="developerfeedback",
            index=models.Index(
                fields=["game_hub", "-created_at"],
                name="dev_fb_hub_created_idx",
            ),
        ),
    ]
