# -*- coding: utf-8 -*-
import math
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, PageBreak, Flowable, KeepTogether)

FD = "/System/Library/Fonts/Supplemental/"
import os, sys
# Saida: 1o argumento, ou o PDF de exemplo ao lado deste script.
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "desafio_profissional_parceiro_outubro_2026.pdf")
pdfmetrics.registerFont(TTFont("Arial", FD + "Arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", FD + "Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Italic", FD + "Arial Italic.ttf"))
pdfmetrics.registerFont(TTFont("Arial-BoldItalic", FD + "Arial Bold Italic.ttf"))
pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold",
                              italic="Arial-Italic", boldItalic="Arial-BoldItalic")

H = colors.HexColor
INK = H("#1f2933"); MUTED = H("#52606d"); LINE = H("#d9dee4"); WHITE = colors.white
BLUE = H("#1d4ed8"); BLUE_T = H("#eaf0ff")
RED = H("#b91c1c"); RED_T = H("#fdeeee")
PURP = H("#6d28d9"); PURP_T = H("#f1ebfd")
GOLD = H("#E8A317"); GOLD_T = H("#fff6df"); GOLD_D = H("#7a4d00")
GREEN = H("#146C34"); GREEN_T = H("#e8f5ed")
SLATE = H("#243447")
GREY_T = H("#f3f4f6")

W = 182 * mm  # largura útil
NB = " "

def S(name, **kw):
    base = dict(fontName="Arial", fontSize=10.5, leading=14.5, textColor=INK)
    base.update(kw)
    return ParagraphStyle(name, **base)

body = S("body", fontSize=11, leading=15.5)
body_b = S("body_b", fontName="Arial-Bold", fontSize=11, leading=15.5)
small = S("small", fontSize=9.5, leading=13, textColor=MUTED)
h1 = S("h1", fontName="Arial-Bold", fontSize=17, leading=21)
txt_white = S("tw", fontName="Arial-Bold", fontSize=11, leading=14, textColor=WHITE)

def P(t, st=body): return Paragraph(t, st)

# ---------------------------------------------------------------- ícones
class Icon(Flowable):
    def __init__(self, kind, size=9*mm, color=INK, bg=None, pad=0.18):
        super().__init__()
        self.kind, self.size, self.color, self.bg, self.pad = kind, size, color, bg, pad
    def wrap(self, aw, ah): return self.size, self.size
    def draw(self):
        c = self.canv; s = self.size
        c.saveState()
        if self.bg is not None:
            c.setFillColor(self.bg); c.circle(s/2, s/2, s/2, stroke=0, fill=1)
            p = s * self.pad
        else:
            p = 0
        k = s - 2*p
        c.translate(p, p); c.scale(k, k)
        c.setFillColor(self.color); c.setStrokeColor(self.color)
        c.setLineCap(1); c.setLineJoin(1)
        getattr(self, "g_" + self.kind)(c)
        c.restoreState()
    # --- glifos em coordenadas 0..1
    def g_person(self, c):
        c.circle(.5, .74, .2, stroke=0, fill=1)
        p = c.beginPath(); p.moveTo(.08, 0); p.curveTo(.08, .52, .92, .52, .92, 0); p.close()
        c.drawPath(p, stroke=0, fill=1)
    def g_star(self, c):
        pts = []
        for i in range(10):
            r = .52 if i % 2 == 0 else .22
            a = math.pi/2 + i*math.pi/5
            pts.append((.5 + r*math.cos(a), .46 + r*math.sin(a)))
        p = c.beginPath(); p.moveTo(*pts[0])
        for q in pts[1:]: p.lineTo(*q)
        p.close(); c.drawPath(p, stroke=0, fill=1)
    def g_target(self, c):
        c.setLineWidth(.085)
        c.circle(.5, .5, .44, stroke=1, fill=0); c.circle(.5, .5, .26, stroke=1, fill=0)
        c.circle(.5, .5, .09, stroke=0, fill=1)
    def g_scissors(self, c):
        c.setLineWidth(.1)
        c.circle(.22, .2, .15, stroke=1, fill=0); c.circle(.78, .2, .15, stroke=1, fill=0)
        c.line(.3, .32, .86, .96); c.line(.7, .32, .14, .96)
    def g_polish(self, c):
        c.roundRect(.14, .02, .72, .54, .12, stroke=0, fill=1)
        c.rect(.42, .56, .16, .12, stroke=0, fill=1)
        c.roundRect(.34, .72, .32, .27, .05, stroke=0, fill=1)
    def g_sparkle(self, c):
        p = c.beginPath()
        pts = [(.46,1),(.58,.62),(.92,.5),(.58,.38),(.46,0),(.34,.38),(0,.5),(.34,.62)]
        p.moveTo(*pts[0])
        for q in pts[1:]: p.lineTo(*q)
        p.close(); c.drawPath(p, stroke=0, fill=1)
        c.circle(.9, .88, .08, stroke=0, fill=1); c.circle(.1, .12, .06, stroke=0, fill=1)
    def g_trophy(self, c):
        p = c.beginPath(); p.moveTo(.22, .98); p.lineTo(.78, .98)
        p.curveTo(.78, .6, .64, .44, .5, .44); p.curveTo(.36, .44, .22, .6, .22, .98); p.close()
        c.drawPath(p, stroke=0, fill=1)
        c.setLineWidth(.07)
        for sx in (1, -1):
            x0 = .5 - sx*.28
            q = c.beginPath(); q.moveTo(x0, .88); q.curveTo(.5 - sx*.55, .9, .5 - sx*.55, .55, .5 - sx*.3, .56)
            c.drawPath(q, stroke=1, fill=0)
        c.rect(.44, .2, .12, .26, stroke=0, fill=1); c.roundRect(.26, .02, .48, .17, .04, stroke=0, fill=1)
    def g_coin(self, c):
        c.circle(.5, .5, .5, stroke=0, fill=1)
        c.setFillColor(WHITE); c.setFont("Arial-Bold", .4); c.drawCentredString(.5, .36, "R$")
    def g_gift(self, c):
        c.rect(.1, .02, .8, .5, stroke=0, fill=1); c.rect(.04, .52, .92, .2, stroke=0, fill=1)
        c.setFillColor(WHITE); c.rect(.43, .02, .14, .7, stroke=0, fill=1)
        c.setStrokeColor(self.color); c.setLineWidth(.07)
        c.ellipse(.22, .72, .5, .94, stroke=1, fill=0); c.ellipse(.5, .72, .78, .94, stroke=1, fill=0)
    def g_phone(self, c):
        c.setLineWidth(.08); c.roundRect(.24, .02, .52, .96, .1, stroke=1, fill=0)
        c.circle(.5, .13, .045, stroke=0, fill=1)
        c.setLineWidth(.06); c.line(.36, .78, .64, .78); c.line(.36, .62, .64, .62); c.line(.36, .46, .54, .46)
    def g_check(self, c):
        c.setLineWidth(.13); c.setLineCap(1); c.setLineJoin(1)
        p = c.beginPath(); p.moveTo(.08, .5); p.lineTo(.36, .2); p.lineTo(.94, .8)
        c.drawPath(p, stroke=1, fill=0)
    def g_calendar(self, c):
        c.setLineWidth(.08); c.roundRect(.04, .04, .92, .82, .1, stroke=1, fill=0)
        c.rect(.04, .62, .92, .24, stroke=0, fill=1)
        c.setLineWidth(.09); c.line(.28, .74, .28, 1); c.line(.72, .74, .72, 1)
        for x in (.28, .5, .72):
            for y in (.18, .38):
                c.rect(x-.05, y, .1, .1, stroke=0, fill=1)
    def g_info(self, c):
        c.setLineWidth(.085); c.circle(.5, .5, .46, stroke=1, fill=0)
        c.circle(.5, .74, .06, stroke=0, fill=1); c.roundRect(.45, .24, .1, .3, .04, stroke=0, fill=1)
    def g_cross(self, c):
        c.setLineWidth(.13); c.line(.15, .15, .85, .85); c.line(.15, .85, .85, .15)

