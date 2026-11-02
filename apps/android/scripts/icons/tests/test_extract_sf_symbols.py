import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from extract_sf_symbols import collect, extract_symbols, render

SAMPLE = '''
Image(systemName: "chevron.forward")
Label("Copier", systemImage: "doc.on.doc")
Image(systemName: isOn ? "heart.fill" : "heart")
Image(systemName: "chevron.forward")
Text("systemName: \\(name)")
Button(action: {}) { Image(systemName:"xmark") }
'''


class ExtractTests(unittest.TestCase):
    def test_literal_names_of_both_forms_are_found(self):
        self.assertEqual(extract_symbols(SAMPLE), {"chevron.forward", "doc.on.doc", "xmark"})

    def test_dynamic_and_ternary_arguments_are_ignored(self):
        self.assertNotIn("heart.fill", extract_symbols(SAMPLE))

    def test_output_is_sorted_and_deduplicated(self):
        self.assertEqual(render({"b", "a", "b"}), "a\nb\n")

    def test_collect_walks_swift_files_only_and_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "A.swift").write_text('Image(systemName: "zap")', encoding="utf-8")
            (root / "sub").mkdir()
            (root / "sub" / "B.swift").write_text('Image(systemImage: "alpha")', encoding="utf-8")
            (root / "note.txt").write_text('Image(systemName: "ignored")', encoding="utf-8")
            self.assertEqual(render(collect([root])), "alpha\nzap\n")
            self.assertEqual(render(collect([root])), render(collect([root])))


if __name__ == "__main__":
    unittest.main()
