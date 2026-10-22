import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from manifest_schema import (
    CATALOGS,
    KINDS,
    STATUSES,
    ManifestError,
    derive_android_name,
    load_manifest,
    parse_manifest,
)
from support import FIXTURES, make_temp_dir, write_json


def entry(**fields):
    return {"catalog": "app", "iosKey": "chat.send", "status": "adopted", **fields}


def manifest(*entries, module=":feature:chat", res_dir="feature/chat/src/main/res"):
    return {
        "schemaVersion": 1,
        "modules": {module: {"resDir": res_dir, "entries": list(entries)}},
    }


def parse(document):
    return parse_manifest(document, "manifest.json")


class VocabularyTests(unittest.TestCase):
    def test_statuses_are_the_four_agreed_values(self):
        self.assertEqual(set(STATUSES), {"adopted", "candidate", "android-only", "disabled"})

    def test_kinds_are_string_and_plurals(self):
        self.assertEqual(set(KINDS), {"string", "plurals"})

    def test_catalogs_cover_the_app_the_ui_kit_and_the_extensions(self):
        self.assertEqual(
            set(CATALOGS),
            {"app", "ui", "widgets", "nse", "nce", "infoplist"},
        )

    def test_catalog_paths_point_at_the_ios_sources(self):
        self.assertEqual(CATALOGS["app"], "apps/ios/Meeshy/Localizable.xcstrings")
        self.assertEqual(CATALOGS["ui"], "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings")
        self.assertEqual(CATALOGS["infoplist"], "apps/ios/Meeshy/InfoPlist.xcstrings")


class AndroidNameTests(unittest.TestCase):
    def test_dots_and_hyphens_become_underscores(self):
        self.assertEqual(derive_android_name("chat.composer-hint.send"), "chat_composer_hint_send")

    def test_case_is_preserved(self):
        self.assertEqual(derive_android_name("emailVerification.subtitle"), "emailVerification_subtitle")

    def test_natural_text_key_has_no_derived_name(self):
        for key in ("Annuler", "%@ membres", "1 message", "↩ %@"):
            with self.subTest(key=key):
                with self.assertRaises(ManifestError):
                    parse(manifest(entry(iosKey=key)))

    def test_natural_text_key_is_accepted_with_an_explicit_name(self):
        parsed = parse(manifest(entry(iosKey="Annuler", androidName="common_cancel")))
        self.assertEqual(parsed.modules[0].entries[0].android_name, "common_cancel")

    def test_name_defaults_to_the_derived_one(self):
        parsed = parse(manifest(entry()))
        self.assertEqual(parsed.modules[0].entries[0].android_name, "chat_send")

    def test_explicit_name_must_be_a_resource_identifier(self):
        for name in ("1abc", "a b", "a.b", "a-b", ""):
            with self.subTest(name=name):
                with self.assertRaises(ManifestError):
                    parse(manifest(entry(androidName=name)))