def ic(kind, size=9*mm, color=INK, bg=None, pad=.2): return Icon(kind, size, color, bg, pad)

def disc(kind, color, size=10*mm):
    """ícone branco sobre disco colorido"""
    return Icon(kind, size, WHITE, color, .22)

def soft(kind, color, tint, size=10*mm):
    return Icon(kind, size, color, tint, .22)

# ---------------------------------------------------------------- blocos
def stylebase(extra=None, pad=0):
    base = [("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("LEFTPADDING", (0,0), (-1,-1), pad), ("RIGHTPADDING", (0,0), (-1,-1), pad),
            ("TOPPADDING", (0,0), (-1,-1), pad), ("BOTTOMPADDING", (0,0), (-1,-1), pad)]
    return base + (extra or [])

def section(title, color, num=None):
    """título de seção com barra de cor"""
    t = Table([[P(title, h1)]], colWidths=[W])
    t.setStyle(TableStyle(stylebase([("LINEBEFORE", (0,0), (0,0), 4, color),
                                     ("LEFTPADDING", (0,0), (0,0), 9),
                                     ("TOPPADDING", (0,0), (-1,-1), 2), ("BOTTOMPADDING", (0,0), (-1,-1), 2)])))
    return t

def chip(text, color, w, fg=WHITE, size=10):
    st = S("chip", fontName="Arial-Bold", fontSize=size, leading=size+2, textColor=fg, alignment=1)
    t = Table([[P(text, st)]], colWidths=[w])
    t.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), color),
                                     ("ROUNDEDCORNERS", [4,4,4,4]),
                                     ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 5)])))
    return t

def chips_row(items, widths, gap=3*mm):
    cells, cw = [], []
    for i, ((txt, col, fg), w) in enumerate(zip(items, widths)):
        if i: cells.append(""); cw.append(gap)
        cells.append(chip(txt, col, w, fg)); cw.append(w)
    t = Table([cells], colWidths=cw)
    t.setStyle(TableStyle(stylebase()))
    return t

