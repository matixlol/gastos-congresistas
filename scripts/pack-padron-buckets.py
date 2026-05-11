#!/usr/bin/env python3
"""
Pack parse_padron.py's CUIT bucket files into range-readable pack files.

Input layout:
  202603/00/00.json.gz
  202603/00/01.json.gz
  ...

Output layout:
  202603-packed/manifest.json.gz
  202603-packed/00.pack
  202603-packed/01.pack
  ...

The manifest maps sha1(cuit)[:2] and sha1(cuit)[2:4] to byte offsets inside
the pack file. The browser fetches the manifest once, then fetches only the
small gzipped bucket it needs with an HTTP Range request.
"""

import argparse
import gzip
import json
import os
import shutil
from pathlib import Path


Manifest = dict[str, dict[str, tuple[int, int]]]


def write_manifest(path: Path, manifest: Manifest, compresslevel: int) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with gzip.open(tmp_path, "wt", encoding="utf-8", compresslevel=compresslevel) as f:
        json.dump(manifest, f, separators=(",", ":"))
    os.replace(tmp_path, path)


def pack_prefix(prefix_dir: Path, output_dir: Path, force: bool) -> tuple[dict[str, tuple[int, int]], int, int]:
    out_path = output_dir / f"{prefix_dir.name}.pack"
    if out_path.exists() and not force:
        raise FileExistsError(f"{out_path} already exists; pass --force to overwrite")

    files = sorted(prefix_dir.glob("*.json.gz"))
    offsets: dict[str, tuple[int, int]] = {}
    tmp_path = out_path.with_suffix(out_path.suffix + ".tmp")
    offset = 0

    with open(tmp_path, "wb") as out:
        for bucket_path in files:
            size = bucket_path.stat().st_size
            offsets[bucket_path.stem.removesuffix(".json")] = (offset, size)
            with open(bucket_path, "rb") as src:
                shutil.copyfileobj(src, out, length=1024 * 1024)
            offset += size

    os.replace(tmp_path, out_path)
    return offsets, len(files), offset


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("period_dir", type=Path, help="Input period directory, e.g. padron/202603")
    parser.add_argument("output_dir", type=Path, help="Output directory for pack files and manifest")
    parser.add_argument("--prefix", help="Only pack one two-hex-character prefix, e.g. 00")
    parser.add_argument("--force", action="store_true", help="Overwrite existing pack files and manifest")
    parser.add_argument("--compresslevel", type=int, default=6, choices=range(1, 10), metavar="1-9")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = args.output_dir / "manifest.json.gz"
    manifest: Manifest = {}
    if manifest_path.exists() and not args.force:
        with gzip.open(manifest_path, "rt", encoding="utf-8") as f:
            manifest = json.load(f)

    if args.prefix:
        prefix_dirs = [args.period_dir / args.prefix]
    else:
        prefix_dirs = [p for p in sorted(args.period_dir.iterdir()) if p.is_dir()]

    total_files = 0
    total_bytes = 0

    for prefix_dir in prefix_dirs:
        offsets, files, bytes_written = pack_prefix(prefix_dir, args.output_dir, args.force)
        manifest[prefix_dir.name] = offsets
        total_files += files
        total_bytes += bytes_written
        print(f"{prefix_dir.name}: {files} files -> {bytes_written / 1024 / 1024:.2f} MiB")

    write_manifest(manifest_path, manifest, args.compresslevel)
    print(f"Done. Packed {total_files} files into {len(prefix_dirs)} pack files.")
    print(f"Manifest: {manifest_path} ({manifest_path.stat().st_size / 1024:.1f} KiB)")
    print(f"Packed bytes: {total_bytes / 1024 / 1024:.2f} MiB")


if __name__ == "__main__":
    main()
