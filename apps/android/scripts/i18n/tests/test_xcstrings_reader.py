import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from support import FIXTURES, catalog_document, make_temp_dir, plural_variations, string_unit, write_json
from xcstrings_reader import ANDROID_LOCALES, CatalogError, read_catalog


def locale(code):
    return next(candidate for candidate in ANDROID_LOCALES if candidate.code == code)


def catalog_with(strings, source_language="fr"):
    directory = make_temp_dir()
    path = write_json(directory, "Localizable.xcstrings", catalog_document(strings, source_language))
    return read_catalog(path)


class LocalesTests(unittest.TestCase):
    def test_the_seven_target_languages_map_to_their_values_folders(self):
        self.assertEqual(
            {candidate.code: candidate.folder for candidate in ANDROID_LOCALES},
            {
                "en": "values",
                "fr": "values-fr",
                "es": "values-es",
                "de": "values-de",
                "it": "values-it",
                "pt": "values-pt",
                "ar": "values-ar",
            },
        )

    def test_brazilian_portuguese_is_the_catalog_code_of_values_pt(self):
        self.assertEqual(locale("pt").catalog_codes, ("pt-BR", "pt"))


class ReadingTests(unittest.TestCase):
    def test_source_language_is_read_from_the_catalog(self):
        self.assertEqual(read_catalog(FIXTURES / "mini.xcstrings").source_language, "fr")

    def test_simple_entry_exposes_its_texts(self):
        entry = read_catalog(FIXTURES / "mini.xcstrings").entry("greeting.hello")
        self.assertEqual(entry.localizations["en"].text, "Hello")
        self.assertEqual(entry.localizations["pt-BR"].text, "Olá")
        self.assertFalse(entry.stale)

    def test_stale_entry_is_flagged(self):
        entry = read_catalog(FIXTURES / "mini.xcstrings").entry("stale.removed")
        self.assertTrue(entry.stale)

    def test_plural_entry_exposes_its_quantities_in_catalog_order(self):
        entry = read_catalog(FIXTURES / "mini.xcstrings").entry("unread.complete")
        self.assertEqual(list(entry.localizations["ar"].plural), ["zero", "one", "two", "few", "many", "other"])
        self.assertIsNone(entry.localizations["ar"].text)

    def test_unknown_key_is_reported_with_the_catalog_name(self):
        with self.assertRaises(CatalogError) as raised:
            read_catalog(FIXTURES / "mini.xcstrings").entry("absent.key")
        self.assertIn("absent.key", str(raised.exception))

    def test_has_tells_present_from_absent(self):
        catalog = read_catalog(FIXTURES / "mini.xcstrings")
        self.assertTrue(catalog.has("greeting.hello"))
        self.assertFalse(catalog.has("absent.key"))

    def test_missing_file_is_reported(self):
        with self.assertRaises(CatalogError):
            read_catalog(FIXTURES / "does-not-exist.xcstrings")

    def test_invalid_json_is_reported_with_the_path(self):
        directory = make_temp_dir()
        path = Path(directory) / "broken.xcstrings"
        path.write_text("{ not json", encoding="utf-8")
        with self.assertRaises(CatalogError) as raised:
            read_catalog(path)
        self.assertIn("broken.xcstrings", str(raised.exception))


class SourceLanguageFallbackTests(unittest.TestCase):
    def test_french_source_key_without_french_localization_reuses_the_key(self):
        catalog = read_catalog(FIXTURES / "mini.xcstrings")
        entry = catalog.entry("Annuler")
        self.assertEqual(catalog.localization(entry, locale("fr")).text, "Annuler")

    def test_french_localization_wins_over_the_key_when_present(self):
        catalog = read_catalog(FIXTURES / "mini.xcstrings")
        entry = catalog.entry("greeting.hello")
        self.assertEqual(catalog.localization(entry, locale("fr")).text, "Bonjour")

    def test_key_fallback_can_be_declined_for_plural_entries(self):
        catalog = read_catalog(FIXTURES / "mini.xcstrings")
        entry = catalog.entry("unread.nofr")
        self.assertIsNone(catalog.localization(entry, locale("fr"), key_fallback=False))
        self.assertIsNone(catalog.source_localization(entry, key_fallback=False))

    def test_other_languages_do_not_fall_back_to_the_key(self):
        catalog = read_catalog(FIXTURES / "mini.xcstrings")
        entry = catalog.entry("Fermer")
        self.assertIsNone(catalog.localization(entry, locale("es")))

    def test_english_source_catalog_falls_back_to_the_key_for_english(self):
        catalog = catalog_with({"Cancel": {"localizations": {"fr": string_unit("Annuler")}}}, source_language="en")
        entry = catalog.entry("Cancel")
        self.assertEqual(catalog.localization(entry, locale("en")).text, "Cancel")
        self.assertIsNone(catalog.localization(entry, locale("fr")).plural)

    def test_entry_without_any_localization_is_its_own_source_text(self):
        catalog = catalog_with({"Seul": {"extractionState": "manual"}})
        self.assertEqual(catalog.localization(catalog.entry("Seul"), locale("fr")).text, "Seul")


class PortugueseTests(unittest.TestCase):
    def test_brazilian_portuguese_is_preferred(self):
        catalog = catalog_with({"k": {"localizations": {"pt": string_unit("PT"), "pt-BR": string_unit("BR")}}})
        self.assertEqual(catalog.localization(catalog.entry("k"), locale("pt")).text, "BR")

    def test_plain_portuguese_is_used_when_brazilian_is_absent(self):
        catalog = read_catalog(FIXTURES / "mini.xcstrings")
        self.assertEqual(catalog.localization(catalog.entry("pt.only"), locale("pt")).text, "Feito")


class MalformedEntryTests(unittest.TestCase):
    def test_unknown_localization_shape_is_refused_with_key_and_language(self):
        catalog = catalog_with({"k": {"localizations": {"en": {"substitutions": {}}}}})
        with self.assertRaises(CatalogError) as raised:
            catalog.entry("k")
        self.assertIn("k", str(raised.exception))
        self.assertIn("en", str(raised.exception))

    def test_device_variations_are_refused(self):
        catalog = catalog_with({"k": {"localizations": {"en": {"variations": {"device": {}}}}}})
        with self.assertRaises(CatalogError):
            catalog.entry("k")

    def test_plural_quantity_outside_cldr_is_refused(self):
        catalog = catalog_with({"k": {"localizations": {"en": plural_variations(several="x")}}})
        with self.assertRaises(CatalogError):
            catalog.entry("k")

    def test_languages_that_android_does_not_ship_are_not_interpreted(self):
        catalog = catalog_with({"k": {"localizations": {
            "en": string_unit("ok"),
            "zh-Hans": {"variations": {"device": {}}},
        }}})
        self.assertEqual(list(catalog.entry("k").localizations), ["en"])

    def test_other_entries_stay_readable_when_one_is_malformed(self):
        catalog = catalog_with({
            "bad": {"localizations": {"en": {"substitutions": {}}}},
            "good": {"localizations": {"en": string_unit("ok")}},
        })
        self.assertEqual(catalog.entry("good").localizations["en"].text, "ok")


if __name__ == "__main__":
    unittest.main()