def card(rows, colw, bg, border, extra=None, pad=7):
    t = Table(rows, colWidths=colw)
    t.setStyle(TableStyle(stylebase([
        ("BACKGROUND", (0,0), (-1,-1), bg), ("BOX", (0,0), (-1,-1), 0.8, border),
        ("ROUNDEDCORNERS", [6,6,6,6]),
        ("LEFTPADDING", (0,0), (-1,-1), pad), ("RIGHTPADDING", (0,0), (-1,-1), pad),
        ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5)] + (extra or []))))
    return t

# ---------------------------------------------------------------- página 1
def pagina1():
    f = []
    # cabeçalho
    ttl = S("ttl", fontName="Arial-Bold", fontSize=27, leading=31, textColor=WHITE)
    sub = S("sub", fontName="Arial-Bold", fontSize=15, leading=19, textColor=H("#ffd37a"))
    head = Table([[Icon("star", 20*mm, GOLD, None, 0), [P("Desafio do<br/>Profissional Parceiro", ttl), Spacer(1, 2), P("Regras de outubro de 2026", sub)]]],
                 colWidths=[27*mm, W - 27*mm])
    head.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), SLATE), ("ROUNDEDCORNERS", [8,8,8,8]),
                                        ("LEFTPADDING", (0,0), (0,0), 12), ("TOPPADDING", (0,0), (-1,-1), 14),
                                        ("BOTTOMPADDING", (0,0), (-1,-1), 14)])))
    f += [head, Spacer(1, 6*mm)]
    f += [Spacer(1, 2*mm)]

    # 1. como funciona
    f += [section("Como funciona", SLATE), Spacer(1, 3*mm)]
    mw = 4*mm
    rows = []
    def item(icon, content): rows.append([icon, content])
    item(soft("target", SLATE, GREY_T),
         [P("O desafio do mês tem <b>três áreas</b>: Cabelo, Unhas e Estética.", body),
          Spacer(1, 1.5*mm),
          P("<b>Maquiagem não participa em outubro.</b>", S("m", fontSize=10.5, textColor=MUTED))])
    item(soft("person", SLATE, GREY_T), P("Cada profissional <b>junta pontos durante o mês</b>.", body))
    item(soft("trophy", GOLD_D, GOLD_T),
         P("Em cada área, o prêmio vai <b>só para o 1º colocado</b> — e só se ele <b>bater as metas mínimas</b> da área.", body))
    item(soft("phone", SLATE, GREY_T),
         P("Os pontos aparecem no <b>site do desafio (Studio X)</b>. Eles atualizam quando a página é aberta ou recarregada.", body))
    t = Table(rows, colWidths=[15*mm, W - 15*mm])
    t.setStyle(TableStyle(stylebase([("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
                                     ("LINEBELOW", (1,0), (1,-2), .5, LINE)])))
    f += [t, Spacer(1, 7*mm)]

    # 2. como ganhar pontos
    f += [section("Como ganhar pontos", SLATE), Spacer(1, 1.5*mm),
          P("Vale para as três áreas.", S("v", fontSize=10.5, textColor=MUTED)), Spacer(1, 2.5*mm)]
    big = S("big", fontName="Arial-Bold", fontSize=30, leading=32, textColor=WHITE, alignment=1)
    bigs = S("bigs", fontName="Arial-Bold", fontSize=11, leading=12, textColor=WHITE, alignment=1)
    def pts_block(n, lab, col):
        t = Table([[P(n, big)], [P(lab, bigs)]], colWidths=[30*mm])
        t.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), col), ("ROUNDEDCORNERS", [6,6,6,6]),
                                         ("TOPPADDING", (0,0), (0,0), 6), ("BOTTOMPADDING", (0,0), (0,0), 0),
                                         ("TOPPADDING", (0,1), (0,1), 0), ("BOTTOMPADDING", (0,1), (0,1), 7)])))
        return t
    lh = S("lh", fontName="Arial-Bold", fontSize=12.5, leading=16)
    nt = S("nt", fontSize=10.5, leading=14, textColor=MUTED)
    r1 = [pts_block("2", "pontos", SLATE), soft("person", SLATE, GREY_T, 11*mm),
          [P("Cada cliente atendido no dia", lh), P("O mesmo cliente no mesmo dia conta só 1 vez.", nt)]]
    r2 = [pts_block("3", "pontos", GOLD), soft("star", GOLD_D, GOLD_T, 11*mm),
          [P("Cada estrela do Google aprovada", lh), P("Conta a estrela cadastrada em outubro.", nt)]]
    r3 = [pts_block("+", "extra", GREEN), soft("target", GREEN, GREEN_T, 11*mm),
          [P("Serviço da meta de cada área", lh),
           P('<font color="#1d4ed8"><b>Cabelo:</b></font> 5 pontos por tratamento das suas marcas<br/>'
             '<font color="#b91c1c"><b>Unhas:</b></font> 3 pontos por SPA dos Pés<br/>'
             '<font color="#6d28d9"><b>Estética:</b></font> 3 pontos por Limpeza de Pele',
             S("t3", fontSize=10.5, leading=14.5))]]
    # bloco de pontos do "3" usa texto escuro sobre dourado: contraste
    t = Table([r1, r2, r3], colWidths=[32*mm, 15*mm, W - 47*mm])
    t.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), WHITE), ("BOX", (0,0), (-1,-1), .8, LINE),
                                     ("LINEBELOW", (0,0), (-1,-2), .6, LINE), ("ROUNDEDCORNERS", [6,6,6,6]),
                                     ("LEFTPADDING", (0,0), (0,-1), 6), ("TOPPADDING", (0,0), (-1,-1), 7),
                                     ("BOTTOMPADDING", (0,0), (-1,-1), 7)])))
    f += [t, Spacer(1, 7*mm)]

    # prêmios de relance
    f += [section("Os prêmios de relance", SLATE), Spacer(1, 3*mm)]
    cw4 = (W - 3*3*mm) / 4
    def mini(titulo, val, extra, col):
        a = S("a", fontName="Arial-Bold", fontSize=10, leading=12, textColor=WHITE, alignment=1)
        b = S("b", fontName="Arial-Bold", fontSize=14, leading=17, textColor=INK, alignment=1)
        c_ = S("c", fontSize=9, leading=11.5, textColor=MUTED, alignment=1)
        t = Table([[P(titulo, a)], [[P(val, b), P(extra, c_)]]], colWidths=[cw4])
        t.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,0), col), ("BOX", (0,0), (-1,-1), .8, col),
                                         ("ROUNDEDCORNERS", [6,6,6,6]),
                                         ("TOPPADDING", (0,0), (-1,0), 4), ("BOTTOMPADDING", (0,0), (-1,0), 5),
                                         ("TOPPADDING", (0,1), (-1,1), 7), ("BOTTOMPADDING", (0,1), (-1,1), 7),
                                         ("BACKGROUND", (0,1), (-1,1), WHITE)])))
        return t
    cells, cws = [], []
    items = [("CABELO", f"R${NB}250,00", "1º colocado<br/>&nbsp;", BLUE), ("UNHAS", f"R${NB}150,00", "1º colocado<br/>+ prêmio surpresa", RED),
             ("ESTÉTICA", f"R${NB}150,00", "1º colocado<br/>+ prêmio surpresa", PURP), ("BÔNUS", f"R${NB}5,00", "por estrela do Google<br/>&nbsp;", GREEN)]
    for i, it in enumerate(items):
        if i: cells.append(""); cws.append(3*mm)
        cells.append(mini(*it)); cws.append(cw4)
    t = Table([cells], colWidths=cws); t.setStyle(TableStyle(stylebase()))
    f += [t]
    return f

