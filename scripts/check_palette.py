"""Reject hard-coded presentation colours outside the GUI token stylesheet."""

import argparse
import base64
import binascii
import re
from pathlib import Path
from urllib.parse import unquote_to_bytes

ROOT = Path(__file__).resolve().parents[1]
SUFFIXES = {'.css', '.html', '.js', '.jsx', '.svg', '.ts', '.tsx'}
NAMES = frozenset('''aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond
blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson
cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen
darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue
lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon
lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen
linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose
moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
whitesmoke yellow yellowgreen'''.split())
HEX = re.compile(r'(?<![\w-])#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\w-])', re.I)
FUNCTION = re.compile(r'(?<![\w-])(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab|color)\(', re.I)
WORD = re.compile(r'[\w-]+')
COMMENT = re.compile(r'/\*.*?\*/', re.S)
DECLARATION = re.compile(r'(?:^|[;{])\s*([\w-]+)\s*:\s*([^;}]+)', re.M)
URL = re.compile(r'''url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)''', re.I)
STRING = re.compile(r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*' ''', re.X | re.S)
PAINT = r'(?:[\w-]*color|fill|stroke|background(?:Image)?|border[\w-]*|outline|(?:box|text)Shadow|filter)'
ATTRIBUTE = re.compile(rf'''(?<![\w-])(?:{PAINT})\s*=\s*\{{?\s*(["'`])(.*?)\1''', re.I | re.S)
INLINE_PAINT = re.compile(rf'''(?<![\w-])(?:["']?{PAINT}["']?)\s*:\s*(["'`])(.*?)\1''', re.I | re.S)
STYLE = re.compile(r'''\bstyle\s*=\s*(["'])(.*?)\1''', re.I | re.S)
THEME_META = re.compile(r'''<meta\b(?=[^>]*\bname\s*=\s*["']theme-color["'])[^>]*\bcontent\s*=\s*(["'])(.*?)\1''', re.I | re.S)
STYLE_TAG = re.compile(r'<style\b[^>]*>(.*?)</style>', re.I | re.S)
SVG_DATA = re.compile(r'''(?:"(data:image/svg\+xml[^"]*)"|'(data:image/svg\+xml[^']*)'|`(data:image/svg\+xml[^`]*)`|(data:image/svg\+xml[^\s"'`)]*))''', re.I)
STYLE_OBJECT = re.compile(r'\bstyle\s*=\s*\{\s*\{')
PAINT_NAME = re.compile(PAINT, re.I)
JS_TOKEN = re.compile(rf'''{STRING.pattern}|//[^\r\n]*|\?\?|\?\.|[\w$-]+|[^\s]''', re.X | re.S)
TEMPLATE_PART = re.compile(r'\\.|`|\$\{', re.S)
VAR_NAME = re.compile(r'(?<![\w-])var\(\s*[^,\s)]+', re.I)
BRACKETS = {'(': ')', '[': ']', '{': '}'}

# A token is a source span; balanced groups and templates stay opaque unless
# they are themselves a paint value. This keeps runtime tests and calls out.
Token = tuple[int, int]


def expression_tokens(source: str, start: int, stop: str) -> tuple[list[Token], int]:
    tokens = []
    while match := JS_TOKEN.search(source, start):
        token = match[0]
        start = match.end()
        if token == stop:
            return tokens, start
        if token.startswith('//'):
            continue
        if token in BRACKETS:
            _, start = expression_tokens(source, start, BRACKETS[token])
        elif token == '`':
            _, start = interpolations(source, start)
        tokens.append((match.start(), start))
    return tokens, len(source)


def interpolations(source: str, start: int) -> tuple[list[tuple[int, int, list[Token]]], int]:
    parts = []
    while match := TEMPLATE_PART.search(source, start):
        start = match.end()
        if match[0] == '`':
            return parts, start
        if match[0] == '${':
            tokens, start = expression_tokens(source, start, '}')
            parts.append((match.start(), start, tokens))
    return parts, len(source)


