import django.db.models.fields.files
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("GoodGame", "0003_postvote_postvote_unique_post_vote_per_user_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="userprofile",
            name="profile_picture",
            field=django.db.models.fields.files.ImageField(
                blank=True, upload_to="profile_pictures/"
            ),
        ),
    ]