# ---------------------------------------------------------------- página 2
def area_card(nome, cor, tint, icon, premio, premio_ex, servico_big, servico_unid, servico_txt,
              metas, estrelas_txt, extra_note=None, bh=22*mm):
    nm = S("nm", fontName="Arial-Bold", fontSize=20, leading=24, textColor=WHITE)
    pc = S("pc", fontName="Arial-Bold", fontSize=8.5, leading=10.5, textColor=WHITE, alignment=2)
    pv = S("pv", fontName="Arial-Bold", fontSize=17, leading=20, textColor=WHITE, alignment=2)
    pv2 = S("pv2", fontName="Arial-Bold", fontSize=10.5, leading=13, textColor=WHITE, alignment=2)
    prem = [P("PRÊMIO DO 1º COLOCADO", pc), P(premio, pv)]
    if premio_ex: prem.append(P(premio_ex, pv2))
    lab = S("lab", fontName="Arial-Bold", fontSize=9, leading=11, textColor=cor)
    bn = S("bn", fontName="Arial-Bold", fontSize=28, leading=30, textColor=cor, alignment=1)
    bu = S("bu", fontName="Arial-Bold", fontSize=9.5, leading=11.5, textColor=INK, alignment=1)
    bt = S("bt", fontSize=9.5, leading=12.5, textColor=INK, alignment=1)
    def box(big, unit, txt, cw):
        inner = [P(big, bn), P(unit, bu)]
        if txt: inner.append(P(txt, bt))
        t = Table([[inner]], colWidths=[cw], rowHeights=[bh])
        t.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), WHITE), ("BOX", (0,0), (-1,-1), .8, cor),
                                         ("ROUNDEDCORNERS", [6,6,6,6]),
                                         ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
                                         ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5)])))
        return t
    inner_w = W - 14
    g = 4*mm
    bw = (inner_w - 2*g) / 3
    boxes = [box(servico_big, servico_unid, servico_txt, bw), "", box(metas[0][0], metas[0][1], None, bw), "",
             box(metas[1][0], metas[1][1], None, bw)]
    boxes_t = Table([boxes], colWidths=[bw, g, bw, g, bw])
    boxes_t.setStyle(TableStyle(stylebase([("VALIGN", (0,0), (-1,-1), "TOP")])))
    labs = Table([[P("VALE PONTOS EXTRAS", lab), "", P("METAS MÍNIMAS PARA LEVAR O PRÊMIO <font color='#52606d'>(as duas)</font>", lab)]],
                 colWidths=[bw, g, 2*bw + g])
    labs.setStyle(TableStyle(stylebase()))
    st_e = S("st_e", fontSize=10.5, leading=14)
    star_row = Table([[Icon("star", 6*mm, GOLD, None, 0), P(estrelas_txt, st_e)]], colWidths=[9*mm, inner_w - 9*mm])
    star_row.setStyle(TableStyle(stylebase([("VALIGN", (0,0), (-1,-1), "MIDDLE")])))
    body_rows = [[labs], [boxes_t], [star_row]]
    if extra_note:
        body_rows.append([P(extra_note, S("en", fontSize=10, leading=13.5, textColor=INK))])
    bodyt = Table(body_rows, colWidths=[inner_w])
    bodyt.setStyle(TableStyle(stylebase([("TOPPADDING", (0,0), (-1,-1), 2), ("BOTTOMPADDING", (0,0), (-1,-1), 3)])))

    head = Table([[Icon(icon, 11*mm, WHITE, None, 0), P(nome, nm), prem]], colWidths=[17*mm, 55*mm, W - 72*mm])
    head.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), cor), ("LEFTPADDING", (0,0), (0,0), 10),
                                        ("RIGHTPADDING", (-1,0), (-1,0), 12),
                                        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8)])))
    outer = Table([[head], [bodyt]], colWidths=[W])
    outer.setStyle(TableStyle(stylebase([("BACKGROUND", (0,1), (-1,1), tint), ("BOX", (0,0), (-1,-1), 1, cor),
                                         ("ROUNDEDCORNERS", [8,8,8,8]),
                                         ("LEFTPADDING", (0,1), (-1,1), 7), ("RIGHTPADDING", (0,1), (-1,1), 7),
                                         ("TOPPADDING", (0,1), (-1,1), 8), ("BOTTOMPADDING", (0,1), (-1,1), 8)])))
    return outer

