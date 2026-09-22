#!/usr/bin/env bash
# Rebuild the Windows .exe package from the current open-world build.
# Needs: node 18+, npm. First run downloads Electron win64 runtime (~110MB, cached in ~/.cache/electron).
set -euo pipefail
cd "$(dirname "$0")"
cp ../index.html index.html
[ -d node_modules ] || npm install --no-audit --no-fund @electron/packager@18
npx electron-packager . "LazijCity" --platform=win32 --arch=x64 \
  --electron-version=44.4.3 --asar --overwrite --out=package \
  --app-version=1.0.0 --ignore="node_modules"
cd package/LazijCity-win32-x64
rm -f LICENSES.chromium.html
(cd locales && ls | grep -vE "^(en-US|ar)\.pak$" | xargs -r rm --)
cd .. && python3 - <<'PY'
import zipfile, os
with zipfile.ZipFile('/home/user/LazijCity-win64.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, dirs, files in os.walk('LazijCity-win32-x64'):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.join('LazijCity', os.path.relpath(full, 'LazijCity-win32-x64')))
print('zip rebuilt: /home/user/LazijCity-win64.zip')
PY
