import contextlib
import copy
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import xcstrings_to_android
from support import FIXTURES, parse_resources

LOCALE_FOLDERS = ("values", "values-fr", "values-es", "values-de", "values-it", "values-pt", "values-ar")
RES_DIR = "feature/demo/src/main/res"


class Project:
    """Un dépôt minimal : un catalogue iOS, un manifeste, un dossier de ressources Android."""

    def __init__(self, manifest=None):
        self.root = Path(tempfile.mkdtemp())
        self.android = self.root / "apps" / "android"
        self.catalog_path = self.root / "apps/ios/Meeshy/Localizable.xcstrings"
        self.manifest_path = self.android / "i18n/manifest/mini.json"
        self.catalog_path.parent.mkdir(parents=True)
        self.manifest_path.parent.mkdir(parents=True)
        shutil.copy(FIXTURES / "mini.xcstrings", self.catalog_path)
        document = manifest or json.loads((FIXTURES / "mini-manifest.json").read_text(encoding="utf-8"))
        self.write_manifest(document)

    def write_manifest(self, document):
        self.manifest_path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")

    def manifest(self):
        return json.loads(self.manifest_path.read_text(encoding="utf-8"))

    def edit_manifest(self, edit):
        document = self.manifest()
        edit(document["modules"][":feature:demo"]["entries"])
        self.write_manifest(document)

    def edit_catalog(self, edit):
        document = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        edit(document["strings"])
        self.catalog_path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")

    def res(self, folder="values", name="strings_generated.xml"):
        return self.android / RES_DIR / folder / name

    def generated(self, folder="values"):
        return parse_resources(self.res(folder).read_text(encoding="utf-8"))

    def hand_written(self, folder, name, body, file="strings.xml"):
        path = self.res(folder, file)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f'<resources>\n{body}\n</resources>\n', encoding="utf-8")
        return path

    def run(self, *flags):
        out, err = io.StringIO(), io.StringIO()
        arguments = ["--repo-root", str(self.root), "--android-root", str(self.android), *flags]
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = xcstrings_to_android.main(arguments)
        return code, out.getvalue(), err.getvalue()

    def snapshot(self):
        return {str(p.relative_to(self.root)): p.read_bytes() for p in sorted(self.root.rglob("*")) if p.is_file()}


