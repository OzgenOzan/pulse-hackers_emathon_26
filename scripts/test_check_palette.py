import unittest

from check_palette import violations


class JsxPaletteTests(unittest.TestCase):
    def test_rejects_static_paint_in_templates_and_their_conditional_branches(self):
        cases = {
            '<g style={{ color: `red` }} />': {'red'},
            '<g style={{ color: active ? `red` : `blue` }} />': {'red', 'blue'},
            '<g style={{ color: `${active ? "red" : "blue"}` }} />': {'red', 'blue'},
            '<g style={{ color: `${active ? `red` : `blue`}` }} />': {'red', 'blue'},
        }
        for source, expected in cases.items():
            with self.subTest(source=source):
                self.assertEqual({paint for _, paint in violations(source, '.tsx')}, expected)

    def test_ignores_runtime_expressions_tokens_and_nonpaint_attributes(self):
        cases = (
            '<g style={{ color: `${theme.colors.red}` }} />',
            '<g style={{ color: `var(--${tone})` }} />',
            '<g style={{ color: `${active === "red" ? colors.danger : colors.info}` }} />',
            '<g style={{ color: `var(--${active ? "red" : "blue"})` }} />',
            '<a href={`#abc`} style={{ color: active ? `var(--text)` : theme.colors.red }} />',
        )
        for source in cases:
            with self.subTest(source=source):
                self.assertEqual(list(violations(source, '.tsx')), [])
