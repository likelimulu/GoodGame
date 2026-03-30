import django.db.models.fields.files
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("GoodGame", "0002_gamehub_tag_post"),
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
