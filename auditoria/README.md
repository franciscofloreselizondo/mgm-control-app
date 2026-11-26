# Auditoría de control

Revisión semanal de higiene de MGM Control App. Aquí vive solo el procedimiento; los datos de cada corrida no se suben al repositorio.

- `select mgm_auditoria();` — batería de solo lectura en la base (migración 032). Devuelve un JSON por dominio: operación, integridad, validez, duplicados, conciliación, completitud, acceso, cambios y tablas.
- `auditoria_corridas` — historial de corridas en la base (migración 033): resultado completo y hallazgos de cada una, para comparar semana contra semana.
- `python3 auditoria/reporte.py hallazgos.json salida.pdf` — arma el reporte en PDF.
- Respaldo: `python3 auditoria/respaldo.py` compara las tablas de la app contra las que entran al Excel diario.
