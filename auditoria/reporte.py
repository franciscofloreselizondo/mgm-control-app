#!/usr/bin/env python3
"""Reporte de auditoría de control en PDF.  Uso: python3 reporte.py hallazgos.json salida.pdf
El JSON trae: app, corrida, fecha, version, dictamen, resumen, dominios[{n,e,t}], hallazgos[{id,sev,dom,tit,ev,imp,acc,est}],
corregido[], cuadra[[control,resultado]], no_verificado[], decisiones[], metodo.  (e: ok | obs | mal)
Los datos de cada corrida NO se guardan en el repositorio."""
import json, sys
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

def limpia(x):  # el texto del JSON es texto plano: se escapa para que «P&L» o «<» no rompan el marcado
    if isinstance(x, str): return x.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    if isinstance(x, list): return [limpia(i) for i in x]
    if isinstance(x, dict): return {k: limpia(v) for k, v in x.items()}
    return x
D = limpia(json.load(open(sys.argv[1], encoding='utf-8'))); OUT = sys.argv[2]
F = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('R', F + 'DejaVuSans.ttf')); pdfmetrics.registerFont(TTFont('B', F + 'DejaVuSans-Bold.ttf'))
INK, GRIS, LINEA, FONDO = colors.HexColor('#23272a'), colors.HexColor('#5f6668'), colors.HexColor('#d9dcd8'), colors.HexColor('#f5f4ef')
VERDE, AMBAR, ROJO, BOSQUE = colors.HexColor('#2e7d4f'), colors.HexColor('#b26a00'), colors.HexColor('#b3261e'), colors.HexColor('#1f4d3f')
SEV = {'Alta': ROJO, 'Media': AMBAR, 'Baja': GRIS}
EST = {'ok': (VERDE, 'Bien'), 'obs': (AMBAR, 'Con observaciones'), 'mal': (ROJO, 'Requiere acción')}
def st(name, **k): return ParagraphStyle(name, fontName=k.pop('font', 'R'), textColor=k.pop('color', INK), **k)
P = st('p', fontSize=9.6, leading=13.6); PS = st('ps', fontSize=8.6, leading=12, color=GRIS)
H2 = st('h2', font='B', fontSize=13, leading=17, spaceBefore=12, spaceAfter=6, color=BOSQUE)
TIT = st('tit', font='B', fontSize=10.8, leading=14.5)
hexa = lambda c: '#%02x%02x%02x' % (int(c.red * 255), int(c.green * 255), int(c.blue * 255))
def chip(txt, c): return f'<font name="B" color="{hexa(c)}">{txt}</font>'
W = letter[0] - 32 * mm

def pagina(c, doc):
    c.saveState()
    if doc.page == 1:
        c.setFillColor(BOSQUE); c.rect(0, letter[1] - 40 * mm, letter[0], 40 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont('B', 19); c.drawString(16 * mm, letter[1] - 19 * mm, 'Auditoría de control')
        c.setFont('R', 11.5); c.drawString(16 * mm, letter[1] - 27 * mm, f"{D['app']} · versión {D['version']}")
        c.setFont('R', 9.5); c.drawString(16 * mm, letter[1] - 34 * mm, f"Corrida {D['corrida']} · {D['fecha_larga']}")
    c.setFont('R', 7.8); c.setFillColor(GRIS)
    c.drawString(16 * mm, 10 * mm, f"Auditoría de control · {D['app']} · corrida {D['corrida']} · {D['fecha_larga']}")
    c.drawRightString(letter[0] - 16 * mm, 10 * mm, f'Página {doc.page}')
    c.restoreState()

S = [Spacer(1, 30 * mm)]
H = D['hallazgos']; n = lambda s: sum(1 for h in H if h['sev'] == s); corr = sum(1 for h in H if h['est'].startswith('Corregido'))
tiles = [[Paragraph(f'<font name="B" size="20" color="{hexa(c)}">{v}</font>', st('k', alignment=1, leading=24)) for v, c in
          ((n('Alta'), ROJO), (n('Media'), AMBAR), (n('Baja'), GRIS), (corr, VERDE))],
         [Paragraph(t, st('kl', fontSize=8.4, alignment=1, color=GRIS, leading=11)) for t in ('Severidad alta', 'Severidad media', 'Severidad baja', 'Corregidos en la corrida')]]
T = Table(tiles, colWidths=[W / 4] * 4); T.setStyle(TableStyle([('BOX', (0, 0), (-1, -1), .6, LINEA), ('INNERGRID', (0, 0), (-1, -1), .6, LINEA), ('LINEBELOW', (0, 0), (-1, 0), 0, colors.white),
    ('BACKGROUND', (0, 0), (-1, -1), FONDO), ('TOPPADDING', (0, 0), (-1, 0), 8), ('BOTTOMPADDING', (0, 1), (-1, 1), 8), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
S += [T, Spacer(1, 8), Paragraph(f'<font name="B">Dictamen: {D["dictamen"]}.</font> {D["resumen"]}', P)]

S.append(Paragraph('Tablero por dominio', H2))
rows = [[Paragraph(f'<font name="B">{d["n"]}</font>', P), Paragraph(chip(EST[d['e']][1], EST[d['e']][0]), P), Paragraph(d['t'], PS)] for d in D['dominios']]
T = Table(rows, colWidths=[W * .27, W * .2, W * .53]); T.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -2), .5, LINEA), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5), ('LEFTPADDING', (0, 0), (0, -1), 0)]))
S.append(T)

