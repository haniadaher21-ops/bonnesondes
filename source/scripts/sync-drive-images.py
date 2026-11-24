#!/usr/bin/env python3
"""Import public images from the owner's BONNES ONDES / PHOTOS Drive folder.

Run from source/ with --check for CI (never writes) or --apply for the daily
GitHub workflow. The website serves local copies, not short-lived Drive URLs.
Existing published edition coverImageIds are never edited.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from pathlib import Path

SOURCE_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = SOURCE_ROOT / "editorial" / "image-bank.json"
ASSETS = SOURCE_ROOT / "public" / "edition-images"
EXPECTED_FOLDER = "https://drive.google.com/drive/folders/1gIRXeHlolANWpqWSdlrENC2zFORWRCp3"
MAX_BYTES = 12 * 1024 * 1024
MAX_PIXELS = 28_000_000
MAX_DIMENSION = 8_000


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def plan_new_images(paths: list[Path], manifest: dict, assets: Path = ASSETS) -> list[dict]:
    """Identify only genuinely new content without modifying old editions."""
    if manifest.get("sourceFolder") != EXPECTED_FOLDER:
        raise ValueError("Unexpected Drive source folder")
    existing_ids = {image["id"] for image in manifest["images"]}
    existing_digests = set()
    for image in manifest["images"]:
        if isinstance(image.get("sourceSha256"), str):
            existing_digests.add(image["sourceSha256"])
        path = assets / Path(image["file"]).name
        if path.is_file():
            existing_digests.add(sha256(path))
        else:
            raise FileNotFoundError(f"Missing existing illustration: {path.name}")
    new = []
    for path in sorted(paths, key=lambda item: item.name.lower()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
            raise ValueError(f"Unsupported Drive file: {path.name}")
        size = path.stat().st_size
        if not 0 < size <= MAX_BYTES:
            raise ValueError(f"Invalid file size: {path.name}")
        digest = sha256(path)
        if digest in existing_digests:
            continue
        from PIL import Image, UnidentifiedImageError

        try:
            with Image.open(path) as artwork:
                artwork.verify()
            with Image.open(path) as artwork:
                if artwork.width * artwork.height > MAX_PIXELS or max(artwork.size) > MAX_DIMENSION:
                    raise ValueError(f"Image too large: {path.name}")
                if artwork.format not in ("JPEG", "PNG", "WEBP"):
                    raise ValueError(f"Unsupported image format: {path.name}")
        except (UnidentifiedImageError, OSError) as error:
            raise ValueError(f"Invalid artwork: {path.name}") from error
        identifier = "drive-" + digest[:16]
        if identifier in existing_ids:
            raise ValueError("Illustration ID collision")
        new.append({"id": identifier, "file": f"/edition-images/{identifier}.jpg",
                    "alt": "Illustration musicale de la banque Bonnes Ondes",
                    "sourceSha256": digest, "sourceName": path.name,
                    "_path": path})
        existing_ids.add(identifier)
        existing_digests.add(digest)
    return new


def apply_images(new: list[dict], manifest: dict, assets: Path = ASSETS,
                 manifest_path: Path = MANIFEST) -> None:
    from PIL import Image, ImageOps

    assets.mkdir(parents=True, exist_ok=True)
    for item in new:
        with Image.open(item["_path"]) as source:
            transformed = ImageOps.exif_transpose(source).convert("RGB")
            transformed.thumbnail((2400, 2400))
            transformed.save(assets / Path(item["file"]).name, "JPEG",
                             quality=88, optimize=True, progressive=True)
        manifest["images"].append({key: value for key, value in item.items() if key != "_path"})
    if new:
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def sync(folder_paths: list[Path], manifest: dict, *, apply: bool) -> list[dict]:
    new = plan_new_images(folder_paths, manifest)
    if apply:
        apply_images(new, manifest)
    return new


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    import gdown

    manifest = json.loads(MANIFEST.read_text(encoding="utf8"))
    with tempfile.TemporaryDirectory(prefix="bonnes-ondes-drive-") as folder:
        paths = gdown.download_folder(url=EXPECTED_FOLDER, output=folder,
                                      quiet=True, use_cookies=False, remaining_ok=True)
        if not paths:
            raise RuntimeError("Google Drive returned no images; refusing to overwrite the bank")
        new = sync([Path(path) for path in paths], manifest, apply=args.apply)
    print(json.dumps({"status": "ok", "mode": "apply" if args.apply else "check",
                      "driveFiles": len(paths), "newImages": len(new),
                      "newIds": [item["id"] for item in new]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