def pagina2():
    f = [section("As regras de cada área", SLATE), Spacer(1, 2*mm),
         P("Em cada área, o prêmio vai só para o <b>1º colocado</b>, e só se ele bater as <b>duas metas mínimas</b>. "
           "Lembre: cada cliente atendido vale 2 pontos e cada estrela aprovada vale 3.", S("i", fontSize=10.5, leading=14.5, textColor=MUTED)),
         Spacer(1, 4*mm)]
    f.append(area_card("CABELO", BLUE, BLUE_T, "scissors", f"R${NB}250,00", None,
                       "5", "pontos cada", "Tratamento das <b>SUAS marcas autorizadas</b>",
                       [("60", "clientes atendidos no mês"), ("20", "tratamentos das suas marcas autorizadas")],
                       "Mínimo de <b>20 estrelas do Google</b>. Não chegou? Isso <b>não elimina</b> o prêmio.",
                       "<b>Atenção:</b> tratamento de outra marca <b>não vale os 5 pontos</b>. "
                       "O atendimento do cliente continua contando os 2 pontos do dia.", bh=29*mm))
    f.append(Spacer(1, 5*mm))
    f.append(area_card("UNHAS", RED, RED_T, "polish", f"R${NB}150,00", "+ prêmio surpresa",
                       "3", "pontos cada", "<b>SPA dos Pés</b>",
                       [("85", "clientes atendidos no mês"), ("10", "SPA dos Pés")],
                       "Mínimo de <b>20 estrelas do Google</b>. Não chegou? Isso <b>não elimina</b> o prêmio."))
    f.append(Spacer(1, 5*mm))
    f.append(area_card("ESTÉTICA", PURP, PURP_T, "sparkle", f"R${NB}150,00", "+ prêmio surpresa",
                       "3", "pontos cada", "<b>Limpeza de Pele</b>",
                       [("80", "clientes atendidos no mês"), ("10", "Limpezas de Pele")],
                       "Mínimo de <b>20 estrelas do Google</b>. Não chegou? Isso <b>não elimina</b> o prêmio."))
    return f

# ---------------------------------------------------------------- página 3
BRANDS = [
    ("L'Oréal", ["Kerastase Nutrição", "Kerastase Reconstrução", "Loreal Absolut Repair", "Loreal Cachos", "Loreal Inforcer",
                 "Loreal Metal Detox", "Loreal Nutrifier", "Loreal Pós Química", "Loreal Pro Longer", "Loreal Scalp Argila",
                 "Loreal Vitamino Color Spectrum", "Loreal Vitamino Color Tradicional", "Loreal Molecular"]),
    ("Wella", ["Wella BlondorPlex", "Wella Color Brilliance", "Wella Color Motion", "Wella Elements", "Wella Enrich",
               "Wella Fusion", "Wella Luxe Ultimate", "Wella Oil Reflections", "Wella Ultimate - reconstrução imediata"]),
    ("Sebastian", ["No Breaker Sebastian", "Sebastian Hydre - Hidratação", "Sebastian Penetraitt", "Sebastian Penetraitt - Reconstrução"]),
    ("Keune", ["Keune Smooth - Reconstrução", "Keune Vital Hidratação", "Keune Vital Nutrição"]),
    ("Truss", ["Truss Blond", "Truss Color Shield", "Truss Hydra Air", "Truss Infusion", "Truss Net Mask", "Truss Nutri Infusion"]),
    ("Vitallis", ["Plástica Premium - Vitallis", "Vitallis", "Vitallis Reposição de Carbono"]),
    ("Soupleliss", ["Soupleliss Curly SPA - Gelatina Lipídios + Colágeno"]),
]
SORTEIO = [("Brenda", "L'Oréal", "Wella"), ("Ricardo", "L'Oréal", "Wella"), ("Kim", "Keune", "Truss"),
           ("Leticia", "Truss", "Vitallis"), ("Lucas", "Vitallis", "Soupleliss"), ("Manu", "Vitallis", "Keune"),
           ("Rilley", "Sebastian", "Soupleliss"), ("Yago", "Sebastian", "Soupleliss")]

