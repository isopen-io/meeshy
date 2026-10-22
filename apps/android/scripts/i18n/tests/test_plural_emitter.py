import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from plural_emitter import PluralError, required_quantities, resolve_quantities
from support import Project, plural_variations
from xcstrings_reader import ANDROID_LOCALES

ARABIC = {
    "zero": "لا شيء",
    "one": "واحد",
    "two": "اثنان",
    "few": "قليل",
    "many": "كثير",
    "other": "آخر",
}


def resolve(locale_code, provided, fill_missing=False, key="unread.count"):
    return resolve_quantities(key=key, locale_code=locale_code, provided=provided, fill_missing=fill_missing)


class RequiredQuantitiesTests(unittest.TestCase):
    def test_arabic_requires_the_six_cldr_categories(self):
        self.assertEqual(required_quantities("ar"), ("zero", "one", "two", "few", "many", "other"))

    def test_french_requires_one_many_other(self):
        self.assertEqual(required_quantities("fr"), ("one", "many", "other"))

    def test_romance_languages_share_one_many_other(self):
        for code in ("es", "it", "pt"):
            with self.subTest(code=code):
                self.assertEqual(required_quantities(code), ("one", "many", "other"))

    def test_english_and_german_require_one_other(self):
        for code in ("en", "de"):
            with self.subTest(code=code):
                self.assertEqual(required_quantities(code), ("one", "other"))

    def test_every_target_locale_has_a_cldr_rule(self):
        for locale in ANDROID_LOCALES:
            with self.subTest(locale=locale.code):
                self.assertIn("other", required_quantities(locale.code))


class ResolveQuantitiesTests(unittest.TestCase):
    def test_arabic_keeps_its_six_categories_in_cldr_order(self):
        shuffled = {name: ARABIC[name] for name in ("other", "few", "zero", "many", "two", "one")}
        items = resolve("ar", shuffled)
        self.assertEqual([quantity for quantity, _ in items], ["zero", "one", "two", "few", "many", "other"])
        self.assertEqual(dict(items), ARABIC)

    def test_french_one_other_without_many_is_refused_naming_key_and_language(self):
        with self.assertRaises(PluralError) as raised:
            resolve("fr", {"one": "%d non lue", "other": "%d non lues"}, key="unread.partial")
        message = str(raised.exception)
        self.assertIn("unread.partial", message)
        self.assertIn("fr", message)
        self.assertIn("many", message)

    def test_arabic_missing_categories_are_all_named(self):
        with self.assertRaises(PluralError) as raised:
            resolve("ar", {"one": "a", "other": "b"})
        for quantity in ("zero", "two", "few", "many"):
            self.assertIn(quantity, str(raised.exception))

    def test_french_with_many_is_accepted(self):
        items = resolve("fr", {"one": "un", "many": "des", "other": "dix"})
        self.assertEqual(items, (("one", "un"), ("many", "des"), ("other", "dix")))

    def test_english_one_other_is_accepted(self):
        self.assertEqual(resolve("en", {"one": "1", "other": "n"}), (("one", "1"), ("other", "n")))

    def test_other_is_mandatory_everywhere(self):
        with self.assertRaises(PluralError):
            resolve("en", {"one": "1"})

    def test_quantities_beyond_cldr_are_emitted_as_provided(self):
        items = resolve("en", {"zero": "none", "one": "1", "other": "n"})
        self.assertEqual([quantity for quantity, _ in items], ["zero", "one", "other"])

    def test_unknown_quantity_is_refused(self):
        with self.assertRaises(PluralError):
            resolve("en", {"one": "1", "several": "?", "other": "n"})

    def test_fill_missing_copies_other_into_absent_cldr_categories(self):
        items = resolve("fr", {"one": "un", "other": "plusieurs"}, fill_missing=True)
        self.assertEqual(dict(items), {"one": "un", "many": "plusieurs", "other": "plusieurs"})

    def test_fill_missing_never_overwrites_a_provided_category(self):
        items = resolve("fr", {"one": "un", "many": "des", "other": "plusieurs"}, fill_missing=True)
        self.assertEqual(dict(items)["many"], "des")

    def test_fill_missing_still_needs_other(self):
        with self.assertRaises(PluralError):
            resolve("fr", {"one": "un"}, fill_missing=True)


class GeneratedPluralsTests(unittest.TestCase):
    def generate(self, **catalog_changes):
        project = Project()
        if catalog_changes:
            project.edit_catalog(lambda strings: strings.update(catalog_changes))
        return project, project.run()

    def test_plural_block_is_written_in_every_language_with_the_catalog_quantities(self):
        project, (code, _, err) = self.generate()
        self.assertEqual(code, 0, err)
        self.assertEqual(
            sorted(project.generated("values-ar")["unread_complete"]),
            sorted(["zero", "one", "two", "few", "many", "other"]),
        )
        self.assertEqual(list(project.generated("values-de")["unread_complete"]), ["one", "other"])

    def test_plural_stale_key_is_ignored_with_a_warning(self):
        stale = {"extractionState": "stale", "localizations": {"en": plural_variations(one="%lld a", other="%lld b")}}
        project, (code, _, err) = self.generate(**{"unread.complete": stale})
        self.assertEqual(code, 0, err)
        self.assertNotIn("unread_complete", project.generated("values"))
        self.assertIn("unread.complete", err)

    def test_plural_without_a_localization_in_the_source_language_skips_it_instead_of_using_the_key(self):
        project, (code, _, err) = self.generate()
        self.assertEqual(code, 0, err)
        self.assertNotIn("unread_nofr", project.generated("values-fr"))
        self.assertIn("unread_nofr", project.generated("values"))

    def test_plural_with_neither_english_nor_source_forms_is_refused(self):
        project = Project()
        project.edit_catalog(lambda strings: strings["unread.nofr"]["localizations"].pop("en"))
        document = project.manifest()
        entries = document["modules"][":feature:demo"]["entries"]
        entries[:] = [item for item in entries if item.get("iosKey") == "unread.nofr"]
        project.write_manifest(document)
        code, _, err = project.run()
        self.assertEqual(code, 2)
        self.assertIn("unread.nofr", err)

    def test_plural_missing_in_english_falls_back_to_the_source_language_forms(self):
        project = Project()
        document = project.manifest()
        entries = document["modules"][":feature:demo"]["entries"]
        entries[:] = [{"catalog": "app", "iosKey": "unread.noen", "kind": "plurals", "status": "adopted"}]
        project.write_manifest(document)
        code, _, err = project.run()
        self.assertEqual(code, 0, err)
        self.assertEqual(project.generated("values")["unread_noen"]["one"], "%d élément")


if __name__ == "__main__":
    unittest.main()