class ValidationTests(unittest.TestCase):
    def test_every_status_is_accepted(self):
        for status in ("adopted", "candidate", "disabled"):
            with self.subTest(status=status):
                parsed = parse(manifest(entry(status=status)))
                self.assertEqual(parsed.modules[0].entries[0].status, status)
        android_only = parse(manifest({"androidName": "x", "status": "android-only"}))
        self.assertEqual(android_only.modules[0].entries[0].status, "android-only")

    def test_unknown_status_is_refused_naming_the_value(self):
        with self.assertRaises(ManifestError) as raised:
            parse(manifest(entry(status="done")))
        self.assertIn("done", str(raised.exception))

    def test_status_is_mandatory(self):
        document = manifest(entry())
        del document["modules"][":feature:chat"]["entries"][0]["status"]
        with self.assertRaises(ManifestError):
            parse(document)

    def test_android_name_must_be_unique_within_a_module(self):
        with self.assertRaises(ManifestError) as raised:
            parse(manifest(entry(), entry(iosKey="other.key", androidName="chat_send")))
        message = str(raised.exception)
        self.assertIn("chat_send", message)
        self.assertIn(":feature:chat", message)

    def test_same_name_in_two_modules_is_allowed(self):
        document = manifest(entry())
        document["modules"][":feature:feed"] = {"resDir": "feature/feed/src/main/res", "entries": [entry()]}
        self.assertEqual(len(parse(document).modules), 2)

    def test_kind_defaults_to_string(self):
        self.assertEqual(parse(manifest(entry())).modules[0].entries[0].kind, "string")

    def test_plurals_kind_is_accepted(self):
        self.assertEqual(parse(manifest(entry(kind="plurals"))).modules[0].entries[0].kind, "plurals")

    def test_unknown_kind_is_refused(self):
        with self.assertRaises(ManifestError):
            parse(manifest(entry(kind="array")))

    def test_unknown_catalog_is_refused(self):
        with self.assertRaises(ManifestError):
            parse(manifest(entry(catalog="mac")))

    def test_ios_backed_statuses_need_catalog_and_key(self):
        for status in ("adopted", "candidate", "disabled"):
            with self.subTest(status=status):
                with self.assertRaises(ManifestError):
                    parse(manifest({"androidName": "x", "status": status}))

    def test_android_only_entries_have_no_ios_side(self):
        with self.assertRaises(ManifestError):
            parse(manifest(entry(status="android-only")))

    def test_unknown_field_is_refused(self):
        with self.assertRaises(ManifestError) as raised:
            parse(manifest(entry(stauts="adopted")))
        self.assertIn("stauts", str(raised.exception))

    def test_fill_missing_quantities_is_a_boolean_for_plurals_only(self):
        parsed = parse(manifest(entry(kind="plurals", fillMissingQuantities=True)))
        self.assertTrue(parsed.modules[0].entries[0].fill_missing_quantities)
        self.assertFalse(parse(manifest(entry())).modules[0].entries[0].fill_missing_quantities)
        with self.assertRaises(ManifestError):
            parse(manifest(entry(kind="string", fillMissingQuantities=True)))
        with self.assertRaises(ManifestError):
            parse(manifest(entry(kind="plurals", fillMissingQuantities="yes")))

    def test_schema_version_must_be_one(self):
        document = manifest(entry())
        document["schemaVersion"] = 2
        with self.assertRaises(ManifestError):
            parse(document)

    def test_res_dir_must_stay_inside_the_android_project(self):
        for res_dir in ("/abs/res", "../outside/res", "feature/../../x"):
            with self.subTest(res_dir=res_dir):
                with self.assertRaises(ManifestError):
                    parse(manifest(entry(), res_dir=res_dir))

    def test_res_dir_must_belong_to_the_module(self):
        with self.assertRaises(ManifestError) as raised:
            parse(manifest(entry(), res_dir="feature/feed/src/main/res"))
        self.assertIn("feature/chat/", str(raised.exception))

    def test_module_must_be_a_gradle_path(self):
        with self.assertRaises(ManifestError):
            parse(manifest(entry(), module="feature/chat"))

    def test_adopted_entries_are_the_only_ones_selected(self):
        parsed = parse(manifest(
            entry(iosKey="a.one"),
            entry(iosKey="a.two", status="candidate"),
            entry(iosKey="a.three", status="disabled"),
            {"androidName": "mine", "status": "android-only"},
        ))
        self.assertEqual([item.android_name for item in parsed.modules[0].adopted()], ["a_one"])


class LoadingTests(unittest.TestCase):
    def test_the_mini_fixture_is_a_valid_manifest(self):
        parsed = load_manifest(FIXTURES / "mini-manifest.json")
        self.assertEqual([module.module for module in parsed.modules], [":feature:demo"])
        self.assertEqual(len(parsed.modules[0].adopted()), 15)

    def test_missing_file_is_refused(self):
        with self.assertRaises(ManifestError):
            load_manifest(FIXTURES / "nothing.json")

    def test_invalid_json_is_refused_with_the_path(self):
        directory = make_temp_dir()
        path = Path(directory) / "broken.json"
        path.write_text("{", encoding="utf-8")
        with self.assertRaises(ManifestError) as raised:
            load_manifest(path)
        self.assertIn("broken.json", str(raised.exception))

    def test_directory_fragments_are_merged_per_module(self):
        directory = make_temp_dir()
        write_json(directory, "feature-chat.d/lot-a.json", manifest(entry(iosKey="chat.one")))
        write_json(directory, "feature-chat.d/lot-b.json", manifest(entry(iosKey="chat.two")))
        merged = load_manifest(Path(directory))
        self.assertEqual(len(merged.modules), 1)
        self.assertEqual([item.android_name for item in merged.modules[0].entries], ["chat_one", "chat_two"])

    def test_fragments_must_agree_on_the_res_dir(self):
        directory = make_temp_dir()
        write_json(directory, "a.json", manifest(entry(iosKey="chat.one")))
        write_json(directory, "b.json", manifest(entry(iosKey="chat.two"), res_dir="feature/chat/src/debug/res"))
        with self.assertRaises(ManifestError):
            load_manifest(Path(directory))

    def test_android_name_collision_across_fragments_names_both_files(self):
        directory = make_temp_dir()
        write_json(directory, "a.json", manifest(entry()))
        write_json(directory, "b.json", manifest(entry()))
        with self.assertRaises(ManifestError) as raised:
            load_manifest(Path(directory))
        message = str(raised.exception)
        self.assertIn("a.json", message)
        self.assertIn("b.json", message)

    def test_missing_default_directory_is_an_empty_manifest(self):
        directory = make_temp_dir()
        self.assertEqual(load_manifest(Path(directory) / "manifest", must_exist=False).modules, ())

    def test_modules_come_out_sorted_whatever_the_file_order(self):
        directory = make_temp_dir()
        write_json(directory, "1.json", manifest(entry(), module=":feature:feed", res_dir="feature/feed/src/main/res"))
        write_json(directory, "2.json", manifest(entry(), module=":feature:chat"))
        names = [module.module for module in load_manifest(Path(directory)).modules]
        self.assertEqual(names, [":feature:chat", ":feature:feed"])


if __name__ == "__main__":
    unittest.main()