def brand_box(nome, itens, w):
    hd = S("bh", fontName="Arial-Bold", fontSize=11, leading=14, textColor=BLUE)
    it = S("bi", fontSize=9.2, leading=11.6, textColor=INK, leftIndent=9, bulletIndent=0)
    rows = [[P(nome, hd)]] + [[Paragraph(x, it, bulletText="•")] for x in itens]
    t = Table(rows, colWidths=[w])
    t.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), WHITE), ("BACKGROUND", (0,0), (-1,0), BLUE_T),
                                     ("BOX", (0,0), (-1,-1), .8, H("#b9c8f3")), ("ROUNDEDCORNERS", [5,5,5,5]),
                                     ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 6),
                                     ("TOPPADDING", (0,0), (-1,-1), 1.5), ("BOTTOMPADDING", (0,0), (-1,-1), 1.5),
                                     ("TOPPADDING", (0,0), (-1,0), 4), ("BOTTOMPADDING", (0,0), (-1,0), 4),
                                     ("BOTTOMPADDING", (0,-1), (-1,-1), 5)])))
    return t

def pagina3():
    f = [section("Marcas autorizadas do Cabelo em outubro", BLUE), Spacer(1, 2*mm),
         P("Resultado do sorteio. Só os tratamentos das <b>suas duas marcas</b> valem 5 pontos.",
           S("i", fontSize=10.5, leading=14.5, textColor=MUTED)), Spacer(1, 3*mm)]
    hdr = S("th", fontName="Arial-Bold", fontSize=10.5, leading=13, textColor=WHITE)
    nm = S("tn", fontName="Arial-Bold", fontSize=12.5, leading=15)
    mk = S("tm", fontName="Arial-Bold", fontSize=12.5, leading=15, textColor=BLUE)
    gp = 4*mm; hw = (W - gp) / 2
    cwid = [hw*0.30, hw*0.70]
    def meia(lin):
        rows = [[P("Profissional", hdr), P("Marcas autorizadas", hdr)]]
        for n, a, b in lin: rows.append([P(n, nm), P(f"{a}  <font color='#52606d'>+</font>  {b}", mk)])
        t = Table(rows, colWidths=cwid)
        ts = [("BACKGROUND", (0,0), (-1,0), BLUE), ("BOX", (0,0), (-1,-1), 1, BLUE), ("ROUNDEDCORNERS", [6,6,6,6]),
              ("LINEBELOW", (0,1), (-1,-2), .5, H("#c9d6f7")), ("LEFTPADDING", (0,0), (-1,-1), 10),
              ("TOPPADDING", (0,0), (-1,-1), 3.5), ("BOTTOMPADDING", (0,0), (-1,-1), 4.5)]
        for i in range(1, len(rows)):
            ts.append(("BACKGROUND", (0,i), (-1,i), BLUE_T if i % 2 == 0 else WHITE))
        t.setStyle(TableStyle(stylebase(ts)))
        return t
    t = Table([[meia(SORTEIO[:4]), "", meia(SORTEIO[4:])]], colWidths=[hw, gp, hw])
    t.setStyle(TableStyle(stylebase([("VALIGN", (0,0), (-1,-1), "TOP")])))
    f += [t, Spacer(1, 3*mm)]
    ob = S("ob", fontSize=10, leading=13.5)
    obs = Table([[Icon("info", 5.5*mm, BLUE, None, 0), P("<b>L'Oréal</b> inclui todos os tratamentos L'Oréal, inclusive <b>Kérastase</b> e <b>L'Oréal Molecular</b>.", ob)],
                 [Icon("info", 5.5*mm, BLUE, None, 0), P("<b>Sebastian</b> conta como marca separada da <b>Wella</b>.", ob)]],
                colWidths=[8*mm, W - 8*mm])
    obs.setStyle(TableStyle(stylebase([("TOPPADDING", (0,0), (-1,-1), 1.5), ("BOTTOMPADDING", (0,0), (-1,-1), 1.5)])))
    f += [obs, Spacer(1, 4*mm)]

    f += [section("Quais tratamentos contam em cada marca", BLUE), Spacer(1, 2*mm),
          P("Os nomes abaixo são os mesmos que aparecem na agenda.", S("i", fontSize=10.5, leading=14.5, textColor=MUTED)),
          Spacer(1, 3*mm)]
    gap = 4*mm; cw = (W - gap) / 2
    left_names = ["L'Oréal", "Truss", "Soupleliss"]
    d = dict(BRANDS)
    def col(names):
        out = []
        for n in names:
            out += [brand_box(n, d[n], cw), Spacer(1, 3*mm)]
        return out
    right_names = ["Wella", "Sebastian", "Keune", "Vitallis"]
    grid = Table([[col(left_names), "", col(right_names)]], colWidths=[cw, gap, cw])
    grid.setStyle(TableStyle(stylebase([("VALIGN", (0,0), (-1,-1), "TOP")])))
    f += [grid, Spacer(1, 1*mm)]

    hw2 = (W - 4*mm) / 2
    def aviso(icon, txt, bg, borda):
        t = Table([[icon, P(txt, S("nn", fontSize=10, leading=13.5))]], colWidths=[10*mm, hw2 - 10*mm])
        t.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), bg), ("BOX", (0,0), (-1,-1), .8, borda),
                                         ("ROUNDEDCORNERS", [6,6,6,6]), ("LEFTPADDING", (0,0), (0,0), 7),
                                         ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 7)])))
        return t
    nota = aviso(Icon("cross", 6*mm, WHITE, RED, .26),
                 "Estas marcas <b>não são autorizadas</b> em outubro: <b>Cadiveu, Nuance, Joico e Davines</b>.", RED_T, H("#f0b8b8"))
    dica = aviso(Icon("info", 6*mm, GOLD_D, None, 0),
                 "<b>Dica:</b> lance o tratamento na agenda com o <b>nome certo da marca</b>. Senão, ele não é reconhecido.", GOLD_T, H("#f0d28a"))
    par = Table([[nota, "", dica]], colWidths=[hw2, 4*mm, hw2])
    par.setStyle(TableStyle(stylebase([("VALIGN", (0,0), (-1,-1), "TOP")])))
    f += [par]
    return f