class GenerationTests(unittest.TestCase):
    def setUp(self):
        self.project = Project()
        self.code, self.out, self.err = self.project.run()

    def test_generation_succeeds_and_writes_the_seven_locale_files(self):
        self.assertEqual(self.code, 0, self.err)
        for folder in LOCALE_FOLDERS:
            self.assertTrue(self.project.res(folder).is_file(), folder)

    def test_generation_never_touches_other_files(self):
        written = {str(p.relative_to(self.project.root)) for p in self.project.root.rglob("strings_generated.xml")}
        self.assertEqual(len(written), 7)

    def test_every_file_starts_with_the_banner(self):
        for folder in LOCALE_FOLDERS:
            text = self.project.res(folder).read_text(encoding="utf-8")
            self.assertTrue(text.startswith("<!-- GÉNÉRÉ — ne pas modifier"), folder)

    def test_second_run_is_byte_identical(self):
        before = self.project.snapshot()
        code, out, _ = self.project.run()
        self.assertEqual(code, 0)
        self.assertEqual(self.project.snapshot(), before)
        self.assertIn("inchangé", out)

    def test_simple_string_exists_in_every_language_with_brazilian_in_values_pt(self):
        expected = {
            "values": "Hello", "values-fr": "Bonjour", "values-es": "Hola", "values-de": "Hallo",
            "values-it": "Ciao", "values-pt": "Olá", "values-ar": "مرحبًا",
        }
        for folder, text in expected.items():
            self.assertEqual(self.project.generated(folder)["greeting_hello"], text, folder)

    def test_french_source_key_without_french_localization_reuses_the_key(self):
        self.assertEqual(self.project.generated("values-fr")["common_cancel"], "Annuler")
        self.assertEqual(self.project.generated("values")["common_cancel"], "Cancel")

    def test_language_without_localization_is_left_to_android_fallback(self):
        self.assertNotIn("common_close", self.project.generated("values-es"))
        self.assertEqual(self.project.generated("values")["common_close"], "Close")
        self.assertEqual(self.project.generated("values-fr")["common_close"], "Fermer")

    def test_plain_portuguese_localization_feeds_values_pt(self):
        self.assertEqual(self.project.generated("values-pt")["pt_only"], "Feito")

    def test_special_characters_survive_a_trip_through_the_xml(self):
        self.assertEqual(self.project.generated("values")["quote_special"], "Don't forget @alice & <everyone>?\nSecond line")
        self.assertEqual(self.project.generated("values-fr")["quote_special"], "N'oublie pas @alice & <tout le monde> ?\nDeuxième ligne")
        self.assertEqual(self.project.generated("values")["leading_at"], "@mention first")
        self.assertEqual(self.project.generated("values")["leading_question"], "?help")

    def test_two_specifiers_are_positional_in_every_language_with_the_same_numbering(self):
        self.assertEqual(self.project.generated("values")["message_sent_count"], "%1$s sent %2$d messages")
        self.assertEqual(self.project.generated("values-fr")["message_sent_count"], "%1$s a envoyé %2$d messages")
        self.assertEqual(self.project.generated("values-ar")["message_sent_count"], "%2$d رسائل من %1$s")

    def test_ios_positional_specifiers_are_kept(self):
        self.assertEqual(self.project.generated("values")["already_positional"], "%1$s of %2$s")

    def test_markdown_bold_becomes_a_bold_tag(self):
        self.assertEqual(self.project.generated("values")["bold_code"], "Enter the code sent to <b>%s</b>")

    def test_escaped_percent_is_kept(self):
        self.assertEqual(self.project.generated("values")["percent_done"], "%d%% done")

    def test_prose_percent_is_marked_unformatted(self):
        text = self.project.res("values").read_text(encoding="utf-8")
        self.assertIn('name="percent_prose" formatted="false"', text)

    def test_stale_entries_are_never_emitted_and_warn(self):
        for folder in LOCALE_FOLDERS:
            self.assertNotIn("stale_removed", self.project.generated(folder))
        self.assertIn("stale.removed", self.err)

    def test_only_adopted_entries_are_emitted(self):
        names = set(self.project.generated("values"))
        self.assertNotIn("unread_partial", names)
        self.assertNotIn("demo_android_only", names)
        self.assertNotIn("demo_hello_disabled", names)

    def test_arabic_plural_has_exactly_the_six_categories(self):
        plural = self.project.generated("values-ar")["unread_complete"]
        self.assertEqual(list(plural), ["zero", "one", "two", "few", "many", "other"])

    def test_french_plural_has_exactly_the_catalog_categories(self):
        self.assertEqual(self.project.generated("values-fr")["unread_complete"],
                         {"one": "%d non lue", "many": "%d de non lues", "other": "%d non lues"})
        self.assertEqual(list(self.project.generated("values")["unread_complete"]), ["one", "other"])

    def test_entries_are_sorted_by_name(self):
        import xml.etree.ElementTree as ET
        names = [e.get("name") for e in ET.fromstring(self.project.res("values").read_text(encoding="utf-8"))]
        self.assertEqual(names, sorted(names))

    def test_summary_counts_the_written_files(self):
        self.assertIn("7 fichier(s) écrit(s)", self.out)


