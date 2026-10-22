import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from android_xml_writer import (
    BANNER,
    PluralsResource,
    StringResource,
    WriterError,
    render_document,
    render_value,
)
from support import parse_resources


def string(name, text, formatted=True):
    return StringResource(name=name, text=text, formatted=formatted)


def roundtrip(text):
    document = render_document([string("sample", text)])
    return parse_resources(document)["sample"]


class EscapingTests(unittest.TestCase):
    def test_apostrophe_is_escaped(self):
        self.assertEqual(render_value("L'équipe"), "L\\'équipe")

    def test_double_quote_is_escaped(self):
        self.assertEqual(render_value('Dis "oui"'), 'Dis \\"oui\\"')

    def test_leading_at_sign_is_escaped(self):
        self.assertEqual(render_value("@alice a écrit"), "\\@alice a écrit")

    def test_inner_at_sign_is_left_alone(self):
        self.assertEqual(render_value("écris à a@b.fr"), "écris à a@b.fr")

    def test_leading_question_mark_is_escaped(self):
        self.assertEqual(render_value("?aide"), "\\?aide")

    def test_inner_question_mark_is_left_alone(self):
        self.assertEqual(render_value("Vraiment ?"), "Vraiment ?")

    def test_ampersand_and_angle_brackets_are_xml_escaped(self):
        self.assertEqual(render_value("A & B < C > D"), "A &amp; B &lt; C &gt; D")

    def test_literal_newline_becomes_backslash_n(self):
        self.assertEqual(render_value("ligne 1\nligne 2"), "ligne 1\\nligne 2")

    def test_tab_becomes_backslash_t(self):
        self.assertEqual(render_value("a\tb"), "a\\tb")

    def test_backslash_is_doubled(self):
        self.assertEqual(render_value("a\\b"), "a\\\\b")

    def test_carriage_return_line_feed_is_one_newline(self):
        self.assertEqual(render_value("a\r\nb"), "a\\nb")

    def test_control_character_is_refused(self):
        with self.assertRaises(WriterError):
            render_value("a\x01b")

    def test_unicode_is_written_as_is(self):
        self.assertEqual(render_value("éàü — ’ 中文 ⁦x⁩"), "éàü — ’ 中文 ⁦x⁩")

    def test_inner_double_space_is_protected_by_quotes(self):
        self.assertEqual(render_value("a  b"), '"a  b"')

    def test_edge_spaces_are_protected_by_quotes(self):
        self.assertEqual(render_value(" a "), '" a "')


class MarkdownTests(unittest.TestCase):
    def test_double_asterisks_become_bold_tags(self):
        self.assertEqual(render_value("Code envoyé à **%s**"), "Code envoyé à <b>%s</b>")

    def test_several_bold_runs(self):
        self.assertEqual(render_value("**a** et **b**"), "<b>a</b> et <b>b</b>")

    def test_bold_content_is_escaped_too(self):
        self.assertEqual(render_value("**a & b**"), "<b>a &amp; b</b>")

    def test_unbalanced_markup_is_refused(self):
        with self.assertRaises(WriterError):
            render_value("**ouvert")

    def test_single_asterisk_is_plain_text(self):
        self.assertEqual(render_value("2 * 3"), "2 * 3")

    def test_leading_at_sign_inside_leading_bold_is_escaped(self):
        self.assertEqual(render_value("**@alice** écrit"), "<b>\\@alice</b> écrit")


class RoundTripTests(unittest.TestCase):
    def test_every_special_character_survives_a_trip_through_aapt_rules(self):
        for text in (
            "L'équipe & l'\"autre\" <b> ?",
            "@alice dit ?",
            "ligne 1\nligne 2\ttab \\ fin",
            "a  b",
            " début et fin ",
            "100%% sûr",
        ):
            with self.subTest(text=text):
                self.assertEqual(roundtrip(text), text)

    def test_bold_markup_is_found_back_as_markup(self):
        self.assertEqual(roundtrip("Code envoyé à **%s** !"), "Code envoyé à <b>%s</b> !")


class DocumentTests(unittest.TestCase):
    def test_document_starts_with_the_generated_banner(self):
        document = render_document([string("a", "x")])
        self.assertTrue(document.startswith(BANNER + "\n"))
        self.assertIn("GÉNÉRÉ — ne pas modifier", BANNER)

    def test_document_is_well_formed_xml_with_a_resources_root(self):
        root = ET.fromstring(render_document([string("a", "x")]))
        self.assertEqual(root.tag, "resources")

    def test_resources_are_sorted_by_name_whatever_the_input_order(self):
        names = ["zeta", "alpha", "Mid", "beta"]
        document = render_document([string(name, "x") for name in names])
        order = [element.get("name") for element in ET.fromstring(document)]
        self.assertEqual(order, sorted(names))

    def test_rendering_twice_gives_identical_bytes(self):
        resources = [string("b", "x"), string("a", "é")]
        self.assertEqual(
            render_document(resources).encode("utf-8"),
            render_document(list(reversed(resources))).encode("utf-8"),
        )

    def test_document_ends_with_a_single_newline(self):
        document = render_document([string("a", "x")])
        self.assertTrue(document.endswith("</resources>\n"))

    def test_empty_document_still_has_banner_and_root(self):
        document = render_document([])
        self.assertTrue(document.startswith(BANNER))
        self.assertEqual(ET.fromstring(document).tag, "resources")

    def test_unformatted_string_carries_the_formatted_false_attribute(self):
        document = render_document([string("a", "30 % de plus", formatted=False)])
        self.assertEqual(ET.fromstring(document)[0].get("formatted"), "false")

    def test_formatted_string_has_no_formatted_attribute(self):
        document = render_document([string("a", "x")])
        self.assertIsNone(ET.fromstring(document)[0].get("formatted"))

    def test_duplicate_names_are_refused(self):
        with self.assertRaises(WriterError):
            render_document([string("a", "x"), string("a", "y")])

    def test_plurals_are_rendered_with_their_quantities_in_cldr_order(self):
        plurals = PluralsResource(name="unread", items=(("other", "%d non lues"), ("one", "%d non lue")))
        resolved = parse_resources(render_document([plurals]))
        self.assertEqual(resolved["unread"], {"one": "%d non lue", "other": "%d non lues"})
        quantities = [item.get("quantity") for item in ET.fromstring(render_document([plurals]))[0]]
        self.assertEqual(quantities, ["one", "other"])


if __name__ == "__main__":
    unittest.main()
