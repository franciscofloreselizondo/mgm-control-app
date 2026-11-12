#!/bin/sh
# Uso: ./bump.sh  -> sube la versión en app.js, version.json y sw.js
set -e; cd "$(dirname "$0")/web"
v=$(( $(grep -o "APP_VER = '[0-9]*'" app.js | grep -o '[0-9]*') + 1 ))
sed -i "s/APP_VER = '[0-9]*'/APP_VER = '$v'/" app.js; sed -i "s/mgm-v[0-9]*/mgm-v$v/" sw.js; echo "{\"v\":\"$v\"}" > version.json; echo "versión $v"
