import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from specifier_converter import SpecifierError, convert_specifiers


def converted(text):
    return convert_specifiers(text)


def signature(result):
    return [(argument.position, argument.conversion) for argument in result.arguments]


class SingleSpecifierTests(unittest.TestCase):
    def test_at_sign_becomes_string_conversion(self):
        result = converted("Bonjour %@")
        self.assertEqual(result.text, "Bonjour %s")
        self.assertEqual(signature(result), [(1, "s")])

    def test_long_integer_family_becomes_decimal(self):
        for ios in ("%lld", "%ld", "%d", "%i", "%lu", "%llu", "%hd", "%zd"):
            with self.subTest(ios=ios):
                result = converted(f"{ios} messages")
                self.assertEqual(result.text, "%d messages")
                self.assertEqual(signature(result), [(1, "d")])

    def test_float_precision_is_preserved(self):
        result = converted("Score %.2f")
        self.assertEqual(result.text, "Score %.2f")
        self.assertEqual(signature(result), [(1, "f")])

    def test_float_with_length_modifier_loses_it(self):
        self.assertEqual(converted("%lf").text, "%f")
        self.assertEqual(converted("%Lf").text, "%f")

    def test_width_and_flags_are_preserved(self):
        self.assertEqual(converted("%05d").text, "%05d")
        self.assertEqual(converted("%-8lld").text, "%-8d")

    def test_hexadecimal_and_octal_are_kept(self):
        self.assertEqual(converted("%x").text, "%x")
        self.assertEqual(converted("%lX").text, "%X")
        self.assertEqual(converted("%o").text, "%o")

    def test_string_without_specifier_is_untouched(self):
        result = converted("Annuler")
        self.assertEqual(result.text, "Annuler")
        self.assertEqual(result.arguments, ())
        self.assertTrue(result.formatted)

    def test_single_ios_positional_specifier_stays_positional(self):
        result = converted("%1$@")
        self.assertEqual(result.text, "%1$s")
        self.assertEqual(signature(result), [(1, "s")])

    def test_single_positional_specifier_keeps_its_index(self):
        result = converted("Niveau %2$lld")
        self.assertEqual(result.text, "Niveau %2$d")
        self.assertEqual(signature(result), [(2, "d")])


class PercentTests(unittest.TestCase):
    def test_escaped_percent_without_argument_becomes_a_single_percent(self):
        result = converted("100%%")
        self.assertEqual(result.text, "100%")
        self.assertEqual(result.arguments, ())
        self.assertFalse(result.formatted)

    def test_escaped_percent_alone_is_not_an_argument(self):
        result = converted("%%")
        self.assertEqual(result.text, "%")
        self.assertEqual(result.arguments, ())
        self.assertFalse(result.formatted)

    def test_escaped_percent_next_to_a_specifier(self):
        result = converted("%@%%")
        self.assertEqual(result.text, "%s%%")
        self.assertEqual(signature(result), [(1, "s")])

    def test_percent_followed_by_conversion_letter_after_escape_is_text(self):
        result = converted("%%d")
        self.assertEqual(result.text, "%d")
        self.assertEqual(result.arguments, ())
        self.assertFalse(result.formatted)

    def test_prose_percent_with_space_is_not_a_specifier(self):
        result = converted("Crédit de 30 % sur chaque dix")
        self.assertEqual(result.arguments, ())
        self.assertEqual(result.text, "Crédit de 30 % sur chaque dix")
        self.assertFalse(result.formatted)

    def test_prose_percent_next_to_a_specifier_is_doubled(self):
        result = converted("%@ gagne 30 % de plus")
        self.assertEqual(result.text, "%s gagne 30 %% de plus")
        self.assertTrue(result.formatted)

    def test_trailing_percent_is_prose(self):
        result = converted("Remise 50%")
        self.assertEqual(result.text, "Remise 50%")
        self.assertFalse(result.formatted)


class AlwaysFormattedTests(unittest.TestCase):
    def test_plural_item_without_argument_doubles_prose_percent(self):
        result = convert_specifiers("30 % de plus", always_formatted=True)
        self.assertEqual(result.text, "30 %% de plus")
        self.assertTrue(result.formatted)

    def test_plural_item_keeps_existing_escaped_percent(self):
        result = convert_specifiers("100%%", always_formatted=True)
        self.assertEqual(result.text, "100%%")
        self.assertTrue(result.formatted)


class MultipleSpecifiersTests(unittest.TestCase):
    def test_two_mixed_specifiers_become_positional_in_order(self):
        result = converted("%@ a envoyé %lld messages")
        self.assertEqual(result.text, "%1$s a envoyé %2$d messages")
        self.assertEqual(signature(result), [(1, "s"), (2, "d")])

    def test_three_specifiers_are_numbered_sequentially(self):
        result = converted("%@ %@ %lld")
        self.assertEqual(result.text, "%1$s %2$s %3$d")
        self.assertEqual(signature(result), [(1, "s"), (2, "s"), (3, "d")])

    def test_already_positional_specifiers_keep_their_numbers(self):
        result = converted("%2$@ avant %1$lld")
        self.assertEqual(result.text, "%2$s avant %1$d")
        self.assertEqual(signature(result), [(1, "d"), (2, "s")])

    def test_float_precision_survives_positional_rewrite(self):
        result = converted("%@, score %.2f")
        self.assertEqual(result.text, "%1$s, score %2$.2f")
        self.assertEqual(signature(result), [(1, "s"), (2, "f")])

    def test_escaped_percent_does_not_count_as_a_specifier(self):
        result = converted("%lld%% de %@")
        self.assertEqual(result.text, "%1$d%% de %2$s")

    def test_repeated_positional_index_is_one_argument(self):
        result = converted("%1$@ puis encore %1$@")
        self.assertEqual(result.text, "%1$s puis encore %1$s")
        self.assertEqual(signature(result), [(1, "s")])

    def test_mixing_positional_and_sequential_is_refused(self):
        with self.assertRaises(SpecifierError):
            converted("%1$@ et %@")

    def test_repeated_index_with_two_conversions_is_refused(self):
        with self.assertRaises(SpecifierError):
            converted("%1$@ et %1$lld")


class UnsupportedSpecifierTests(unittest.TestCase):
    def test_pointer_specifier_is_refused(self):
        with self.assertRaises(SpecifierError):
            converted("%p")

    def test_star_width_is_refused(self):
        with self.assertRaises(SpecifierError):
            converted("%*d")

    def test_position_zero_is_refused(self):
        with self.assertRaises(SpecifierError):
            converted("%0$@")


if __name__ == "__main__":
    unittest.main()
