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
        for context in (ATTRIBUTE, INLINE_PAINT, THEME_META):
            for item in context.finditer(clean):
                for offset, text in literals(item[2]):
                    yield item.start(2) + offset, text
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
