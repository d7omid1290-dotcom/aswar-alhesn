#!/usr/bin/env bash
# يبني نسخة معاينة ثابتة (وضع الشاشة الواحدة) في مجلد preview/
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
tar -C "$ROOT" --exclude=./node_modules --exclude=./.next --exclude=./out --exclude=./preview --exclude=./.git -cf - . | tar -C "$TMP" -xf -
ln -s "$ROOT/node_modules" "$TMP/node_modules"
rm -rf "$TMP/src/app/api" "$TMP/src/app/manifest.ts"
(cd "$TMP" && STATIC_PREVIEW=1 npx next build)
rm -rf "$ROOT/preview" && cp -r "$TMP/out" "$ROOT/preview" && rm -rf "$TMP"
echo "preview/ جاهز"
# مسارات نسبية حتى تعمل المعاينة من أي مجلد
cd "$ROOT/preview"
find . -name '*.html' -exec sed -i 's#"/_next/#"./_next/#g; s#"/assets/#"./assets/#g; s#"/icons/#"./icons/#g' {} +
find _next -name '*.js' -exec sed -i 's#"/_next/"#"./_next/"#g' {} +
find _next -name '*.css' -exec sed -i 's#/_next/static/media/#../media/#g' {} +
cp host.html index.html
