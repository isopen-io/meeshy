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


class UncheckedSendable(unittest.TestCase):
    BARE = "final class A: @unchecked Sendable {}\n"

    def test_bare_declaration_counts(self):
        self.assertEqual(count("unchecked-sendable", self.BARE), 1)

    def test_justification_within_three_lines_clears_it(self):
        for gap in (0, 1, 2):
            with self.subTest(gap=gap):
                src = "// unchecked: accès sérialisé par la file\n" + "let x = 1\n" * gap + self.BARE
                self.assertEqual(count("unchecked-sendable", src), 0)

    def test_justification_four_lines_above_is_too_far(self):
        src = "// unchecked: raison\n" + "let x = 1\n" * 3 + self.BARE
        self.assertEqual(count("unchecked-sendable", src), 1)

    def test_same_line_justification_clears_it(self):
        self.assertEqual(count("unchecked-sendable", "final class A: @unchecked Sendable {} // unchecked: verrou\n"), 0)

    def test_lock_primitive_in_file_clears_it(self):
        for lock in ("OSAllocatedUnfairLock", "NSLock", "os_unfair_lock", "Mutex<Int>"):
            with self.subTest(lock=lock):
                self.assertEqual(count("unchecked-sendable", self.BARE + "let l = " + lock + "\n"), 0)


class AvailableFloor(unittest.TestCase):
    WIDGET = "apps/ios/MeeshyWidgets/Sample.swift"

    def test_redundant_checks_in_app_count(self):
        src = "if #available(iOS 16.0, *) {}\nif #available(iOS 16, *) {}\n"
        self.assertEqual(count("available-floor", src), 2)

    def test_minor_above_floor_is_not_redundant(self):
        self.assertEqual(count("available-floor", "if #available(iOS 16.4, *) {}\n"), 0)

    def test_comparison_is_numeric_not_lexical(self):
        self.assertEqual(count("available-floor", "if #available(iOS 9.0, *) {}\n"), 1)
        self.assertEqual(count("available-floor", "if #available(iOS 16.10, *) {}\n"), 0)

    def test_widgets_floor_is_17(self):
        src = "if #available(iOS 17.0, *) {}\n"
        self.assertEqual(count("available-floor", src), 0)
        self.assertEqual(count("available-floor", src, self.WIDGET), 1)

    def test_floors_follow_project_yml(self):
        text = (HERE.parent / "project.yml").read_text(encoding="utf-8")
        widgets = text.split("  MeeshyWidgets:")[1].split("deploymentTarget:")[1].split()[0].strip('"')
        default = text.split("IPHONEOS_DEPLOYMENT_TARGET:")[1].split()[0].strip('"')
        as_tuple = lambda v: tuple(int(x) for x in v.split("."))
        self.assertEqual(ENGINE.floor_for("apps/ios/Meeshy/A.swift"), as_tuple(default))
        self.assertEqual(ENGINE.floor_for(self.WIDGET), as_tuple(widgets))


class Exclusions(unittest.TestCase):
    def test_designated_files_are_exempt(self):
        logger = "packages/MeeshySDK/Sources/MeeshySDK/Logging/MeeshyLog.swift"
        reporter = "apps/ios/Meeshy/Features/Main/Services/SocialEventsV2Reporter.swift"
        self.assertEqual(count("logger-subsystem", 'Logger(subsystem: "a", category: "b")\n', logger), 0)
        self.assertEqual(count("idiom", "UIDevice.current.userInterfaceIdiom\n", reporter), 0)

    def test_same_code_elsewhere_counts(self):
        self.assertEqual(count("logger-subsystem", 'Logger(subsystem: "a", category: "b")\n'), 1)
        self.assertEqual(count("idiom", "UIDevice.current.userInterfaceIdiom\n"), 1)


class Scope(unittest.TestCase):
    def test_each_root_counts(self):
        for root in ENGINE.SCOPE:
            with self.subTest(root=root):
                self.assertTrue(ENGINE.in_scope(root + "/A/B.swift", ""))

    def test_tests_generated_and_non_swift_are_out(self):
        self.assertFalse(ENGINE.in_scope("packages/MeeshySDK/Sources/MeeshySDKTests/B.swift", ""))
        self.assertFalse(ENGINE.in_scope("apps/ios/Meeshy/MeeshyTests/B.swift", ""))
        self.assertFalse(ENGINE.in_scope("apps/ios/Meeshy/B.m", ""))
        self.assertFalse(ENGINE.in_scope("apps/ios/Meeshy/B.swift", "// GÉNÉRÉ par x\n"))
        self.assertFalse(ENGINE.in_scope("apps/ios/Meeshy/B.swift", "// generated by y\n"))
        self.assertFalse(ENGINE.in_scope("apps/ios/MeeshyTests/B.swift", ""))
        self.assertFalse(ENGINE.in_scope("apps/ios/Other/B.swift", ""))

    def test_collect_reads_only_scoped_files(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            files = {
                "apps/ios/Meeshy/A.swift": "x",
                "apps/ios/Meeshy/AGen.swift": "// GENERATED\nx",
                "apps/ios/MeeshyTests/T.swift": "x",
                "apps/ios/MeeshyWidgets/W.swift": "x",
                "apps/ios/Meeshy/n.txt": "x",
            }
            for rel, body in files.items():
                (root / rel).parent.mkdir(parents=True, exist_ok=True)
                (root / rel).write_text(body, encoding="utf-8")
            rels = sorted(rel for rel, _ in ENGINE.collect(root))
        self.assertEqual(rels, ["apps/ios/Meeshy/A.swift", "apps/ios/MeeshyWidgets/W.swift"])


if __name__ == "__main__":
    unittest.main()
