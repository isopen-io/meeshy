import json
import sys
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import scaffold_module
from manifest_schema import load_manifest
from support import catalog_document, make_temp_dir, string_unit, write_json


def entry(text="x", state=None):
    document = {"localizations": {"en": string_unit(text)}}
    if state:
        document["extractionState"] = state
    return document


class Repo:
    def __init__(self, keys):
        self.root = Path(make_temp_dir())
        self.android = self.root / "apps" / "android"
        write_json(self.root, "apps/ios/Meeshy/Localizable.xcstrings", catalog_document(keys))
        self.manifest = self.android / "i18n/manifest/game.json"

    def run(self, prefixes="game.,game2."):
        code = scaffold_module.main([
            "--module", "game", "--prefix", prefixes,
            "--android-root", str(self.android), "--repo-root", str(self.root),
        ])
        return code

    def entries(self):
        return json.loads(self.manifest.read_text(encoding="utf-8"))["modules"][":feature:game"]["entries"]


class SnakeCaseTests(unittest.TestCase):
    def test_dots_dashes_and_camel_case_become_snake_case(self):
        self.assertEqual(scaffold_module.snake_case("game2.league.pseudonymTaken"), "game2_league_pseudonym_taken")
        self.assertEqual(scaffold_module.snake_case("message-detail.error"), "message_detail_error")

    def test_a_leading_digit_and_reserved_words_are_made_valid(self):
        self.assertEqual(scaffold_module.snake_case("1.up"), "s_1_up")
        self.assertEqual(scaffold_module.snake_case("class"), "class_")

    def test_collisions_get_a_numbered_suffix_in_key_order(self):
        names = scaffold_module.assign_names(["game.a-b", "game.a.b", "game.aB"])
        self.assertEqual(len(set(names.values())), 3)
        self.assertEqual(names["game.a-b"], "game_a_b")
        self.assertEqual(names["game.a.b"], "game_a_b_2")
        self.assertEqual(names["game.aB"], "game_a_b_3")


class ScaffoldTests(unittest.TestCase):
    def test_multiple_prefixes_select_their_keys_and_everything_is_disabled(self):
        repo = Repo({"game.a": entry(), "game2.b": entry(), "other.c": entry()})
        self.assertEqual(repo.run(), 0)
        self.assertEqual(sorted(e["iosKey"] for e in repo.entries()), ["game.a", "game2.b"])
        self.assertEqual({e["status"] for e in repo.entries()}, {"disabled"})

    def test_stale_keys_are_excluded(self):
        repo = Repo({"game.a": entry(), "game.old": entry(state="stale")})
        repo.run()
        self.assertEqual([e["iosKey"] for e in repo.entries()], ["game.a"])

    def test_a_repeated_run_is_byte_identical(self):
        repo = Repo({"game.a": entry(), "game.b": entry()})
        repo.run()
        first = repo.manifest.read_text(encoding="utf-8")
        repo.run()
        self.assertEqual(first, repo.manifest.read_text(encoding="utf-8"))

    def test_a_rerun_keeps_an_entry_promoted_to_adopted(self):
        repo = Repo({"game.a": entry(), "game.b": entry()})
        repo.run()
        document = json.loads(repo.manifest.read_text(encoding="utf-8"))
        document["modules"][":feature:game"]["entries"][0]["status"] = "adopted"
        repo.manifest.write_text(json.dumps(document), encoding="utf-8")
        repo.run()
        self.assertEqual([e["status"] for e in repo.entries()], ["adopted", "disabled"])

    def test_a_new_key_never_takes_a_name_already_in_the_manifest(self):
        repo = Repo({"game.a-b": entry()})
        repo.run()
        write_json(repo.root, "apps/ios/Meeshy/Localizable.xcstrings", catalog_document({"game.a-b": entry(), "game.a.b": entry()}))
        repo.run()
        self.assertEqual(sorted(e["androidName"] for e in repo.entries()), ["game_a_b", "game_a_b_2"])

    def test_the_manifest_is_valid_for_the_generator(self):
        repo = Repo({"game.a": entry()})
        repo.run()
        self.assertEqual(len(load_manifest(repo.manifest).modules[0].entries), 1)

    def test_an_unknown_catalog_is_refused(self):
        repo = Repo({"game.a": entry()})
        with self.assertRaises(SystemExit):
            scaffold_module.main(["--module", "game", "--prefix", "game.", "--catalog", "nope", "--android-root", str(repo.android)])


if __name__ == "__main__":
    unittest.main()