class GenerationFailureTests(unittest.TestCase):
    def test_plural_missing_a_cldr_category_fails_naming_key_and_language(self):
        project = Project()
        project.edit_manifest(lambda entries: entry_for_status(entries, "unread.partial", "adopted"))
        code, _, err = project.run()
        self.assertEqual(code, 2)
        self.assertIn("unread.partial", err)
        self.assertIn("[fr]", err)
        self.assertIn("many", err)
        self.assertFalse(project.res("values").exists())

    def test_fill_missing_quantities_accepts_the_same_plural(self):
        project = Project()
        project.edit_manifest(lambda entries: entry_for_status(entries, "unread.partial", "adopted", fillMissingQuantities=True))
        code, _, err = project.run()
        self.assertEqual(code, 0, err)
        plural = project.generated("values-fr")["unread_partial"]
        self.assertEqual(plural["many"], plural["other"])

    def test_adopted_key_absent_from_the_catalog_fails_naming_it(self):
        project = Project()
        project.edit_manifest(lambda entries: entries.append({"catalog": "app", "iosKey": "no.such.key", "status": "adopted"}))
        code, _, err = project.run()
        self.assertEqual(code, 2)
        self.assertIn("no.such.key", err)

    def test_unadopted_key_absent_from_the_catalog_is_tolerated(self):
        project = Project()
        project.edit_manifest(lambda entries: entries.append({"catalog": "app", "iosKey": "no.such.key", "status": "candidate"}))
        self.assertEqual(project.run()[0], 0)

    def test_kind_contradicting_the_catalog_fails(self):
        project = Project()
        document = project.manifest()
        for item in document["modules"][":feature:demo"]["entries"]:
            if item.get("iosKey") == "greeting.hello" and item["status"] == "adopted":
                item["kind"] = "plurals"
        project.write_manifest(document)
        code, _, err = project.run()
        self.assertEqual(code, 2)
        self.assertIn("greeting.hello", err)

    def test_argument_order_contradicting_english_fails_naming_key_and_language(self):
        project = Project()
        def reorder(strings):
            strings["message.sent.count"]["localizations"]["de"]["stringUnit"]["value"] = "%lld Nachrichten von %@"
        project.edit_catalog(reorder)
        code, _, err = project.run()
        self.assertEqual(code, 2)
        self.assertIn("message.sent.count", err)
        self.assertIn("[de]", err)

    def test_unbalanced_bold_markup_fails(self):
        project = Project()
        project.edit_catalog(lambda strings: strings["bold.code"]["localizations"]["fr"]["stringUnit"].update(value="**ouvert %@"))
        code, _, err = project.run()
        self.assertEqual(code, 2)
        self.assertIn("bold.code", err)

    def test_missing_explicit_manifest_fails(self):
        project = Project()
        code, _, err = project.run("--manifest", str(project.android / "absent.json"))
        self.assertEqual(code, 2)
        self.assertIn("absent.json", err)

    def test_invalid_manifest_fails_without_writing(self):
        project = Project()
        project.edit_manifest(lambda entries: entries[0].update(status="done"))
        code, _, err = project.run()
        self.assertEqual(code, 2)
        self.assertIn("done", err)
        self.assertFalse(project.res("values").exists())

    def test_no_manifest_directory_means_nothing_to_generate(self):
        project = Project()
        shutil.rmtree(project.android / "i18n")
        code, out, _ = project.run()
        self.assertEqual(code, 0)
        self.assertIn("rien à générer", out)


def entry_for_status(entries, key, status, **extra):
    for item in entries:
        if item.get("iosKey") == key:
            item["status"] = status
            item.update(extra)


class HandWrittenCollisionTests(unittest.TestCase):
    def test_name_defined_in_strings_xml_is_refused_naming_module_name_and_folder(self):
        project = Project()
        project.hand_written("values-fr", "greeting_hello", '    <string name="greeting_hello">Salut</string>')
        before = project.snapshot()
        code, _, err = project.run()
        self.assertEqual(code, 2)
        self.assertIn(":feature:demo", err)
        self.assertIn("greeting_hello", err)
        self.assertIn("values-fr", err)
        self.assertEqual(project.snapshot(), before)

    def test_collision_is_detected_in_the_default_folder_too(self):
        project = Project()
        project.hand_written("values", "common_close", '    <string name="common_close">Close</string>')
        code, _, err = project.run()
        self.assertEqual(code, 2)
        self.assertIn("common_close", err)

    def test_collision_with_a_lot_specific_file_is_detected_as_well(self):
        project = Project()
        project.hand_written("values", "bold_code", '    <string name="bold_code">x</string>', file="strings_chat.xml")
        code, _, err = project.run()
        self.assertEqual(code, 2)
        self.assertIn("strings_chat.xml", err)

    def test_plural_collision_is_detected(self):
        project = Project()
        project.hand_written("values", "unread_complete", '    <plurals name="unread_complete"><item quantity="other">x</item></plurals>')
        self.assertEqual(project.run()[0], 2)

    def test_a_string_and_a_plurals_of_the_same_name_do_not_collide(self):
        project = Project()
        project.hand_written("values", "unread_complete", '    <string name="unread_complete">x</string>')
        self.assertEqual(project.run()[0], 0)

    def test_names_that_are_not_adopted_never_collide(self):
        project = Project()
        project.hand_written("values", "unread_partial", '    <string name="unread_partial">x</string>')
        self.assertEqual(project.run()[0], 0)

    def test_generation_leaves_hand_written_files_byte_identical(self):
        project = Project()
        path = project.hand_written("values", "mine", '    <string name="mine">Mine</string>')
        original = path.read_bytes()
        self.assertEqual(project.run()[0], 0)
        self.assertEqual(path.read_bytes(), original)


