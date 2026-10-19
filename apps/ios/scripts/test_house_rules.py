import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load_engine():
    spec = importlib.util.spec_from_file_location("house_rules", HERE / "house_rules.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class EngineExists(unittest.TestCase):
    def test_engine_loads(self):
        self.assertTrue(load_engine().RULES)


if __name__ == "__main__":
    unittest.main()
