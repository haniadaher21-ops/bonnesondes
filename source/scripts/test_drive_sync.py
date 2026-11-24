import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from sync_drive_images import EXPECTED_FOLDER, plan_new_images, apply_images


class DriveImageImporterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.assets = self.dir / "images"
        self.assets.mkdir()
        self.manifest_path = self.dir / "image-bank.json"
        self.manifest = {"version": 1, "sourceFolder": EXPECTED_FOLDER, "images": []}
        self.sample = self.dir / "new illustration.png"
        Image.new("RGB", (80, 100), color=(255, 120, 20)).save(self.sample)
        self.manifest_path.write_text(json.dumps(self.manifest), encoding="utf8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_new_image_is_added_only_once_and_preserves_old_records(self):
        new = plan_new_images([self.sample], self.manifest, self.assets)
        self.assertEqual(len(new), 1)
        self.assertRegex(new[0]["id"], r"^drive-[0-9a-f]{16}$")
        apply_images(new, self.manifest, self.assets, self.manifest_path)
        record = self.manifest["images"][0]
        self.assertTrue((self.assets / (record["id"] + ".jpg")).exists())
        self.assertEqual(record["sourceName"], "new illustration.png")
        self.assertEqual(record["sourceSha256"], hashlib.sha256(self.sample.read_bytes()).hexdigest())
        self.assertEqual(plan_new_images([self.sample], self.manifest, self.assets), [])
        self.assertEqual(len(json.loads(self.manifest_path.read_text())["images"]), 1)

    def test_duplicates_by_content_are_not_added(self):
        duplicate = self.dir / "duplicate.png"
        duplicate.write_bytes(self.sample.read_bytes())
        new = plan_new_images([self.sample, duplicate], self.manifest, self.assets)
        self.assertEqual(len(new), 1)

    def test_invalid_or_oversized_images_fail_closed(self):
        fake = self.dir / "bad.jpg"
        fake.write_bytes(b"not a jpeg")
        with self.assertRaises(ValueError):
            plan_new_images([fake], self.manifest, self.assets)
        fake.write_bytes(b"x" * (12 * 1024 * 1024 + 1))
        with self.assertRaises(ValueError):
            plan_new_images([fake], self.manifest, self.assets)

    def test_never_silently_accepts_a_different_source_folder(self):
        modified = {**self.manifest, "sourceFolder":"https://drive.google.com/drive/folders/wrong"}
        with self.assertRaises(ValueError):
            plan_new_images([self.sample], modified, self.assets)

    def test_does_not_write_for_existing_images(self):
        self.assertFalse(self.assets.joinpath("new.png").exists())
        plan_new_images([self.sample], self.manifest, self.assets)
        self.assertEqual(list(self.assets.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
