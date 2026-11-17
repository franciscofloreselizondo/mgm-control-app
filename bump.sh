#!/bin/sh
# Uso: ./bump.sh  -> sube la versión en app.js, version.json, sw.js y los ?v= de index.html
# (así el HTML y el JS de una misma versión siempre viajan juntos; evita pantallas en blanco en iPhone)
set -e; cd "$(dirname "$0")/web"
v=$(( $(grep -o "APP_VER = '[0-9]*'" app.js | grep -o '[0-9]*') + 1 ))
sed -i "s/APP_VER = '[0-9]*'/APP_VER = '$v'/" app.js; sed -i "s/mgm-v[0-9]*/mgm-v$v/" sw.js
sed -i -E "s/(styles\.css|config\.js|mgmx\.js|app\.js)\?v=[0-9]+/\1?v=$v/g" index.html
echo "{\"v\":\"$v\"}" > version.json; echo "versión $v"
