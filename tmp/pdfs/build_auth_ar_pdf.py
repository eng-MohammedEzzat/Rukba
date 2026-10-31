# -*- coding: utf-8 -*-
"""Arabic PDF of the Rukba mobile auth integration guide."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output' / 'pdf' / 'rukba-mobile-auth-api-ar.pdf'

PAGE_W, PAGE_H = A4
MARGIN_X = 32
BOTTOM = 38
CONTENT_W = PAGE_W - MARGIN_X * 2

INK = HexColor('#1C2428')
MUTED = HexColor('#5E6A70')
TEAL = HexColor('#0E3B43')
TEAL_MID = HexColor('#1F6F64')
TEAL_SOFT = HexColor('#E7F2F0')
LINE = HexColor('#D5DEDC')
ROW_ALT = HexColor('#F4F8F7')
CODE_BG = HexColor('#F3F6F5')
CODE_INK = HexColor('#16343A')
GOLD = HexColor('#C4A46A')
WARN_BG = HexColor('#FFF8EE')
WARN_BAR = HexColor('#C48A2A')
DANGER_BG = HexColor('#FDF3F3')
DANGER_BAR = HexColor('#B24B4B')
OK_BG = HexColor('#E8F6F1')
OK_BAR = HexColor('#1F7A5C')

FONT = 'Tahoma'
FONT_B = 'TahomaBold'
MONO = 'Consolas'

pdfmetrics.registerFont(TTFont(FONT, r'C:\Windows\Fonts\tahoma.ttf'))
pdfmetrics.registerFont(TTFont(FONT_B, r'C:\Windows\Fonts\tahomabd.ttf'))
pdfmetrics.registerFont(TTFont(MONO, r'C:\Windows\Fonts\consola.ttf'))

RESHAPER = arabic_reshaper.ArabicReshaper(
    configuration={
        'delete_harakat': False,
        'support_ligatures': True,
        'use_unshaped_instead_of_isolated': False,
    }
)

WARNINGS: list[str] = []


_LATIN_RUN = re.compile(r'[A-Za-z0-9_@./:+#{}<>=`"\'\\|$?&%~^*\[\]()-]+')


def protect_latin(text: str) -> str:
    return _LATIN_RUN.sub(lambda match: '\u200e' + match.group(0) + '\u200e', text)


def has_arabic(text: str) -> bool:
    return bool(re.search(r'[\u0600-\u06FF]', text))


def shape_line(logical: str, base_dir: str = 'R') -> str:
    reshaped = RESHAPER.reshape(protect_latin(logical))
    return get_display(reshaped, base_dir=base_dir)


def text_width(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def wrap_rtl(text: str, font: str, size: float, max_width: float) -> list[str]:
    protected = protect_latin(text)
    reshaped = RESHAPER.reshape(protected)
    words = reshaped.split(' ')
    lines: list[str] = []
    current: list[str] = []

    def flush() -> None:
        if current:
            lines.append(' '.join(current))
            current.clear()

    for word in words:
        if not word:
            continue
        trial = ' '.join(current + [word])
        if text_width(trial, font, size) <= max_width or not current:
            if text_width(word, font, size) > max_width and not current:
                lines.extend(_hard_break(word, font, size, max_width))
            else:
                current.append(word)
        else:
            flush()
            if text_width(word, font, size) > max_width:
                lines.extend(_hard_break(word, font, size, max_width))
            else:
                current.append(word)
    flush()
    visual = [get_display(line, base_dir='R') for line in lines] or ['']
    for line in visual:
        if text_width(line, font, size) > max_width + 1.5:
            WARNINGS.append(f'rtl overflow {text_width(line, font, size):.1f}>{max_width:.1f}: {text[:48]}')
    return visual


def wrap_ltr(text: str, font: str, size: float, max_width: float) -> list[str]:
    if text_width(text, font, size) <= max_width:
        return [text]
    lines: list[str] = []
    current = ''
    for ch in text:
        trial = current + ch
        if text_width(trial, font, size) <= max_width:
            current = trial
            continue
        cut = max(current.rfind(' '), current.rfind(','))
        if cut > 8:
            lines.append(current[: cut + 1].rstrip())
            current = current[cut + 1 :].lstrip() + ch
        else:
            if current:
                lines.append(current)
            current = ch
    if current:
        lines.append(current)
    for line in lines:
        if text_width(line, font, size) > max_width + 1.5:
            WARNINGS.append(f'ltr overflow {text_width(line, font, size):.1f}>{max_width:.1f}')
    return lines or ['']


def _hard_break(word: str, font: str, size: float, max_width: float) -> list[str]:
    lines = []
    current = ''
    for ch in word:
        trial = current + ch
        if current and text_width(trial, font, size) > max_width:
            lines.append(current)
            current = ch
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


class Guide:
    def __init__(self, path: Path) -> None:
        self.c = canvas.Canvas(str(path), pagesize=A4)
        self.c.setTitle('دليل تكامل واجهة المصادقة في ركبة')
        self.c.setAuthor('Rukba')
        self.c.setSubject('Auth API guide for the mobile app, Arabic')
        self.page_num = 0
        self.y = 0.0
        self.content_top = 0.0
        self.first = True
        self.bookmarks: list[tuple[str, str, int]] = []

    def start_page(self) -> None:
        if self.page_num:
            self._footer()
            self.c.showPage()
        self.page_num += 1
        self._header()

    def finish(self) -> None:
        self._footer()
        for title, key, level in self.bookmarks:
            self.c.addOutlineEntry(shape_line(title), key, level=level, closed=0)
        self.c.save()

    def _header(self) -> None:
        c = self.c
        if self.page_num == 1:
            band_h = 96
            c.setFillColor(TEAL)
            c.rect(0, PAGE_H - band_h, PAGE_W, band_h, stroke=0, fill=1)
            c.setFillColor(GOLD)
            c.rect(0, PAGE_H - band_h, PAGE_W, 3.2, stroke=0, fill=1)
            c.setFillColor(white)
            c.setFont(FONT_B, 18)
            title = shape_line('دليل تكامل واجهة المصادقة')
            c.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 36, title)
            c.setFont(FONT, 11)
            sub = shape_line('تطبيق ركبة للجوال')
            c.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 56, sub)
            c.setFillColor(HexColor('#D5E6E3'))
            c.setFont(FONT, 9)
            roles = shape_line('الراكب، السائق، والمدير  |  أكتوبر 2026')
            c.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 76, roles)
            c.setFillColor(GOLD)
            c.setFont(FONT_B, 11)
            c.drawString(MARGIN_X, PAGE_H - 48, 'RUKBA')
            self.content_top = PAGE_H - band_h - 16
        else:
            band_h = 32
            c.setFillColor(TEAL)
            c.rect(0, PAGE_H - band_h, PAGE_W, band_h, stroke=0, fill=1)
            c.setFillColor(GOLD)
            c.rect(0, PAGE_H - band_h, PAGE_W, 2.2, stroke=0, fill=1)
            c.setFillColor(white)
            c.setFont(FONT, 9)
            label = shape_line('دليل مصادقة ركبة لتطبيق الجوال')
            c.drawRightString(PAGE_W - MARGIN_X, PAGE_H - 20, label)
            c.setFont(FONT_B, 8)
            c.setFillColor(GOLD)
            c.drawString(MARGIN_X, PAGE_H - 20, 'RUKBA')
            self.content_top = PAGE_H - band_h - 14
        self.y = self.content_top

    def _footer(self) -> None:
        c = self.c
        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.line(MARGIN_X, 26, PAGE_W - MARGIN_X, 26)
        c.setFillColor(MUTED)
        c.setFont(FONT, 8)
        label = shape_line('ركبة  |  دليل المصادقة لتطبيق الجوال')
        c.drawRightString(PAGE_W - MARGIN_X, 12, label)
        c.setFont(FONT, 8)
        c.drawString(MARGIN_X, 12, str(self.page_num))

    def remaining(self) -> float:
        return self.y - BOTTOM

    def new_page(self) -> None:
        self.start_page()

    def gap(self, amount: float) -> None:
        if self.y >= self.content_top - 0.5:
            return
        if self.remaining() < amount:
            self.new_page()
            return
        self.y -= amount

    def ensure(self, height: float) -> None:
        if height <= self.content_top - BOTTOM and self.remaining() < height:
            self.new_page()

    def bookmark(self, title: str, key: str, level: int) -> None:
        self.c.bookmarkPage(key)
        self.bookmarks.append((title, key, level))

    def h1(self, text: str, key: str) -> None:
        self.gap(16)
        self.ensure(84)
        self.bookmark(text, key, 0)
        self.c.setFillColor(TEAL)
        self.c.setFont(FONT_B, 15)
        visual = shape_line(text)
        self.c.drawRightString(PAGE_W - MARGIN_X, self.y - 14, visual)
        self.c.setStrokeColor(GOLD)
        self.c.setLineWidth(1.4)
        self.c.line(PAGE_W - MARGIN_X - 72, self.y - 20, PAGE_W - MARGIN_X, self.y - 20)
        self.y -= 30

    def h2(self, text: str, key: str) -> None:
        self.gap(12)
        self.ensure(72)
        self.bookmark(text, key, 1)
        self.c.setFillColor(TEAL_MID)
        self.c.setFont(FONT_B, 12)
        self.c.drawRightString(PAGE_W - MARGIN_X, self.y - 12, shape_line(text))
        self.y -= 22

    def paragraph(self, text: str, size: float = 10.5, leading: float = 16.4, color: Color = INK, font: str = FONT) -> None:
        lines = wrap_rtl(text, font, size, CONTENT_W)
        block_h = leading * len(lines)
        self.ensure(min(block_h, self.content_top - BOTTOM))
        self._draw_rtl_lines(lines, size, leading, color, font, PAGE_W - MARGIN_X, CONTENT_W)
        self.y -= 6

    def bullets(self, items: list[str]) -> None:
        for item in items:
            self._bullet(item)
        self.y -= 2

    def _bullet(self, text: str) -> None:
        indent = 16
        size, leading = 10.5, 16.2
        lines = wrap_rtl(text, FONT, size, CONTENT_W - indent)
        block_h = leading * len(lines)
        self.ensure(block_h)
        self.c.setFillColor(TEAL_MID)
        self.c.circle(PAGE_W - MARGIN_X - 4, self.y - 8, 1.7, stroke=0, fill=1)
        self._draw_rtl_lines(
            lines, size, leading, INK, FONT, PAGE_W - MARGIN_X - indent, CONTENT_W - indent
        )

    def numbered(self, items: list[str]) -> None:
        for index, item in enumerate(items, start=1):
            self._numbered(index, item)
        self.y -= 2

    def _numbered(self, index: int, text: str) -> None:
        indent = 20
        size, leading = 10.5, 16.2
        lines = wrap_rtl(text, FONT, size, CONTENT_W - indent)
        self.ensure(leading * len(lines))
        self.c.setFillColor(TEAL)
        self.c.setFont(FONT_B, 10.5)
        self.c.drawRightString(PAGE_W - MARGIN_X, self.y - 11, f'{index}.')
        self._draw_rtl_lines(
            lines, size, leading, INK, FONT, PAGE_W - MARGIN_X - indent, CONTENT_W - indent
        )

    def _draw_rtl_lines(self, lines, size, leading, color, font, right_x, _max_w) -> None:
        self.c.setFillColor(color)
        self.c.setFont(font, size)
        baseline = self.y - size * 0.82
        for line in lines:
            self.c.drawRightString(right_x, baseline, line)
            baseline -= leading
        self.y -= leading * len(lines)

    def endpoint(self, path: str, access: str) -> None:
        label = shape_line(access)
        label_w = text_width(label, FONT_B, 9)
        path_w = text_width(path, MONO, 9)
        stacked = label_w + path_w + 28 > CONTENT_W
        height = 40 if stacked else 24
        self.ensure(height + 4)
        y = self.y - height
        self.c.setFillColor(TEAL_SOFT)
        self.c.roundRect(MARGIN_X, y, CONTENT_W, height, 4, stroke=0, fill=1)
        self.c.setFillColor(TEAL)
        self.c.setFont(FONT_B, 9)
        self.c.drawRightString(PAGE_W - MARGIN_X - 8, y + height - 16, label)
        self.c.setFillColor(CODE_INK)
        self.c.setFont(MONO, 9)
        if stacked:
            self.c.drawRightString(PAGE_W - MARGIN_X - 8, y + 8, path)
        else:
            self.c.drawRightString(PAGE_W - MARGIN_X - 16 - label_w, y + 7.5, path)
        self.y = y - 8

    def code(self, text: str) -> None:
        size, leading = 8, 11
        inner_w = CONTENT_W - 16
        wrapped: list[str] = []
        for raw in text.split('\n'):
            wrapped.extend(wrap_ltr(raw if raw else ' ', MONO, size, inner_w))
        pad_y = 8
        block_h = pad_y * 2 + leading * len(wrapped)
        full = self.content_top - BOTTOM
        if block_h <= full:
            self.ensure(block_h)
            self._code_chunk(wrapped, size, leading, pad_y)
            self.y -= 8
            return
        # Split a very tall block across pages.
        while wrapped:
            room = self.remaining() - 8
            per = leading
            capacity = int((room - pad_y * 2) / per)
            if capacity < 4:
                self.new_page()
                continue
            chunk = wrapped[:capacity]
            wrapped = wrapped[capacity:]
            self._code_chunk(chunk, size, leading, pad_y)
            if wrapped:
                self.new_page()
        self.y -= 8

    def _code_chunk(self, lines: list[str], size: float, leading: float, pad_y: float) -> None:
        block_h = pad_y * 2 + leading * len(lines)
        y = self.y - block_h
        self.c.setFillColor(CODE_BG)
        self.c.roundRect(MARGIN_X, y, CONTENT_W, block_h, 4, stroke=0, fill=1)
        self.c.setFillColor(TEAL_MID)
        self.c.rect(MARGIN_X, y, 3, block_h, stroke=0, fill=1)
        self.c.setFillColor(CODE_INK)
        self.c.setFont(MONO, size)
        baseline = self.y - pad_y - size * 0.78
        for line in lines:
            self.c.drawString(MARGIN_X + 10, baseline, line)
            baseline -= leading
        self.y = y

    def callout(self, kind: str, text: str) -> None:
        styles = {
            'warn': (WARN_BG, WARN_BAR),
            'danger': (DANGER_BG, DANGER_BAR),
            'ok': (OK_BG, OK_BAR),
            'note': (TEAL_SOFT, TEAL_MID),
        }
        bg, bar = styles[kind]
        size, leading = 10, 15.4
        inner_w = CONTENT_W - 22
        lines = wrap_rtl(text, FONT, size, inner_w)
        pad_y = 8
        block_h = pad_y * 2 + leading * len(lines)
        self.ensure(block_h)
        y = self.y - block_h
        self.c.setFillColor(bg)
        self.c.roundRect(MARGIN_X, y, CONTENT_W, block_h, 4, stroke=0, fill=1)
        self.c.setFillColor(bar)
        self.c.rect(PAGE_W - MARGIN_X - 4, y, 4, block_h, stroke=0, fill=1)
        saved = self.y
        self.y = saved - pad_y + 1
        self._draw_rtl_lines(lines, size, leading, INK, FONT, PAGE_W - MARGIN_X - 12, inner_w)
        self.y = y - 8

    def table(self, headers: list[str], rows: list[list[str]], fracs: list[float], kinds: list[str]) -> None:
        widths = [CONTENT_W * f / sum(fracs) for f in fracs]
        header_kinds = ['rtl'] * len(headers)
        header_lines = self._cell_lines(headers, widths, header_kinds, header=True)
        header_h = self._row_height(header_lines, header=True)
        if self.remaining() < header_h + 24:
            self.new_page()

        def draw_header() -> None:
            nonlocal header_lines
            self._draw_row(header_lines, widths, header_kinds, header_h, header=True, alt=False)

        draw_header()
        for index, row in enumerate(rows):
            row_kinds = ['rtl' if has_arabic(cell) else kind for cell, kind in zip(row, kinds)]
            lines = self._cell_lines(row, widths, row_kinds, header=False)
            height = self._row_height(lines, header=False)
            if self.remaining() < height:
                self.new_page()
                header_lines = self._cell_lines(headers, widths, header_kinds, header=True)
                draw_header()
            self._draw_row(lines, widths, row_kinds, height, header=False, alt=index % 2 == 1)
        self.y -= 8

    def _cell_lines(self, cells: list[str], widths: list[float], kinds: list[str], header: bool) -> list[list[str]]:
        size = 8.2 if header else 8
        out = []
        for cell, width, kind in zip(cells, widths, kinds):
            max_w = width - 8
            if header or kind == 'rtl':
                out.append(wrap_rtl(cell, FONT_B if header else FONT, size, max_w))
            else:
                out.append(wrap_ltr(cell, MONO if kind == 'mono' else FONT, size, max_w))
        return out

    def _row_height(self, lines: list[list[str]], header: bool) -> float:
        leading = 11.2 if header else 11
        return 8 + leading * max(len(item) for item in lines)

    def _draw_row(self, lines, widths, kinds, height, header: bool, alt: bool) -> None:
        y = self.y - height
        if header:
            self.c.setFillColor(TEAL)
        elif alt:
            self.c.setFillColor(ROW_ALT)
        else:
            self.c.setFillColor(white)
        self.c.rect(MARGIN_X, y, CONTENT_W, height, stroke=0, fill=1)
        self.c.setStrokeColor(LINE)
        self.c.setLineWidth(0.4)
        self.c.rect(MARGIN_X, y, CONTENT_W, height, stroke=1, fill=0)
        font = FONT_B if header else FONT
        size = 8.2 if header else 8
        leading = 11.2 if header else 11
        color = white if header else INK
        x_right = PAGE_W - MARGIN_X
        for col_lines, width, kind in zip(lines, widths, kinds):
            x_left = x_right - width
            self.c.setStrokeColor(LINE)
            self.c.line(x_left, y, x_left, y + height)
            use_font = FONT_B if header else (MONO if kind == 'mono' else font)
            self.c.setFillColor(color)
            self.c.setFont(use_font, size)
            text_h = leading * len(col_lines)
            baseline = y + (height + text_h) / 2 - leading + 2.2
            for line in col_lines:
                if kind == 'rtl' or header:
                    self.c.drawRightString(x_right - 4, baseline, line)
                else:
                    self.c.drawString(x_left + 4, baseline, line)
                baseline -= leading
            x_right = x_left
        self.y = y

    def flow(self) -> None:
        """Refresh sequence, explained as the same steps as the integration diagram."""
        steps = [
            'التطبيق يرسل الطلب الأصلي ومعه رمز الوصول.',
            'الخادم يرد بالحالة 401.',
            'التطبيق يرسل رمز التحديث إلى مسار تحديث الدور.',
        ]
        for step in steps:
            self._flow_step(step)
            self._flow_arrow()
        self._flow_branch()
        self.y -= 4

    def _flow_step(self, text: str) -> None:
        size, leading = 10, 14
        lines = wrap_rtl(text, FONT, size, CONTENT_W - 28)
        height = 10 + leading * len(lines)
        self.ensure(height + 16)
        y = self.y - height
        self.c.setFillColor(TEAL_SOFT)
        self.c.roundRect(MARGIN_X + 18, y, CONTENT_W - 36, height, 4, stroke=0, fill=1)
        saved = self.y
        self.y = saved - 5
        self._draw_rtl_lines(lines, size, leading, TEAL, FONT, PAGE_W - MARGIN_X - 28, CONTENT_W - 40)
        self.y = y

    def _flow_arrow(self) -> None:
        self.ensure(14)
        mid = PAGE_W / 2
        self.c.setStrokeColor(TEAL_MID)
        self.c.setFillColor(TEAL_MID)
        self.c.setLineWidth(1)
        top = self.y - 2
        self.c.line(mid, top, mid, top - 8)
        path = self.c.beginPath()
        path.moveTo(mid - 3, top - 8)
        path.lineTo(mid + 3, top - 8)
        path.lineTo(mid, top - 12)
        path.close()
        self.c.drawPath(path, stroke=0, fill=1)
        self.y -= 14

    def _flow_branch(self) -> None:
        gap = 8
        card_w = (CONTENT_W - gap) / 2
        cards = [
            (OK_BG, OK_BAR, 'استجابة 200', 'احفظ رمز الوصول ورمز التحديث الجديدين، ثم أعد الطلب الأصلي مرة واحدة.'),
            (DANGER_BG, DANGER_BAR, 'استجابة 401', 'امسح الرموز المحفوظة، ثم انقل المستخدم إلى شاشة تسجيل الدخول.'),
        ]
        size, leading = 9, 13
        prepared = []
        max_h = 0
        for bg, bar, title, body in cards:
            title_l = wrap_rtl(title, FONT_B, 9.5, card_w - 16)
            body_l = wrap_rtl(body, FONT, size, card_w - 16)
            height = 12 + 14 * len(title_l) + leading * len(body_l)
            max_h = max(max_h, height)
            prepared.append((bg, bar, title_l, body_l))
        self.ensure(max_h)
        y = self.y - max_h
        x = PAGE_W - MARGIN_X - card_w
        for bg, bar, title_l, body_l in prepared:
            self.c.setFillColor(bg)
            self.c.roundRect(x, y, card_w, max_h, 4, stroke=0, fill=1)
            self.c.setFillColor(bar)
            self.c.rect(x + card_w - 4, y, 4, max_h, stroke=0, fill=1)
            self.c.setFillColor(TEAL)
            self.c.setFont(FONT_B, 9.5)
            baseline = y + max_h - 16
            for line in title_l:
                self.c.drawRightString(x + card_w - 10, baseline, line)
                baseline -= 13
            self.c.setFillColor(INK)
            self.c.setFont(FONT, size)
            baseline -= 2
            for line in body_l:
                self.c.drawRightString(x + card_w - 10, baseline, line)
                baseline -= leading
            x -= card_w + gap
        self.y = y - 8


def build(doc: Guide) -> None:
    doc.start_page()
    doc.paragraph(
        'يشرح هذا الدليل إنشاء الحساب وتسجيل الدخول وتحديث الرمز وتسجيل الخروج لأدوار ركبة الثلاثة: الراكب (Passenger) والسائق (Driver) والمدير (Admin). لكل دور مسارات مصادقة خاصة به. الرموز الصادرة لدور لا تعمل على مسارات دور آخر.'
    )
    doc.callout(
        'note',
        'نصوص message التي يعيدها الخادم تبقى بالإنجليزية كما هي في هذا الدليل. فرّع منطق التطبيق على رمز حالة HTTP، لا على نص الرسالة.'
    )

    doc.h1('1. مرجع سريع', 's1')
    doc.paragraph('عنوان الأساس لكل المسارات أدناه:')
    doc.code('{BASE_URL}/api/v1')
    doc.paragraph('في التطوير المحلي:')
    doc.code('http://127.0.0.1:3000/api/v1')

    doc.paragraph('مسارات الراكب:')
    doc.table(
        ['العملية', 'المسار'],
        [
            ['التسجيل', 'POST /auth/register'],
            ['الدخول', 'POST /auth/login'],
            ['تحديث الرمز', 'POST /auth/refresh'],
            ['الخروج من هذا الجهاز', 'POST /auth/logout'],
            ['الخروج من كل الأجهزة', 'POST /auth/logout-all'],
        ],
        [1.3, 2.2],
        ['rtl', 'mono'],
    )
    doc.paragraph('مسارات السائق:')
    doc.table(
        ['العملية', 'المسار'],
        [
            ['التسجيل', 'POST /driver/auth/register'],
            ['الدخول', 'POST /driver/auth/login'],
            ['تحديث الرمز', 'POST /driver/auth/refresh'],
            ['الخروج من هذا الجهاز', 'POST /driver/auth/logout'],
            ['الخروج من كل الأجهزة', 'POST /driver/auth/logout-all'],
        ],
        [1.3, 2.2],
        ['rtl', 'mono'],
    )
    doc.paragraph('مسارات المدير. لا يوجد مسار لتسجيل المدير، والحسابات ينشئها فريق التشغيل:')
    doc.table(
        ['العملية', 'المسار'],
        [
            ['الدخول', 'POST /admin/auth/login'],
            ['تحديث الرمز', 'POST /admin/auth/refresh'],
            ['الخروج من هذا الجهاز', 'POST /admin/auth/logout'],
            ['الخروج من كل الأجهزة', 'POST /admin/auth/logout-all'],
        ],
        [1.3, 2.2],
        ['rtl', 'mono'],
    )
    doc.paragraph(
        'مسارات الخروج من كل الأجهزة فقط هي التي تحتاج ترويسة Authorization. بقية مسارات المصادقة عامة ولا تحتاج رمزا.'
    )
    doc.paragraph('للتحقق من هوية المستخدم عند تشغيل التطبيق:')
    doc.table(
        ['الدور', 'المسار', 'الناتج'],
        [
            ['الراكب', 'GET /profile', '{ user }'],
            ['السائق', 'GET /driver/profile', '{ user, profile, profileComplete, canOperate }'],
            ['المدير', 'لا يوجد مسار', 'احتفظ بكائن user الذي أعاده تسجيل الدخول.'],
        ],
        [0.8, 1.5, 2.2],
        ['rtl', 'mono', 'rtl'],
    )
    doc.paragraph('فحص صحة الخادم لا يحتاج مصادقة:')
    doc.code('GET {BASE_URL}/health\nGET {BASE_URL}/api/v1/health')

    doc.h1('2. القواعد العامة', 's2')
    doc.h2('2.1 ترويسات الطلب', 's2-1')
    doc.code('Content-Type: application/json\nAuthorization: Bearer <accessToken>')
    doc.paragraph(
        'ترويسة Authorization تُستخدم في المسارات المحمية فقط. الحد الأقصى لجسم JSON هو 1 ميغابايت.'
    )

    doc.h2('2.2 شكل الاستجابة', 's2-2')
    doc.paragraph('كل استجابة، سواء نجحت أم فشلت، تستخدم هذا الغلاف:')
    doc.code('{\n  "status": "success",\n  "message": "Logged in",\n  "data": { }\n}')
    doc.table(
        ['الحقل', 'النوع', 'الملاحظات'],
        [
            ['status', '"success" أو "error"', 'تكون القيمة error عندما يكون رمز HTTP مساويا 400 أو أعلى.'],
            ['message', 'string', 'نص مقروء. فرّع منطقك على رمز HTTP لا على هذا النص.'],
            ['data', 'object أو null', 'الحمولة عند النجاح. عند الخطأ تكون null، إلا في أخطاء التحقق والقفل المؤقت كما هو موضح أدناه.'],
        ],
        [0.9, 1.3, 2.4],
        ['mono', 'rtl', 'rtl'],
    )

    doc.h2('2.3 شكل أخطاء التحقق والقفل', 's2-3')
    doc.paragraph('خطأ التحقق (400): يحتوي data.errors على كل حقل غير صالح:')
    doc.code(
        '{\n'
        '  "status": "error",\n'
        '  "message": "Validation failed",\n'
        '  "data": {\n'
        '    "errors": [\n'
        '      { "field": "username", "message": "username must be at least 3 characters" },\n'
        '      { "field": "password", "message": "password must be at least 8 characters" }\n'
        '    ]\n'
        '  }\n'
        '}'
    )
    doc.paragraph(
        'تكون قيمة field نصا فارغا عندما يخص الخطأ الجسم كله، مثل Provide phone or username، أو عند إرسال مفتاح غير معروف إلى مسار صارم.'
    )
    doc.paragraph(
        'كثرة محاولات الدخول (429): يحتوي data.retryAfterSeconds على مدة الانتظار بالثواني. القيمة نفسها تُرسل أيضا في ترويسة الاستجابة Retry-After.'
    )
    doc.code(
        '{\n'
        '  "status": "error",\n'
        '  "message": "Too many failed sign-in attempts. Try again later.",\n'
        '  "data": { "retryAfterSeconds": 900 }\n'
        '}'
    )
    doc.paragraph(
        'في بقية الأخطاء تكون data مساوية لـ null. استخدم رمز HTTP واعرض message، أو استبدله بنص مترجم داخل التطبيق.'
    )

    doc.h2('2.4 الرموز', 's2-4')
    doc.table(
        ['الرمز', 'الصيغة', 'المدة الافتراضية', 'أين يُستخدم'],
        [
            ['accessToken', 'JWT (HS256)', '15 دقيقة', 'ترويسة Authorization: Bearer في المسارات المحمية'],
            ['refreshToken', 'نص سداسي عشري غير شفاف بطول 96 محرفا', '7 أيام من لحظة إصداره', 'جسم مساري refresh و logout فقط'],
        ],
        [1.15, 1.7, 1.15, 1.9],
        ['mono', 'rtl', 'rtl', 'rtl'],
    )
    doc.bullets(
        [
            'قيمة expiresIn في استجابات التسجيل والدخول والتحديث هي نص المدة المُعدّة في الخادم، مثل "15m"، وليست عددا بالثواني. لمعرفة وقت الانتهاء بدقة، فك مطالبة exp من رمز الوصول (ثوان يونكس).',
            'مطالبات رمز الوصول هي sub (معرّف المستخدم)، و role بإحدى القيم passenger أو driver أو admin، و typ بالقيمة access، بالإضافة إلى iat و exp.',
            'رموز التحديث تُدوّر. كل تحديث ناجح يعيد رمز تحديث جديدا، ويتوقف الرمز القديم عن العمل فورا. لا ينجح استخدام رمز التحديث إلا مرة واحدة.',
            'صلاحية كل رمز تحديث 7 أيام من لحظة إصداره. ولأن كل تحديث يصدر رمزا جديدا لسبعة أيام، يبقى التطبيق مسجلا للدخول ما دام يُفتح مرة واحدة على الأقل كل أسبوع.',
            'احفظ الرمزين في تخزين آمن: سلسلة مفاتيح iOS، أو Android Keystore، أو EncryptedSharedPreferences. لا تطبع الرموز في السجلات.',
        ]
    )

    doc.h2('2.5 قواعد الحقول', 's2-5')
    doc.table(
        ['الحقل', 'القواعد'],
        [
            ['phone', 'من 8 إلى 20 محرفا قبل التوحيد. يقبل الصيغة الفلسطينية المحلية مثل 0599123456، أو الدولية مثل +970599123456، أو بادئة 00 مثل 00970599123456. تُحذف المسافات والشرطات. يوحّد الخادم الرقم إلى صيغة E.164، ويرفض الرقم غير الصالح بالحالة 400 والرسالة Invalid phone number.'],
            ['username', 'من 3 إلى 40 محرفا. المحارف المسموحة هي الأحرف والأرقام والنقطة . والشرطة السفلية _. التفرّد وتسجيل الدخول غير حساسين لحالة الأحرف، بينما تُحفظ طريقة الكتابة التي اختارها المستخدم للعرض.'],
            ['password', 'التسجيل يتطلب من 8 إلى 128 محرفا. تسجيل الدخول يقبل من 1 إلى 128 محرفا.'],
            ['fullName', 'حتى 120 محرفا. اختياري للراكب، ومطلوب للسائق بطول من 1 إلى 120 محرفا.'],
        ],
        [1.15, 3.4],
        ['mono', 'rtl'],
    )
    doc.paragraph(
        'تُحذف المسافات في بداية phone و username و fullName وحقول نص السائق وفي نهايتها. كلمة المرور لا تُقصّ.'
    )

    doc.h1('3. مسارات الراكب', 's3')
    doc.h2('3.1 التسجيل', 's3-1')
    doc.endpoint('POST /auth/register', 'عام')
    doc.code(
        '{\n'
        '  "phone": "0599123456",\n'
        '  "username": "sara_new",\n'
        '  "password": "Password123!",\n'
        '  "fullName": "Sara Ahmad"\n'
        '}'
    )
    doc.paragraph('حقل fullName اختياري وقيمته الافتراضية نص فارغ. الحقول غير المعروفة تُتجاهل.')
    doc.paragraph('الاستجابة 201 Created تعني أن الراكب سُجّل دخوله فورا:')
    doc.code(
        '{\n'
        '  "status": "success",\n'
        '  "message": "Registered",\n'
        '  "data": {\n'
        '    "user": {\n'
        '      "id": "665f1c2e9a1b2c3d4e5f6789",\n'
        '      "phone": "+970599123456",\n'
        '      "username": "sara_new",\n'
        '      "fullName": "Sara Ahmad",\n'
        '      "role": "passenger",\n'
        '      "status": "active",\n'
        '      "image": {\n'
        '        "url": "https://res.cloudinary.com/.../Rukba_user.png",\n'
        '        "publicId": null\n'
        '      },\n'
        '      "createdAt": "2026-10-30T12:00:00.000Z",\n'
        '      "updatedAt": "2026-10-30T12:00:00.000Z"\n'
        '    },\n'
        '    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",\n'
        '    "refreshToken": "3f9a...c1d2",\n'
        '    "expiresIn": "15m"\n'
        '  }\n'
        '}'
    )
    doc.table(
        ['الحالة', 'message', 'المعنى'],
        [
            ['400', 'Validation failed', 'راجع data.errors.'],
            ['400', 'Invalid phone number', 'رقم الهاتف غير صالح.'],
            ['409', 'Phone already registered', 'رقم الهاتف مستخدم لدى أي دور.'],
            ['409', 'Username already taken', 'اسم المستخدم مستخدم لدى أي دور، والمطابقة غير حساسة لحالة الأحرف.'],
            ['409', 'Phone or username already registered', 'التعارض نفسه عندما يصل تسجيلا حساب في الوقت نفسه.'],
        ],
        [0.7, 2.3, 2.2],
        ['mono', 'mono', 'rtl'],
    )

    doc.h2('3.2 تسجيل الدخول', 's3-2')
    doc.endpoint('POST /auth/login', 'عام')
    doc.paragraph('أرسل إما phone وإما username، مع password:')
    doc.code('{ "phone": "0599123456", "password": "Password123!" }')
    doc.code('{ "username": "Sara_New", "password": "Password123!" }')
    doc.paragraph('إذا أُرسل الحقلان معا يُستخدم phone.')
    doc.paragraph(
        'الاستجابة 200 OK تحمل شكل data نفسه في التسجيل، أي user و accessToken و refreshToken و expiresIn، مع الرسالة Logged in.'
    )
    doc.table(
        ['الحالة', 'message', 'المعنى'],
        [
            ['400', 'Validation failed', 'مثالها Provide phone or username.'],
            ['400', 'Invalid phone number', 'رقم الهاتف غير صالح.'],
            ['401', 'Invalid credentials', 'الحساب غير موجود أو كلمة المرور خاطئة. الاستجابة لا توضح أيهما.'],
            ['403', 'Account is not active', 'الحساب موقوف.'],
            ['429', 'Too many failed sign-in attempts. Try again later.', 'الدخول مقفول مؤقتا. راجع القسم 6.5.'],
        ],
        [0.7, 2.5, 2.1],
        ['mono', 'mono', 'rtl'],
    )
    doc.callout(
        'warn',
        'بعد نجاح دخول الراكب، تحقق دائما من أن data.user.role يساوي passenger. إذا كانت القيمة غير ذلك فتخلّص من الرموز. راجع المشكلات المعروفة في القسم 8.'
    )

    doc.h2('3.3 تحديث الرمز', 's3-3')
    doc.endpoint('POST /auth/refresh', 'عام')
    doc.code('{ "refreshToken": "3f9a...c1d2" }')
    doc.paragraph('الاستجابة 200 OK:')
    doc.code(
        '{\n'
        '  "status": "success",\n'
        '  "message": "Token refreshed",\n'
        '  "data": {\n'
        '    "accessToken": "eyJ...",\n'
        '    "refreshToken": "9b7e...0a4f",\n'
        '    "expiresIn": "15m"\n'
        '  }\n'
        '}'
    )
    doc.paragraph('استجابة التحديث لا تتضمن user. استبدل الرمزين المحفوظين كليهما.')
    doc.table(
        ['الحالة', 'message', 'المعنى'],
        [
            ['400', 'Validation failed', 'حقل refreshToken مفقود أو أقصر من 20 محرفا.'],
            ['401', 'Invalid or expired refresh token', 'الرمز منته أو مستخدم من قبل أو ملغى، أو يخص دورا آخر، أو لم يعد الحساب راكبا نشطا. سجّل الخروج محليا.'],
        ],
        [0.7, 2.3, 2.3],
        ['mono', 'mono', 'rtl'],
    )

    doc.h2('3.4 الخروج من هذا الجهاز', 's3-4')
    doc.endpoint('POST /auth/logout', 'عام')
    doc.code('{ "refreshToken": "9b7e...0a4f" }')
    doc.paragraph(
        'الاستجابة 200 OK تعيد data بالشكل { "revoked": true }. ينجح النداء حتى لو كان الرمز مجهولا أو ملغى من قبل، لذلك يمكن تكراره بأمان.'
    )

    doc.h2('3.5 الخروج من كل الأجهزة', 's3-5')
    doc.endpoint('POST /auth/logout-all', 'يتطلب رمز وصول الراكب')
    doc.paragraph('لا حاجة لجسم الطلب.')
    doc.paragraph(
        'الاستجابة 200 OK تعيد data بالشكل { "revokedAll": true }. يُلغى كل رمز تحديث للراكب على هذا الحساب، بما في ذلك رمز الجهاز الحالي. امسح الرموز المحلية بعد ذلك.'
    )
    doc.table(
        ['الحالة', 'message', 'المعنى'],
        [
            ['401', 'Invalid or expired access token', 'رمز الوصول مفقود أو تالف أو منته.'],
            ['401', 'User not found or inactive', 'الحساب موقوف أو محذوف.'],
            ['403', 'Forbidden for this role', 'الرمز يخص سائقا أو مديرا.'],
        ],
        [0.7, 2.3, 2.2],
        ['mono', 'mono', 'rtl'],
    )

    doc.h1('4. مسارات السائق', 's4')
    doc.h2('4.1 التسجيل (طلب الانضمام)', 's4-1')
    doc.endpoint('POST /driver/auth/register', 'عام')
    doc.paragraph(
        'كل الحقول مطلوبة. أي حقل غير معروف يُرفض بالحالة 400، بما في ذلك حقول مثل role أو verificationStatus.'
    )
    doc.code(
        '{\n'
        '  "phone": "0599222333",\n'
        '  "username": "ahmad.driver",\n'
        '  "password": "DriverPassword1!",\n'
        '  "fullName": "Ahmad Saleh",\n'
        '  "identificationNumber": "401234567",\n'
        '  "licenseNumber": "LIC-778899",\n'
        '  "vehicleDescription": "White Hyundai H1 minibus"\n'
        '}'
    )
    doc.table(
        ['الحقل', 'القواعد'],
        [
            ['fullName', 'من 1 إلى 120 محرفا'],
            ['identificationNumber', 'من 1 إلى 10 محارف (رقم الهوية)'],
            ['licenseNumber', 'من 1 إلى 64 محرفا'],
            ['vehicleDescription', 'من 1 إلى 240 محرفا'],
        ],
        [1.5, 2.2],
        ['mono', 'rtl'],
    )
    doc.paragraph(
        'الاستجابة 201 Created تنشئ الحساب مع طلب قيد المراجعة. لا تُعاد أي رموز. بعد عرض شاشة التأكيد، انقل السائق إلى شاشة دخول السائق.'
    )
    doc.code(
        '{\n'
        '  "status": "success",\n'
        '  "message": "Driver registered",\n'
        '  "data": {\n'
        '    "user": {\n'
        '      "id": "665f1c2e9a1b2c3d4e5f0001",\n'
        '      "phone": "+970599222333",\n'
        '      "username": "ahmad.driver",\n'
        '      "fullName": "Ahmad Saleh",\n'
        '      "role": "driver",\n'
        '      "status": "active"\n'
        '    },\n'
        '    "profile": {\n'
        '      "id": "665f1c2e9a1b2c3d4e5f0002",\n'
        '      "licenseNumber": "LIC-778899",\n'
        '      "vehicleDescription": "White Hyundai H1 minibus",\n'
        '      "verificationStatus": "pending",\n'
        '      "verifiedAt": null,\n'
        '      "submittedAt": "2026-10-30T12:00:00.000Z",\n'
        '      "applicationSource": "signup",\n'
        '      "decision": null\n'
        '    },\n'
        '    "profileComplete": true,\n'
        '    "canOperate": false\n'
        '  }\n'
        '}'
    )
    doc.paragraph('يُخزَّن identificationNumber ولا يُعاد أبدا في الاستجابة.')
    doc.table(
        ['الحالة', 'message', 'المعنى'],
        [
            ['400', 'Validation failed', 'راجع data.errors. المفتاح غير المعروف يظهر بالصيغة Unrecognized key: "<name>".'],
            ['400', 'Invalid phone number', 'رقم الهاتف غير صالح.'],
            ['409', 'Phone or username already registered', 'الهاتف أو اسم المستخدم مستخدم لدى أي حساب، بما في ذلك حسابات الركاب. لا يمكن تحويل حساب راكب إلى حساب سائق.'],
            ['503', 'Registration is temporarily unavailable.', 'مشكلة في الخادم. اطلب من السائق المحاولة لاحقا.'],
        ],
        [0.65, 2.15, 2.4],
        ['mono', 'mono', 'rtl'],
    )

    doc.h2('4.2 تسجيل الدخول', 's4-2')
    doc.endpoint('POST /driver/auth/login', 'عام')
    doc.paragraph(
        'أرسل واحدا فقط من phone أو username، مع password. إرسال الاثنين معا، أو إرسال أي حقل إضافي، يعيد 400.'
    )
    doc.code('{ "username": "ahmad.driver", "password": "DriverPassword1!" }')
    doc.paragraph(
        'الاستجابة 200 OK تعيد كائن السائق، بنفس شكل التسجيل، مع الرموز. كلها في المستوى الأعلى من data:'
    )
    doc.code(
        '{\n'
        '  "status": "success",\n'
        '  "message": "Logged in",\n'
        '  "data": {\n'
        '    "user": {\n'
        '      "id": "...",\n'
        '      "phone": "+970599222333",\n'
        '      "username": "ahmad.driver",\n'
        '      "fullName": "Ahmad Saleh",\n'
        '      "role": "driver",\n'
        '      "status": "active"\n'
        '    },\n'
        '    "profile": {\n'
        '      "id": "...",\n'
        '      "licenseNumber": "LIC-778899",\n'
        '      "vehicleDescription": "White Hyundai H1 minibus",\n'
        '      "verificationStatus": "verified",\n'
        '      "verifiedAt": "2026-10-31T09:00:00.000Z",\n'
        '      "submittedAt": "2026-10-30T12:00:00.000Z",\n'
        '      "applicationSource": "signup",\n'
        '      "decision": {\n'
        '        "outcome": "approved",\n'
        '        "reviewedAt": "2026-10-31T09:00:00.000Z",\n'
        '        "rejectionReason": null\n'
        '      }\n'
        '    },\n'
        '    "profileComplete": true,\n'
        '    "canOperate": true,\n'
        '    "accessToken": "eyJ...",\n'
        '    "refreshToken": "a1b2...",\n'
        '    "expiresIn": "15m"\n'
        '  }\n'
        '}'
    )
    doc.paragraph(
        'يستطيع السائق تسجيل الدخول بينما طلبه قيد المراجعة أو مرفوض. استخدم الاستجابة لاختيار الشاشة:'
    )
    doc.table(
        ['الشرط', 'الشاشة المقترحة'],
        [
            ['canOperate === true', 'الصفحة الرئيسية للسائق: الرحلات ومسح التذاكر وغير ذلك.'],
            ['profile.verificationStatus === "pending"', 'شاشة "الطلب قيد المراجعة".'],
            ['profile.verificationStatus === "rejected"', 'شاشة "الطلب مرفوض"، مع عرض profile.decision.rejectionReason.'],
            ['profile === null أو profileComplete === false', 'شاشة "الملف غير مكتمل"، مع توجيه السائق للتواصل مع الدعم.'],
        ],
        [2.2, 2.3],
        ['mono', 'rtl'],
    )
    doc.paragraph(
        'للتحقق من الموافقة لاحقا، استدع GET /driver/profile برمز وصول السائق. يعيد الكائن نفسه المكوّن من user و profile و profileComplete و canOperate من غير رموز. مسارات تشغيل السائق تعيد 403 مع الرسالة Driver is not eligible to operate ما دام canOperate يساوي false.'
    )
    doc.table(
        ['الحالة', 'message', 'المعنى'],
        [
            ['400', 'Validation failed', 'مثالها Provide exactly one phone or username. أو Unrecognized key.'],
            ['400', 'Invalid phone number', 'رقم الهاتف غير صالح.'],
            ['401', 'Invalid credentials', 'كلمة المرور خاطئة، أو الحساب غير موجود، أو الحساب ليس سائقا، أو الحساب موقوف أو محذوف. هذه الحالات متعمدة في عدم التمييز بينها.'],
            ['429', 'Too many failed sign-in attempts. Try again later.', 'راجع القسم 6.5.'],
        ],
        [0.65, 2.35, 2.3],
        ['mono', 'mono', 'rtl'],
    )

    doc.h2('4.3 تحديث الرمز', 's4-3')
    doc.endpoint('POST /driver/auth/refresh', 'عام')
    doc.paragraph('يجب أن يحتوي الجسم على refreshToken فقط، بطول من 20 إلى 1024 محرفا:')
    doc.code('{ "refreshToken": "a1b2..." }')
    doc.paragraph(
        'الاستجابة 200 OK تعيد data بالشكل { accessToken, refreshToken, expiresIn }، مثل تحديث الراكب. استبدل الرمزين.'
    )
    doc.table(
        ['الحالة', 'message', 'المعنى'],
        [
            ['400', 'Validation failed', 'الرمز مفقود أو غير صالح، أو وُجدت حقول إضافية.'],
            ['401', 'Invalid or expired refresh token', 'الرمز منته أو مستخدم أو ملغى، أو الحساب موقوف أو محذوف. سجّل الخروج محليا.'],
        ],
        [0.7, 2.3, 2.3],
        ['mono', 'mono', 'rtl'],
    )

    doc.h2('4.4 الخروج من هذا الجهاز', 's4-4')
    doc.endpoint('POST /driver/auth/logout', 'عام')
    doc.code('{ "refreshToken": "a1b2..." }')
    doc.paragraph(
        'الاستجابة 200 OK تعيد data بالشكل { "revoked": true }. يلغي النداء جلسة هذا الدخول على هذا الجهاز، بما في ذلك كل رمز تحديث دُوّر منها. جلسات الأجهزة الأخرى تبقى مسجلة. النداء يعيد 200 دائما ويمكن تكراره.'
    )

    doc.h2('4.5 الخروج من كل الأجهزة', 's4-5')
    doc.endpoint('POST /driver/auth/logout-all', 'يتطلب رمز وصول السائق')
    doc.callout(
        'warn',
        'يجب إرسال كائن JSON فارغ في الجسم. الطلب الذي بلا جسم يعيد 400 مع الرسالة Validation failed.'
    )
    doc.code(
        'POST /api/v1/driver/auth/logout-all\n'
        'Authorization: Bearer <driverAccessToken>\n'
        'Content-Type: application/json\n'
        '\n'
        '{}'
    )
    doc.paragraph('الاستجابة 200 OK تعيد data بالشكل { "revokedAll": true }.')
    doc.table(
        ['الحالة', 'message', 'المعنى'],
        [
            ['400', 'Validation failed', 'الجسم مفقود أو ليس {} بالضبط.'],
            ['401', 'Invalid or expired access token / User not found or inactive / Current account is unavailable.', 'سجّل الخروج محليا.'],
            ['403', 'Forbidden for this role', 'الرمز ليس رمز سائق.'],
        ],
        [0.65, 2.5, 1.7],
        ['mono', 'mono', 'rtl'],
    )

    doc.h1('5. مسارات المدير', 's5')
    doc.paragraph('لا يوجد مسار لتسجيل المدير. حسابات المدير ينشئها فريق التشغيل.')
    doc.paragraph(
        'مصادقة المدير مطابقة لمصادقة السائق، تحت البادئة /admin/auth/، وبنفس أجسام الطلب الصارمة:'
    )
    doc.table(
        ['المسار', 'الجسم', 'بيانات النجاح'],
        [
            ['POST /admin/auth/login', 'واحد فقط من phone أو username، مع password', '{ user, accessToken, refreshToken, expiresIn }'],
            ['POST /admin/auth/refresh', '{ "refreshToken" }', '{ accessToken, refreshToken, expiresIn }'],
            ['POST /admin/auth/logout', '{ "refreshToken" }', '{ revoked: true }'],
            ['POST /admin/auth/logout-all', '{} مطلوب، مع رمز وصول المدير', '{ revokedAll: true }'],
        ],
        [1.7, 1.9, 2.1],
        ['mono', 'rtl', 'mono'],
    )
    doc.paragraph('كائن user عند دخول المدير لا يتضمن صورة ولا طوابع زمنية:')
    doc.code(
        '{\n'
        '  "id": "665f1c2e9a1b2c3d4e5f0100",\n'
        '  "phone": "+970599000001",\n'
        '  "username": "admin",\n'
        '  "fullName": "Rukba Admin",\n'
        '  "role": "admin",\n'
        '  "status": "active"\n'
        '}'
    )
    doc.paragraph(
        'استجابات الخطأ تطابق مسارات السائق في القسم 4. الحساب الذي ليس مديرا يعيد 401 مع الرسالة Invalid credentials عند دخول المدير.'
    )

    doc.h1('6. إدارة الجلسة في التطبيق', 's6')
    doc.h2('6.1 احفظ الدور مع الرمزين', 's6-1')
    doc.paragraph('احفظ role و accessToken و refreshToken معا. استخدم الدور لاختيار البادئة الصحيحة:')
    doc.code('/auth\n/driver/auth\n/admin/auth')
    doc.paragraph(
        'إرسال رمز إلى مسار تحديث دور آخر يعيد 401. للخروج، استدع دائما المسار المطابق للدور المحفوظ. راجع القسم 8.'
    )

    doc.h2('6.2 إرفاق رمز الوصول وتحديثه', 's6-2')
    doc.paragraph('عندما يرد مسار محمي بالحالة 401، نفّذ التسلسل التالي:')
    doc.flow()
    doc.paragraph('القواعد الموصى بها:')
    doc.numbered(
        [
            'حدّث طلبا واحدا في كل مرة. لأن رموز التحديث تُدوّر، فإن طلبَي تحديث متوازيين بالرمز نفسه يجعل أحدهما يفشل بالحالة 401، فيُسجَّل خروج المستخدم. ضع التحديث خلف قفل، أو وراء وعد واحد قيد التنفيذ، ودع كل الطلبات المنتظرة تستخدم نتيجته.',
            'حدّث الرمز استباقيا. فك مطالبة exp من رمز الوصول، وحدّث قبل نحو 60 ثانية من انتهائه، أو عندما يعود التطبيق إلى المقدمة.',
            'أعد المحاولة مرة واحدة. بعد التحديث الناجح أعد الطلب الأصلي مرة واحدة فقط. إذا فشل مجددا بالحالة 401 فسجّل الخروج.',
            'احفظ رمز التحديث الجديد قبل أي عمل آخر. إذا أُغلق التطبيق بعد أن دوّر الخادم الرمز وقبل حفظ الرمز الجديد، فلن يعمل الرمز القديم ويجب على المستخدم تسجيل الدخول من جديد.',
        ]
    )

    doc.h2('6.3 بدء تشغيل التطبيق', 's6-3')
    doc.numbered(
        [
            'إذا لم يوجد رمز تحديث محفوظ، فأظهر شاشة تسجيل الدخول.',
            'وإلا فاستدع مسار التحديث الخاص بالدور.',
        ]
    )
    doc.bullets(
        [
            'عند 200: احفظ الرمزين، ثم حمّل المستخدم عبر GET /profile للراكب، أو GET /driver/profile للسائق.',
            'عند 401: امسح الرموز وأظهر شاشة تسجيل الدخول.',
            'عند خطأ في الشبكة: أبق الرموز وأعد المحاولة لاحقا. لا تسجّل خروج المستخدم بسبب انقطاع الاتصال أو استجابات 5xx.',
        ]
    )

    doc.h2('6.4 تسجيل الخروج', 's6-4')
    doc.numbered(
        [
            'استدع POST /{role}/auth/logout برمز التحديث الحالي. هذا النداء بأفضل جهد، وتجاهل فشله.',
            'امسح الرمزين من التخزين الآمن مهما كانت نتيجة النداء.',
        ]
    )
    doc.callout(
        'warn',
        'رمز الوصول هو JWT بلا حالة على الخادم. يبقى صالحا حتى وقت انتهائه، أي حتى 15 دقيقة، حتى بعد الخروج أو الخروج من كل الأجهزة. احذفه دائما من الجهاز.'
    )

    doc.h2('6.5 معالجة الحالة 429 (قفل الدخول)', 's6-5')
    doc.paragraph('تُحسب محاولات الدخول الفاشلة لكل حساب ولكل عنوان IP للجهاز خلال نافذة مدتها 15 دقيقة:')
    doc.table(
        ['النطاق', 'المحاولات الفاشلة قبل القفل', 'مدة القفل'],
        [
            ['الحساب', '5', '15 دقيقة'],
            ['عنوان IP', '20', '15 دقيقة'],
        ],
        [1.2, 2, 1.3],
        ['rtl', 'mono', 'rtl'],
    )
    doc.paragraph('هذه هي القيم الافتراضية في الخادم، ويمكن لفريق التشغيل تغييرها.')
    doc.bullets(
        [
            'أثناء القفل، حتى كلمة المرور الصحيحة تعيد 429. أظهر عدّا تنازليا من data.retryAfterSeconds أو من ترويسة Retry-After، وعطّل زر الدخول حتى ينتهي الوقت.',
            'لا تعِد المحاولة تلقائيا أثناء القفل. كل محاولة تُحتسب ضمن الحد.',
            'تسجيل الدخول الناجح يصفر عداد الفشل الخاص بالحساب.',
            'القفل لا يغيّر status الخاص بالحساب. ينتهي القفل وحده، ولا يحتاج إجراءا من المدير.',
        ]
    )

    doc.h2('6.6 معالجة 401 و 403 في بقية المسارات', 's6-6')
    doc.table(
        ['الاستجابة', 'الإجراء'],
        [
            ['401 Invalid or expired access token', 'حدّث الرمز ثم أعد المحاولة مرة واحدة، كما في القسم 6.2.'],
            ['401 User not found or inactive', 'الحساب موقوف أو محذوف. امسح الرموز وأظهر الدخول، ويمكن عرض رسالة تفيد بأن الحساب غير متاح.'],
            ['403 Forbidden for this role', 'خطأ في التطبيق: استُدعي مسار خاص بدور باستخدام رمز دور آخر.'],
            ['403 Driver is not eligible to operate', 'السائق غير معتمد بعد. أظهر شاشة حالة الطلب.'],
        ],
        [2.15, 2.5],
        ['mono', 'rtl'],
    )

    doc.h1('7. مرجع أخطاء مسارات المصادقة', 's7')
    doc.table(
        ['HTTP', 'message', 'يظهر في', 'إجراء التطبيق'],
        [
            ['400', 'Validation failed', 'كل المسارات', 'اعرض data.errors[].message بجانب كل حقل.'],
            ['400', 'Invalid phone number', 'التسجيل والدخول لكل الأدوار', 'ميّز حقل الهاتف.'],
            ['401', 'Invalid credentials', 'الدخول لكل الأدوار', 'اعرض أن الهاتف أو اسم المستخدم أو كلمة المرور غير صحيحة.'],
            ['401', 'Invalid or expired refresh token', 'التحديث لكل الأدوار', 'امسح الرموز وانتقل إلى الدخول.'],
            ['401', 'Invalid or expired access token', 'الخروج من كل الأجهزة والمسارات المحمية', 'حدّث الرمز ثم أعد المحاولة.'],
            ['401', 'User not found or inactive', 'الخروج من كل الأجهزة والمسارات المحمية', 'امسح الرموز وانتقل إلى الدخول.'],
            ['403', 'Account is not active', 'دخول الراكب', 'اعرض أن الحساب موقوف.'],
            ['403', 'Forbidden for this role', 'الخروج من كل الأجهزة والمسارات المحمية', 'صحّح توجيه الأدوار داخل التطبيق.'],
            ['409', 'Phone already registered / Username already taken', 'تسجيل الراكب', 'ميّز الحقل المتعارض.'],
            ['409', 'Phone or username already registered', 'تسجيل السائق، أو تسجيل راكبَين في اللحظة نفسها', 'اطلب هاتفا أو اسم مستخدم مختلفين.'],
            ['429', 'Too many failed sign-in attempts. Try again later.', 'الدخول لكل الأدوار', 'أظهر عدّا تنازليا من retryAfterSeconds.'],
            ['500', 'Internal server error', 'أي مسار', 'اعرض خطأ عاما واسمح بإعادة المحاولة.'],
            ['503', 'Registration is temporarily unavailable.', 'تسجيل السائق', 'اطلب من المستخدم المحاولة لاحقا.'],
        ],
        [0.55, 2.15, 1.55, 1.7],
        ['mono', 'mono', 'rtl', 'rtl'],
    )

    doc.h1('8. مشكلات معروفة', 's8')
    doc.paragraph(
        'هذه مشكلات حالية في الخادم يجب أن يحمي التطبيق نفسه منها إلى أن تُصلح في الخادم.'
    )
    doc.callout(
        'danger',
        'دخول الراكب لا يرفض بعد حسابات السائق أو المدير. إرسال بيانات سائق أو مدير إلى POST /auth/login يعيد حاليا 200، ثم يفشل تحديث الراكب التالي بالحالة 401. بعد دخول الراكب تحقق من أن data.user.role يساوي passenger. إذا لم يكن كذلك فتخلّص من الرموز، واطلب من المستخدم استخدام تطبيق السائق أو شاشته.'
    )
    doc.callout(
        'danger',
        'خروج الراكب يقبل رمز تحديث أي دور. إرسال رمز تحديث سائق أو مدير إلى POST /auth/logout يلغي ذلك الرمز. استدع دائما مسار الخروج المطابق للدور المحفوظ.'
    )

    doc.ensure(210)
    doc.h1('9. حسابات الاختبار للتطوير', 's9')
    doc.paragraph(
        'هذه الحسابات توجد فقط بعد تشغيل بذرة البيانات بالأمر npm run seed. وهي غير متاحة في بيئة الإنتاج.'
    )
    doc.table(
        ['الدور', 'الهاتف', 'اسم المستخدم', 'كلمة المرور'],
        [
            ['المدير', '+970599000001', 'admin', 'Password123!'],
            ['السائق', '+970599000002', 'ahmad_driver', 'Password123!'],
            ['الراكب', '+970599000003', 'sara_passenger', 'Password123!'],
        ],
        [0.9, 1.5, 1.5, 1.4],
        ['rtl', 'mono', 'mono', 'mono'],
    )


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = Guide(OUT)
    build(doc)
    doc.finish()
    print(f'pages={doc.page_num}')
    print(f'wrote={OUT}')
    if WARNINGS:
        print(f'warnings={len(WARNINGS)}')
        for item in WARNINGS:
            print(item)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
