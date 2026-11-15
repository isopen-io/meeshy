import json
import sys
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import bootstrap_manifest
from manifest_schema import load_manifest
from support import catalog_document, make_temp_dir, plural_variations, string_unit, write_json


def english(text):
    return {"localizations": {"en": string_unit(text)}}


def stale(text):
    return {"extractionState": "stale", "localizations": {"en": string_unit(text)}}


class Repo:
    """Un dépôt minimal : un catalogue iOS « app », un module Android avec un strings.xml écrit à la main."""

    def __init__(self, strings, android_xml, module_dir="feature/demo"):
        self.root = Path(make_temp_dir())
        self.android = self.root / "apps" / "android"
        write_json(self.root, "apps/ios/Meeshy/Localizable.xcstrings", catalog_document(strings))
        values = self.android / module_dir / "src/main/res/values"
        values.mkdir(parents=True)
        (values / "strings.xml").write_text(f"<resources>\n{android_xml}\n</resources>\n", encoding="utf-8")
        self.manifest_dir = self.android / "i18n" / "manifest"
        self.manifest_file = self.manifest_dir / "demo.json"

    def run(self):
        files, reports = bootstrap_manifest.bootstrap(self.android, self.root, self.manifest_dir)
        for path, content in files.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        return reports[":feature:demo"]

    def entries(self):
        document = json.loads(self.manifest_file.read_text(encoding="utf-8"))
        return {e["androidName"]: e for e in document["modules"][":feature:demo"]["entries"]}


class NormalizationTests(unittest.TestCase):
    def test_ios_and_android_specifiers_compare_equal(self):
        self.assertEqual(bootstrap_manifest.normalize("%@ a envoyé %lld messages"), bootstrap_manifest.normalize("%1$s a envoyé %2$d messages"))

    def test_a_literal_percent_is_kept(self):
        self.assertEqual(bootstrap_manifest.normalize("100%% sûr"), "100%% sûr")

    def test_android_escapes_are_resolved(self):
        self.assertEqual(bootstrap_manifest.android_text("You can\\'t  send\\n\\u00e9"), "You can't send\né")


class MatchingTests(unittest.TestCase):
    def test_exact_english_text_with_specifiers_normalised_becomes_a_candidate(self):
        repo = Repo(
            {"chat.sent": english("%@ sent %lld messages")},
            '<string name="chat_sent">%1$s sent %2$d messages</string>',
        )
        repo.run()
        self.assertEqual(
            repo.entries()["chat_sent"],
            {"catalog": "app", "iosKey": "chat.sent", "androidName": "chat_sent", "status": "candidate"},
        )

    def test_two_ios_keys_with_the_same_text_are_flagged_as_ambiguous_and_the_closest_key_is_kept(self):
        repo = Repo(
            {"common.send": english("Send"), "call.feedback.send": english("Send")},
            '<string name="common_send">Send</string>',
        )
        report = repo.run()
        self.assertEqual([name for name, _ in report.ambiguous], ["common_send"])
        self.assertEqual(repo.entries()["common_send"]["iosKey"], "common.send")

    def test_a_string_without_equivalent_falls_in_the_report_and_is_android_only(self):
        repo = Repo(
            {"chat.sent": english("Sent")},
            '<string name="chat_only">Hold to talk</string>',
        )
        report = repo.run()
        self.assertEqual(repo.entries()["chat_only"], {"androidName": "chat_only", "status": "android-only"})
        self.assertEqual([item.name for item, _ in report.unmatched], ["chat_only"])

    def test_case_and_punctuation_differences_still_match(self):
        repo = Repo({"auth.signing": english("Signing you in…")}, '<string name="auth_signing">Signing you in...</string>')
        repo.run()
        self.assertEqual(repo.entries()["auth_signing"]["iosKey"], "auth.signing")

    def test_stale_ios_keys_never_match(self):
        repo = Repo({"old.key": stale("Hello")}, '<string name="hello">Hello</string>')
        repo.run()
        self.assertEqual(repo.entries()["hello"]["status"], "android-only")

    def test_plurals_match_on_the_other_form(self):
        repo = Repo(
            {"unread.count": {"localizations": {"en": plural_variations(one="%lld unread", other="%lld unread")}}},
            '<plurals name="unread"><item quantity="one">%d unread</item><item quantity="other">%d unread</item></plurals>',
        )
        repo.run()
        self.assertEqual(repo.entries()["unread"]["kind"], "plurals")
        self.assertEqual(repo.entries()["unread"]["iosKey"], "unread.count")

    def test_suggestions_name_the_closest_ios_text(self):
        repo = Repo({"notifications.markAllRead": english("Mark all as read")}, '<string name="mark">Mark all read</string>')
        report = repo.run()
        suggestion = report.unmatched[0][1][0][1]
        self.assertEqual(suggestion.key, "notifications.markAllRead")


class RerunTests(unittest.TestCase):
    def test_a_manual_classification_survives_a_second_run(self):
        repo = Repo({"chat.sent": english("Sent")}, '<string name="chat_only">Hold to talk</string>')
        repo.run()
        document = json.loads(repo.manifest_file.read_text(encoding="utf-8"))
        document["modules"][":feature:demo"]["entries"][0] = {
            "catalog": "app", "iosKey": "chat.sent", "androidName": "chat_only", "status": "candidate",
        }
        repo.manifest_file.write_text(json.dumps(document), encoding="utf-8")
        repo.run()
        self.assertEqual(repo.entries()["chat_only"]["status"], "candidate")

    def test_a_new_name_is_appended_and_the_output_is_stable(self):
        repo = Repo({}, '<string name="b">B</string><string name="a">A</string>')
        repo.run()
        first = repo.manifest_file.read_text(encoding="utf-8")
        repo.run()
        self.assertEqual(first, repo.manifest_file.read_text(encoding="utf-8"))
        self.assertEqual(list(repo.entries()), ["a", "b"])

    def test_the_produced_manifest_is_valid_for_the_generator(self):
        repo = Repo({"chat.sent": english("Sent")}, '<string name="chat_sent">Sent</string>')
        repo.run()
        self.assertEqual(len(load_manifest(repo.manifest_dir).modules), 1)

    def test_generated_strings_are_not_classified(self):
        repo = Repo({}, '<string name="a">A</string>')
        (repo.android / "feature/demo/src/main/res/values/strings_generated.xml").write_text(
            '<resources><string name="gen">G</string></resources>', encoding="utf-8")
        repo.run()
        self.assertEqual(list(repo.entries()), ["a"])


if __name__ == "__main__":
    unittest.main()
