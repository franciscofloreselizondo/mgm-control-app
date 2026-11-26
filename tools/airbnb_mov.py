#!/usr/bin/env python3
"""Convierte los CSV de Airbnb (Ingresos > Cobros recibidos / Cobros pendientes > Exportar CSV)
al formato que recibe la base de MGM Control (airbnb_subir -> airbnb_cargar -> airbnb_aplicar).

Uso:  python3 tools/airbnb_mov.py salida.txt cobros_1.csv [cobros_2.csv ...] [airbnb_pending.csv]

- Airbnb falla si se exporta un rango largo: bajar los cobros recibidos mes por mes.
- El archivo de pendientes se reconoce por llamarse *pending*.
- La salida NO lleva nombres ni teléfonos de huéspedes. Un renglón por movimiento:
  fecha|grupo|tipo|codigo|depa|espacio|entrada|salida|estado|monto|bruto|pendiente
- Control: reservación + impuestos + ajustes + retenciones + resolución = depósitos (payout).
"""
import csv, io, sys, collections

# Nombre del anuncio en Airbnb -> código del depa en la app
MAPA = {'L-1806': 'Lobby 1806', 'C-801': 'Central', 'Acervo': 'Acervo', '2005-A': 'LHA', '2005-B': 'LHB', 'LOFT Lobito': 'Q-1003'}
PREFIJOS = [('Q-901', 'Q-901'), ('Neo-304', 'Neo-304'), ('MB1', 'LMB1'), ('MB2', 'MB2'), ('Elysian1309', 'Elyssian 1309'),
            ('Elysian', 'Elyssian 1809'), ('LH -', 'LH')]
GRUPO = {'Reservación': 'res', 'Impuestos liquidados como anfitrión': 'imp', 'Ajuste': 'aj', 'Ajuste de impuestos remitidos como anfitrión': 'aj',
         'Retención del IVA en México': 'ret', 'Retención del impuesto sobre la renta para México': 'ret',
         'Revocación de la retención del IVA para México': 'ret', 'Revocación de la retención del impuesto sobre la renta para México': 'ret',
         'Cobro de la resolución': 'resol', 'Ajuste de la resolución': 'resol', 'Payout': 'payout'}


def depa(esp):
    if not esp: return ''
    if esp in MAPA: return MAPA[esp]
    for pref, cod in PREFIJOS:
        if esp.startswith(pref): return cod
    return esp.split()[0] if esp.startswith('Q-') else '?'


def num(s):
    s = (s or '').replace(',', '').strip()
    try: return float(s) if s else 0.0
    except ValueError: return 0.0


def iso(s):
    s = (s or '').strip()
    if not s: return ''
    m, d, y = s.split('/')          # Airbnb exporta MM/DD/AAAA
    return '%s-%s-%s' % (y, m.zfill(2), d.zfill(2))


def limpio(s): return (s or '').replace('|', ' ').replace('\n', ' ').strip()


def main(salida, archivos):
    lineas = []; tot = collections.defaultdict(float); cnt = collections.Counter()
    for f in archivos:
        pend = 'pending' in f.lower()
        txt = open(f, 'rb').read().decode('utf-8-sig', errors='replace')
        filas = list(csv.reader(io.StringIO(txt))); h = filas[0]
        for r in filas[1:]:
            d = dict(zip(h, r)); t = d.get('Tipo', ''); g = GRUPO.get(t, 'otros')
            monto = num(d.get('Ingresos recibidos')) if g == 'payout' else num(d.get('Monto'))
            esp = limpio(d.get('Espacio', '').split('|')[0])[:40]
            lineas.append('|'.join([iso(d.get('Fecha')), g, limpio(t)[:70], limpio(d.get('Código de confirmación')), depa(esp), esp,
                                    iso(d.get('Fecha de inicio')), iso(d.get('Fecha de finalización')), limpio(d.get('Estado de la reservación')),
                                    '%.2f' % monto, ('%.2f' % num(d.get('Ingresos brutos'))) if g == 'res' else '', '1' if pend else '0']))
            k = ('pend_' if pend else '') + g; tot[k] += monto; cnt[k] += 1
    open(salida, 'w').write('\n'.join(lineas) + '\n')
    print('renglones', len(lineas))
    for k in sorted(tot): print('%-12s %5d %14.2f' % (k, cnt[k], tot[k]))
    desconocidos = sum(1 for l in lineas if l.split('|')[4] == '?')
    if desconocidos: print('OJO: %d renglones con un anuncio que no está en MAPA' % desconocidos)


if __name__ == '__main__':
    if len(sys.argv) < 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
