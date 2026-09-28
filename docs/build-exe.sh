#!/usr/bin/env bash
# Build the offline Windows x64 game. Requires node 18+, npm, python3.
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
export ROOT
cd "$HERE"
if [ -f "$ROOT/open-world.html" ]; then cp "$ROOT/open-world.html" index.html; else cp "$ROOT/index.html" index.html; fi
mkdir -p models/city
cp "$ROOT"/models/{spider,hero,robot,boss,tokyo}.glb models/
cp "$ROOT/models/CREDITS.md" "$ROOT/models/hero-LICENSE.txt" models/
cp "$ROOT"/models/city/*.glb "$ROOT/models/city/LICENSE.txt" models/city/
npm install --no-audit --no-fund
npx electron-packager . LazijCity --platform=win32 --arch=x64 --electron-version=44.4.3 --asar --overwrite --out=package --app-version=1.4.0 --ignore="node_modules"
cd package/LazijCity-win32-x64
rm -f LICENSES.chromium.html
(cd locales && ls | grep -vE '^(en-US|ar)\.pak$' | xargs -r rm --)
cd ..
python3 - <<'PY'
import os,zipfile
out=os.path.join(os.environ['ROOT'],'LazijCity-win64.zip')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for root,dirs,files in os.walk('LazijCity-win32-x64'):
  for f in files:
   full=os.path.join(root,f);z.write(full,os.path.join('LazijCity',os.path.relpath(full,'LazijCity-win32-x64')))
print(out)
PY
