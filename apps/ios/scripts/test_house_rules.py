import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load_engine():
    spec = importlib.util.spec_from_file_location("house_rules", HERE / "house_rules.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ENGINE = load_engine()
APP = "apps/ios/Meeshy/Features/Sample.swift"


def rule(rule_id):
    return next(r for r in ENGINE.RULES if r.id == rule_id)


def count(rule_id, src, rel=APP):
    return ENGINE.count_file(rule(rule_id), rel, src)


class StripComments(unittest.TestCase):
    def test_line_block_and_nested_comments_are_blanked(self):
        src = "// UIScreen.main\n/* UIScreen.main */\n/* a /* UIScreen.main */ UIScreen.main */\nlet a = 1\n"
        self.assertEqual(count("uiscreen-main", src), 0)

    def test_same_token_in_code_counts(self):
        self.assertEqual(count("uiscreen-main", "let w = UIScreen.main.bounds\n"), 1)

    def test_line_count_is_preserved(self):
        src = "a\n/* x\ny\nz */\nb // c\n\"\"\"\nm\n\"\"\"\n"
        self.assertEqual(ENGINE.strip_comments(src).count("\n"), src.count("\n"))

    def test_url_in_string_does_not_open_a_comment(self):
        self.assertEqual(count("uiscreen-main", 'let u = "https://x"; _ = UIScreen.main\n'), 1)

    def test_raw_and_multiline_strings_do_not_desynchronise(self):
        src = 'let r = #"a // b "quoted" c"#\nlet m = """\n  // not a comment\n  """\n_ = UIScreen.main\n'
        self.assertEqual(count("uiscreen-main", src), 1)

    def test_nested_interpolation_keeps_following_code_analysed(self):
        src = 'Text("\\(n) non lue\\(n > 1 ? "s" : "")")\n_ = UIScreen.main\n'
        self.assertEqual(count("plural-s", src), 1)
        self.assertEqual(count("uiscreen-main", src), 1)


class PatternRules(unittest.TestCase):
    CASES = (
        ("uiscreen-main", "UIScreen.main.bounds\nUIScreen.main\n", "UIScreen.mainish\nMyUIScreen.mainX\n"),
        ("nslock", "let l = NSLock()\nlet m = NSLock()\n", "NSLockFree()\nNSLocking()\n"),
        ("nonisolated-unsafe", "nonisolated(unsafe) var a = 1\nnonisolated(unsafe) let b = 2\n", "nonisolated var a = 1\n"),
        ("try-sleep", "try? await Task.sleep(nanoseconds: 1)\ntry?  await Task.sleep(for: .seconds(1))\n", "try await Task.sleep(nanoseconds: 1)\n"),
        ("logger-subsystem", 'Logger(subsystem: "a", category: "b")\nLogger(subsystem: "c", category: "d")\n', "MyLogger(subsystem: 1)\n"),
        ("nslog", 'NSLog("x")\nNSLog("%@", y)\n', "MyNSLog(\"x\")\nNSLogger()\n"),
        ("fixed-font", ".font(.system(size: 12))\n.font(.system(size: 14, weight: .bold))\n", ".font(.system(.body))\n.font(.title)\n"),
        ("anyview", "AnyView(Text(\"a\"))\nreturn AnyView(b)\n", "myAnyView(x)\nAnyViewish\n"),
        ("idiom", "UIDevice.current.userInterfaceIdiom\nuserInterfaceIdiom == .pad\n", "userInterfaceIdiomX\n"),
        ("plural-s", 'n > 1 ? "s" : ""\nn>1 ?"s":""\n', 'n > 1 ? "x" : ""\nn > 1 ? "s" : "t"\n'),
    )

    def test_each_rule_counts_its_occurrences_and_ignores_lookalikes(self):
        for rule_id, hits, misses in self.CASES:
            with self.subTest(rule=rule_id):
                self.assertEqual(count(rule_id, hits), 2)
                self.assertEqual(count(rule_id, misses), 0)


if __name__ == "__main__":
    unittest.main()
