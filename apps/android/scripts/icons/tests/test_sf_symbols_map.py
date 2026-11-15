import json
import unittest
from pathlib import Path

ICONS = Path(__file__).resolve().parents[3] / "i18n" / "icons"


class MapTests(unittest.TestCase):
    def test_every_candidate_is_classified_once(self):
        candidates = (ICONS / "sf-symbols-candidates.txt").read_text(encoding="utf-8").split()
        rows = json.loads((ICONS / "sf-symbols-map.json").read_text(encoding="utf-8"))["symbols"]
        self.assertEqual(sorted(r["symbol"] for r in rows), sorted(candidates))


if __name__ == "__main__":
    unittest.main()
