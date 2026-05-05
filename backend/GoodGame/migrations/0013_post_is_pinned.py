from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("GoodGame", "0012_merge_0010_notification_0011_gamehub_developers_and_feedback_updates"),
    ]

    operations = [
        migrations.AddField(
            model_name="post",
            name="is_pinned",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterModelOptions(
            name="post",
            options={"ordering": ["-is_pinned", "-created_at"]},
        ),
    ]