# ---------------------------------------------------------------- página 4
def pagina4():
    f = []
    k1 = S("k1", fontName="Arial-Bold", fontSize=11, leading=14, textColor=H("#ffd37a"))
    k2 = S("k2", fontName="Arial-Bold", fontSize=25, leading=29, textColor=WHITE)
    k3 = S("k3", fontSize=11.5, leading=15.5, textColor=WHITE)
    bg1 = S("bg1", fontName="Arial-Bold", fontSize=40, leading=42, textColor=WHITE, alignment=1)
    bg2 = S("bg2", fontName="Arial-Bold", fontSize=11, leading=13, textColor=WHITE, alignment=1)
    dinheiro = Table([[P(f"R${NB}5,00", bg1)], [P("por estrela aprovada", bg2)]], colWidths=[58*mm])
    dinheiro.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), GREEN), ("BOX", (0,0), (-1,-1), 2, H("#ffd37a")),
                                            ("ROUNDEDCORNERS", [8,8,8,8]),
                                            ("TOPPADDING", (0,0), (0,0), 9), ("BOTTOMPADDING", (0,0), (0,0), 1),
                                            ("TOPPADDING", (0,1), (0,1), 0), ("BOTTOMPADDING", (0,1), (0,1), 9)])))
    left = [P("BÔNUS EXTRA", k1), P("Estrelas do Google", k2), Spacer(1, 2*mm),
            P("Dinheiro extra, separado do ranking.", k3)]
    # troféu "dinheiro" ao lado
    ban = Table([[Icon("star", 17*mm, GOLD, None, 0), left, dinheiro]], colWidths=[22*mm, W - 22*mm - 70*mm, 70*mm])
    ban.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), GREEN), ("ROUNDEDCORNERS", [10,10,10,10]),
                                       ("LEFTPADDING", (0,0), (0,0), 12), ("RIGHTPADDING", (-1,0), (-1,0), 12),
                                       ("TOPPADDING", (0,0), (-1,-1), 14), ("BOTTOMPADDING", (0,0), (-1,-1), 14)])))
    f += [ban, Spacer(1, 7*mm)]

    f += [section("Como o bônus funciona", GREEN), Spacer(1, 3*mm)]
    lb = S("lb", fontSize=11.5, leading=16)
    def row(icon, txt): return [icon, P(txt, lb)]
    rows = [
        row(soft("star", GOLD_D, GOLD_T, 12*mm), f"Cada <b>estrela do Google aprovada</b>, cadastrada em outubro, vale <b>R${NB}5,00</b>."),
        row(soft("person", GREEN, GREEN_T, 12*mm), "Vale para <b>todos os profissionais do desafio</b> (Cabelo, Unhas e Estética) e também para <b>Andressa e Kelle</b>, que participam só do bônus."),
        row(soft("check", GREEN, GREEN_T, 12*mm), "<b>Sem mínimo e sem limite.</b>"),
        row(soft("trophy", GREEN, GREEN_T, 12*mm), f"É <b>separado do ranking</b>: você ganha os R${NB}5,00 por estrela <b>mesmo sem ser o 1º colocado</b>."),
        row(soft("calendar", GREEN, GREEN_T, 12*mm), "O valor é <b>pago depois do fechamento do mês</b>."),
    ]
    t = Table(rows, colWidths=[17*mm, W - 17*mm])
    t.setStyle(TableStyle(stylebase([("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
                                     ("LINEBELOW", (1,0), (1,-2), .5, LINE)])))
    f += [t, Spacer(1, 6*mm)]

    # exemplo
    ex_t = S("ext", fontName="Arial-Bold", fontSize=12, leading=15, textColor=GOLD_D)
    stars = Table([[Icon("star", 11*mm, GOLD, None, 0) for _ in range(8)]], colWidths=[13*mm]*8)
    stars.setStyle(TableStyle(stylebase()))
    eq = S("eq", fontName="Arial-Bold", fontSize=17, leading=21, textColor=GREEN, alignment=1)
    eq2 = S("eq2", fontSize=11.5, leading=15, alignment=1)
    ex = Table([[P("EXEMPLO SIMPLES", ex_t)], [stars],
                [P(f"8 estrelas aprovadas × R${NB}5,00 = <font color='#146C34'><b>R${NB}40,00</b></font>", eq)]],
               colWidths=[W])
    ex.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), GOLD_T), ("BOX", (0,0), (-1,-1), 1, GOLD),
                                      ("ROUNDEDCORNERS", [8,8,8,8]), ("ALIGN", (0,1), (0,1), "CENTER"),
                                      ("LEFTPADDING", (0,0), (0,0), 12),
                                      ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 7)])))
    f += [ex, Spacer(1, 6*mm)]

    # acompanhar
    f += [section("Como acompanhar suas estrelas", GREEN), Spacer(1, 3*mm)]
    ac = P("No site do desafio, abra a área <b>“Bônus Estrelas”</b> e escolha o seu nome em <b>“Quem é você?”</b>. Você vai ver:", lb)
    cw3 = (W - 24*mm - 2*4*mm) / 3
    def info(big, txt, col, tint):
        a = S("a2", fontName="Arial-Bold", fontSize=10.5, leading=13.5, textColor=INK, alignment=1)
        t = Table([[P(txt, a)]], colWidths=[cw3], rowHeights=[15*mm])
        t.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), tint), ("BOX", (0,0), (-1,-1), .8, col),
                                         ("ROUNDEDCORNERS", [6,6,6,6]),
                                         ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
                                         ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5)])))
        return t
    trio = Table([[info("", "Suas estrelas <b>aprovadas</b>", GREEN, GREEN_T), "", info("", "As que <b>aguardam aprovação</b>", GOLD, GOLD_T),
                   "", info("", "Quanto você <b>já acumulou</b>", GREEN, GREEN_T)]],
                 colWidths=[cw3, 4*mm, cw3, 4*mm, cw3])
    trio.setStyle(TableStyle(stylebase([("VALIGN", (0,0), (-1,-1), "TOP")])))
    blk = Table([[Icon("phone", 14*mm, GREEN, None, 0), [ac, Spacer(1, 3*mm), trio]]], colWidths=[24*mm, W - 24*mm])
    blk.setStyle(TableStyle(stylebase([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (0,0), 4)])))
    f += [blk, Spacer(1, 6*mm)]

    # mês
    mes = Table([[soft("calendar", GOLD_D, WHITE, 12*mm),
                  [P("A estrela conta no mês em que foi cadastrada", S("mt", fontName="Arial-Bold", fontSize=12, leading=15, textColor=GOLD_D)),
                   Spacer(1, 1.5*mm),
                   P("Uma estrela <b>cadastrada em outubro</b> e <b>aprovada em novembro</b> entra no bônus de <b>outubro</b>.", lb)]]],
                colWidths=[18*mm, W - 18*mm])
    mes.setStyle(TableStyle(stylebase([("BACKGROUND", (0,0), (-1,-1), GOLD_T), ("BOX", (0,0), (-1,-1), 1, GOLD),
                                       ("ROUNDEDCORNERS", [8,8,8,8]), ("LEFTPADDING", (0,0), (0,0), 8),
                                       ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 9)])))
    f += [mes]
    return f

