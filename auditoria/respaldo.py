#!/usr/bin/env python3
"""Cobertura del respaldo: tablas que carga la app contra las que entran al Excel diario. Uso: python3 auditoria/respaldo.py [tabla1,tabla2,...]
El argumento opcional es la lista de tablas públicas de la base (las llaves de `tablas` en mgm_auditoria())."""
import re, sys, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app = set(re.findall(r"'([a-z_]+)'", re.search(r"const TABLES = \[(.*?)\];", open(R + '/web/app.js').read(), re.S).group(1)))
bk = set(re.findall(r'"([a-z_]+)"', re.search(r"const TABLES = \[(.*?)\];", open(R + '/supabase/functions/daily-backup/index.ts').read(), re.S).group(1)))
base = set(sys.argv[1].split(',')) if len(sys.argv) > 1 else set()
print('en el respaldo:', len(bk))
print('en la app y fuera del respaldo:', sorted(app - bk))
if base: print('en la base y fuera del respaldo:', sorted(base - bk))