if D.get('corregido'):
    S.append(Paragraph('Corregido durante la corrida', H2))
    S += [Paragraph(f'<font color="{hexa(VERDE)}">■</font>&nbsp; {x}', st('li', fontSize=9.6, leading=13.6, leftIndent=12, firstLineIndent=-12, spaceAfter=3)) for x in D['corregido']]

S.append(Paragraph('Hallazgos, de mayor a menor severidad', H2))
for h in H:
    c = SEV[h['sev']]; ec = VERDE if h['est'].startswith('Corregido') else INK
    cab = Table([[Paragraph(f'{chip(h["id"] + " · " + h["sev"], c)} <font color="{hexa(GRIS)}">· {h["dom"]}</font>', P), Paragraph(chip(h['est'], ec), st('r', fontSize=9, alignment=2, leading=13))]], colWidths=[W * .58 - 10, W * .42 - 10])
    cab.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 2), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    cuerpo = [cab, Paragraph(h['tit'], TIT), Spacer(1, 3), Paragraph(f'<font name="B">Evidencia.</font> {h["ev"]}', P)]
    if h.get('imp'): cuerpo.append(Paragraph(f'<font name="B">Por qué importa.</font> {h["imp"]}', P))
    cuerpo.append(Paragraph(f'<font name="B">Acción.</font> {h["acc"]}', P))
    caja = Table([['', cuerpo]], colWidths=[4, W - 4]); caja.setStyle(TableStyle([('BACKGROUND', (0, 0), (0, 0), c), ('LEFTPADDING', (1, 0), (1, 0), 10), ('RIGHTPADDING', (1, 0), (1, 0), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 8), ('BOX', (0, 0), (-1, -1), .6, LINEA), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    S += [KeepTogether(caja), Spacer(1, 7)]

S.append(Paragraph('Lo que sí cuadra', H2))
rows = [[Paragraph(a, P), Paragraph(f'<font name="B">{b}</font>', P)] for a, b in D['cuadra']]
T = Table(rows, colWidths=[W * .5, W * .5]); T.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -2), .5, LINEA), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4), ('LEFTPADDING', (0, 0), (0, -1), 0)]))
S.append(T)
li = st('li2', fontSize=9.6, leading=13.6, leftIndent=14, firstLineIndent=-14, spaceAfter=4)
S.append(Paragraph('Lo que no se verificó en esta corrida', H2)); S += [Paragraph('–&nbsp; ' + x, li) for x in D['no_verificado']]
S.append(Paragraph('Decisiones que necesito de ti', H2)); S += [Paragraph(f'<font name="B">{i}.</font>&nbsp; {x}', li) for i, x in enumerate(D['decisiones'], 1)]
S.append(Paragraph('Método', H2)); S.append(Paragraph(D['metodo'], PS))
SimpleDocTemplate(OUT, pagesize=letter, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=17 * mm,
                  title=f"Auditoría de control · {D['app']} · corrida {D['corrida']}", author='MGM Housing Management').build(S, onFirstPage=pagina, onLaterPages=pagina)
print('listo', OUT)