# ---------------------------------------------------------------- documento
def decor(c, doc):
    c.saveState()
    cols = [BLUE, RED, PURP, GOLD, GREEN]
    pw, ph = A4
    seg = pw / len(cols)
    for i, col in enumerate(cols):
        c.setFillColor(col); c.rect(i*seg, ph - 4*mm, seg, 4*mm, stroke=0, fill=1)
    # rodapé
    c.setStrokeColor(LINE); c.setLineWidth(.8); c.line(14*mm, 16*mm, pw - 14*mm, 16*mm)
    c.setFillColor(INK); c.setFont("Arial-Bold", 10); c.drawString(14*mm, 10.5*mm, "Dúvidas? Fale com a gerência.")
    c.setFillColor(MUTED); c.setFont("Arial", 9.5)
    c.drawRightString(pw - 14*mm, 10.5*mm, f"Studio X  ·  Outubro de 2026  ·  {doc.page}/4")
    c.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=14*mm, rightMargin=14*mm, topMargin=12*mm, bottomMargin=20*mm,
                      title="Desafio do Profissional Parceiro — Regras de outubro de 2026", author="Studio X",
                      subject="Regras do desafio de outubro de 2026", lang="pt-BR")
fr = Frame(14*mm, 20*mm, W, A4[1] - 32*mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id="f")
doc.addPageTemplates([PageTemplate(id="p", frames=[fr], onPage=decor)])
story = pagina1() + [PageBreak()] + pagina2() + [PageBreak()] + pagina3() + [PageBreak()] + pagina4()
doc.build(story)
print("ok", OUT)