class CheckModeTests(unittest.TestCase):
    def test_clean_tree_exits_zero_and_writes_nothing(self):
        project = Project()
        project.run()
        before = project.snapshot()
        code, out, _ = project.run("--check")
        self.assertEqual(code, 0)
        self.assertEqual(project.snapshot(), before)
        self.assertNotIn("périmé", out)

    def test_never_generated_tree_exits_one_listing_the_seven_files_without_writing(self):
        project = Project()
        before = project.snapshot()
        code, out, _ = project.run("--check")
        self.assertEqual(code, 1)
        self.assertEqual(project.snapshot(), before)
        for folder in LOCALE_FOLDERS:
            self.assertIn(f"{RES_DIR}/{folder}/strings_generated.xml", out)

    def test_modified_catalog_exits_one_listing_only_the_files_that_changed(self):
        project = Project()
        project.run()
        project.edit_catalog(lambda strings: strings["greeting.hello"]["localizations"]["fr"]["stringUnit"].update(value="Salut"))
        before = project.snapshot()
        code, out, _ = project.run("--check")
        self.assertEqual(code, 1)
        self.assertEqual(project.snapshot(), before)
        self.assertIn(f"{RES_DIR}/values-fr/strings_generated.xml", out)
        self.assertNotIn(f"{RES_DIR}/values-es/strings_generated.xml", out)

    def test_regenerating_after_a_catalog_change_makes_check_clean_again(self):
        project = Project()
        project.run()
        project.edit_catalog(lambda strings: strings["greeting.hello"]["localizations"]["en"]["stringUnit"].update(value="Hi"))
        self.assertEqual(project.run("--check")[0], 1)
        self.assertEqual(project.run()[0], 0)
        self.assertEqual(project.generated("values")["greeting_hello"], "Hi")
        self.assertEqual(project.run("--check")[0], 0)

    def test_modified_manifest_exits_one(self):
        project = Project()
        project.run()
        project.edit_manifest(lambda entries: entries.append({"catalog": "app", "iosKey": "greeting.hello", "androidName": "extra_hello", "status": "adopted"}))
        code, out, _ = project.run("--check")
        self.assertEqual(code, 1)
        self.assertIn("strings_generated.xml", out)

    def test_hand_edited_generated_file_is_stale(self):
        project = Project()
        project.run()
        path = project.res("values-de")
        path.write_text(path.read_text(encoding="utf-8").replace("Hallo", "Servus"), encoding="utf-8")
        code, out, _ = project.run("--check")
        self.assertEqual(code, 1)
        self.assertIn("values-de/strings_generated.xml", out)

    def test_collision_with_a_hand_written_file_is_an_error_in_check_mode(self):
        project = Project()
        project.run()
        project.hand_written("values-es", "greeting_hello", '    <string name="greeting_hello">Hola</string>')
        code, _, err = project.run("--check")
        self.assertEqual(code, 2)
        self.assertIn("greeting_hello", err)

    def test_generated_file_of_a_module_dropped_from_the_manifest_is_stale_then_removed(self):
        project = Project()
        project.run()
        document = project.manifest()
        document["modules"][":feature:demo"]["entries"] = []
        project.write_manifest(document)
        code, out, _ = project.run("--check")
        self.assertEqual(code, 1)
        self.assertIn(f"{RES_DIR}/values/strings_generated.xml", out)
        self.assertTrue(project.res("values").exists())
        self.assertEqual(project.run()[0], 0)
        self.assertFalse(project.res("values").exists())
        self.assertEqual(project.run("--check")[0], 0)

    def test_build_directories_are_not_scanned_for_orphans(self):
        project = Project()
        project.run()
        build_copy = project.android / "feature/demo/build/intermediates/res/values/strings_generated.xml"
        build_copy.parent.mkdir(parents=True)
        build_copy.write_text("<resources/>", encoding="utf-8")
        self.assertEqual(project.run("--check")[0], 0)


class CommandLineTests(unittest.TestCase):
    def test_script_runs_as_a_command_and_reports_stale_files_with_exit_one(self):
        project = Project()
        completed = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "xcstrings_to_android.py"), "--check",
             "--repo-root", str(project.root), "--android-root", str(project.android)],
            capture_output=True, text=True, encoding="utf-8",
        )
        self.assertEqual(completed.returncode, 1)
        self.assertIn("strings_generated.xml", completed.stdout)

    def test_two_runs_of_the_command_are_byte_identical(self):
        project = Project()
        command = [sys.executable, str(SCRIPT_DIR / "xcstrings_to_android.py"),
                   "--repo-root", str(project.root), "--android-root", str(project.android)]
        self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
        first = project.snapshot()
        self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
        self.assertEqual(project.snapshot(), first)


if __name__ == "__main__":
    unittest.main()
