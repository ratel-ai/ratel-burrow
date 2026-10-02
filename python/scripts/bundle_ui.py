"""Copy the built UI (packages/ui/dist) into the package before building a wheel."""

import shutil
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
src = here.parent.parent / "packages" / "ui" / "dist"
dst = here.parent / "src" / "ratel_burrow" / "ui"

if not (src / "index.html").is_file():
    sys.exit(f"bundle_ui: {src} has no index.html; run `pnpm build` at the repo root first.")
shutil.rmtree(dst, ignore_errors=True)
shutil.copytree(src, dst)
print(f"bundle_ui: {src} -> {dst}")