def paint_expression(source: str, tokens: list[Token]):
    if len(tokens) == 1:
        start, end = tokens[0]
        first = source[start]
        if first == '(':
            inner, _ = expression_tokens(source, start + 1, ')')
            yield from paint_expression(source, inner)
        elif first in ('"', "'"):
            yield from ((start + 1 + offset, paint) for offset, paint in literals(source[start + 1:end - 1]))
        elif first == '`':
            parts, _ = interpolations(source, start + 1)
            occupied = list(source[start + 1:end - 1])
            for opening, closing, _ in parts:
                occupied[opening - start - 1:closing - start - 1] = 'x' * (closing - opening)
            static = ''.join(occupied)
            yield from ((start + 1 + offset, paint) for offset, paint in literals(static))
            opaque = [match.span() for pattern in (URL, STRING, VAR_NAME) for match in pattern.finditer(static)]
            for opening, closing, inner in parts:
                pos = opening - start - 1
                before, after = source[opening - 1], source[closing:closing + 1]
                if (not any(left <= pos < right for left, right in opaque)
                        and not any(re.fullmatch(r'[\w-]', char) for char in (before, after))):
                    yield from paint_expression(source, inner)
        return

    question = None
    nested = 0
    for index, (start, end) in enumerate(tokens):
        token = source[start:end]
        if token == '?':
            if question is None:
                question = index
            else:
                nested += 1
        elif token == ':' and question is not None:
            if nested:
                nested -= 1
            else:
                yield from paint_expression(source, tokens[question + 1:index])
                yield from paint_expression(source, tokens[index + 1:])
                return


def direct_paints(source: str, start: int, end: int):
    for item in INLINE_PAINT.finditer(source, start, end):
        for offset, paint in literals(item[2]):
            yield item.start(2) + offset, paint


def inline_paints(source: str):
    """Read JSX style fields, then retain the existing direct matcher elsewhere."""
    cursor = 0
    while match := STYLE_OBJECT.search(source, cursor):
        yield from direct_paints(source, cursor, match.start())
        tokens, cursor = expression_tokens(source, match.end(), '}')
        field = 0
        for index in range(len(tokens) + 1):
            if index < len(tokens) and source[slice(*tokens[index])] != ',':
                continue
            if index - field >= 3:
                name = source[slice(*tokens[field])].strip("\"'")
                if PAINT_NAME.fullmatch(name) and source[slice(*tokens[field + 1])] == ':':
                    yield from paint_expression(source, tokens[field + 2:index])
            field = index + 1
    yield from direct_paints(source, cursor, len(source))


def hide(match: re.Match) -> str:
    """Keep offsets and line numbers when replacing non-source text."""
    return ''.join('\n' if char == '\n' else ' ' for char in match.group())


def literals(value: str):
    clean = URL.sub(hide, value)
    clean = STRING.sub(hide, clean)
    for regex in (HEX, FUNCTION):
        for match in regex.finditer(clean):
            yield match.start(), match.group()
    for word in WORD.finditer(clean):
        if word.group().lower() in NAMES:
            yield word.start(), word.group()


def css_literals(source: str):
    clean = COMMENT.sub(hide, source)
    clean = URL.sub(hide, clean)
    clean = STRING.sub(hide, clean)
    for decl in DECLARATION.finditer(clean):
        for offset, text in literals(decl[2]):
            yield decl.start(2) + offset, text


def violations(source: str, suffix: str, *, inline: bool = False):
    if suffix == '.css':
        yield from css_literals(source)
    else:
        clean = COMMENT.sub(hide, source)
        clean = re.sub(r'<!--.*?-->', hide, clean, flags=re.S)
        for context in (ATTRIBUTE, THEME_META):
            for item in context.finditer(clean):
                for offset, text in literals(item[2]):
                    yield item.start(2) + offset, text
        yield from inline_paints(clean)
        for context, index in ((STYLE, 2), (STYLE_TAG, 1)):
            for item in context.finditer(clean):
                for offset, text in css_literals(item[index]):
                    yield item.start(index) + offset, text
    if not inline:
        for uri in SVG_DATA.finditer(source):
            try:
                value = next(part for part in uri.groups() if part is not None)
                header, separator, body = value.partition(',')
                if not separator:
                    continue
                markup = unquote_to_bytes(body)
                if ';base64' in header.lower():
                    markup = base64.b64decode(markup, validate=True)
                for _, text in violations(markup.decode(), '.svg', inline=True):
                    yield uri.start(), f'{text} (SVG data URI)'
            except (UnicodeError, binascii.Error):
                continue


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', required=True, action='store_true')
    parser.parse_args()
    frontend = ROOT / 'frontend'
    token_file = frontend / 'src/styles/tokens.css'
    failed = False
    for path in sorted([*frontend.glob('*.html'), *(frontend / 'src').rglob('*'), *(frontend / 'public').rglob('*')]):
        if path == token_file or path.suffix not in SUFFIXES or not path.is_file():
            continue
        source = path.read_text(encoding='utf-8')
        issues = sorted(set(violations(source, path.suffix)))
        for offset, text in issues:
            line = source.count('\n', 0, offset) + 1
            print(f'{path.relative_to(ROOT).as_posix()}:{line}: use a palette token instead of {text!r}')
            failed = True
    if not failed:
        print('GUI palette: no hard-coded colours outside tokens.css.')
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
