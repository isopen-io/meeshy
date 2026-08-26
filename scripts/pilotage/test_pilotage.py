import json
import subprocess
import unittest
from unittest import mock

import build
import fetch


def project_node(**over):
    node = {
        "id": "PVTI_1",
        "type": "ISSUE",
        "fieldValues": {"nodes": [
            {"name": "In Progress", "field": {"name": "Status"}},
            {"name": "1 · Fiable et honnête", "field": {"name": "Horizon"}},
            {"date": "2026-10-31", "field": {"name": "Échéance"}},
            {},
        ]},
        "content": {"number": 42, "title": "Une tâche", "state": "OPEN", "createdAt": "2026-08-26T10:00:00Z", "closedAt": None,
                    "url": "https://github.com/isopen-io/meeshy/issues/42",
                    "milestone": {"number": 16, "title": "Voir ce qui se passe en prod", "dueOn": "2026-10-31T07:00:00Z", "state": "OPEN"}},
    }
    node.update(over)
    return node


class NormalizeProjectItems(unittest.TestCase):
    def test_champs_du_projet_et_du_contenu_reunis(self):
        [item] = fetch.normalize_project_items([project_node()])
        self.assertEqual(item["number"], 42)
        self.assertEqual(item["status"], "In Progress")
        self.assertEqual(item["horizon"], "1 · Fiable et honnête")
        self.assertEqual(item["echeance"], "2026-10-31")
        self.assertEqual(item["milestoneNumber"], 16)
        self.assertEqual(item["milestoneDue"], "2026-10-31T07:00:00Z")

    def test_un_item_sans_contenu_est_ignore(self):
        self.assertEqual(fetch.normalize_project_items([project_node(content=None)]), [])


class ItemsFromRest(unittest.TestCase):
    def test_mode_degrade_derive_le_status_de_l_etat_et_l_horizon_de_l_echeance(self):
        issues = [
            {"number": 1, "title": "A", "state": "closed", "created_at": "2026-08-01T00:00:00Z", "closed_at": "2026-08-02T00:00:00Z", "html_url": "u1",
             "milestone": {"number": 3, "title": "M", "due_on": "2026-10-31T07:00:00Z", "state": "open"}},
            {"number": 2, "title": "B", "state": "open", "created_at": "2026-08-01T00:00:00Z", "closed_at": None, "html_url": "u2", "milestone": None},
            {"number": 3, "title": "PR", "state": "open", "created_at": "2026-08-01T00:00:00Z", "closed_at": None, "html_url": "u3", "milestone": None, "pull_request": {}},
        ]
        items = fetch.items_from_rest(issues)
        self.assertEqual([i["number"] for i in items], [1, 2])
        self.assertEqual(items[0]["status"], "Done")
        self.assertEqual(items[0]["horizon"], "Échéance 31 octobre 2026")
        self.assertEqual(items[0]["milestoneNumber"], 3)
        self.assertEqual(items[1]["status"], "Todo")
        self.assertIsNone(items[1]["horizon"])


class Render(unittest.TestCase):
    def test_la_page_embarque_les_donnees_et_le_module_de_calcul_sans_export(self):
        data = {"fetchedAt": "2026-08-26T16:00:00+00:00", "mode": "project", "items": [{"title": "x</script>"}], "milestones": []}
        html = build.render("<p>__COMPUTE__</p><script>__DATA__</script>", "export const a = 1;\nexport function f() {}\n", data)
        self.assertNotIn("__DATA__", html)
        self.assertNotIn("__COMPUTE__", html)
        self.assertNotIn("export ", html)
        self.assertIn("const a = 1;", html)
        self.assertIn("function f() {}", html)
        self.assertNotIn("</script>\"", html)
        self.assertIn("<\\/script>", html)
        self.assertIn('"mode":"project"', html)

    def test_les_champs_inutiles_ne_sont_pas_embarques(self):
        data = {"fetchedAt": "x", "mode": "project", "items": [{"number": 1, "id": "PVTI", "labels": ["ios"], "status": "Done"}], "milestones": [{"number": 1, "description": "long"}]}
        payload = json.loads(build.slim(data))
        self.assertEqual(payload["items"][0], {"status": "Done"})
        self.assertEqual(payload["milestones"][0], {"number": 1})


class ParseConcatenated(unittest.TestCase):
    def test_deux_pages_de_listes_sont_aplaties(self):
        self.assertEqual(fetch.parse_concatenated('[{"a": 1}, {"a": 2}]\n[{"a": 3}]\n'), [{"a": 1}, {"a": 2}, {"a": 3}])

    def test_un_document_objet_est_rendu_tel_quel(self):
        self.assertEqual(fetch.parse_concatenated('{"data": {"x": 1}}'), {"data": {"x": 1}})

    def test_texte_vide(self):
        self.assertEqual(fetch.parse_concatenated("  \n"), [])


class FetchProjectItems(unittest.TestCase):
    def test_suit_le_curseur_jusqu_a_la_derniere_page(self):
        pages = [
            {"data": {"organization": {"projectV2": {"items": {"pageInfo": {"hasNextPage": True, "endCursor": "C1"}, "nodes": [project_node()]}}}}},
            {"data": {"organization": {"projectV2": {"items": {"pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": [project_node(content={**project_node()["content"], "number": 43})]}}}}},
        ]
        with mock.patch.object(fetch, "gh_json", side_effect=pages) as gh:
            items = fetch.fetch_project_items()
        self.assertEqual([i["number"] for i in items], [42, 43])
        self.assertEqual(gh.call_count, 2)
        self.assertIn("after=C1", gh.call_args_list[1].args)


class MainFallback(unittest.TestCase):
    def test_sans_acces_au_projet_le_mode_degrade_ecrit_les_issues_rest(self):
        import tempfile, pathlib
        issues = [{"number": 7, "title": "A", "state": "closed", "created_at": "2026-08-01T00:00:00Z", "closed_at": "2026-08-02T00:00:00Z", "html_url": "u", "milestone": None}]
        with tempfile.TemporaryDirectory() as d, \
             mock.patch.object(fetch, "fetch_milestones", return_value=[]), \
             mock.patch.object(fetch, "fetch_project_items", side_effect=subprocess.CalledProcessError(1, "gh")), \
             mock.patch.object(fetch, "fetch_issues_rest", return_value=issues):
            out = pathlib.Path(d) / "data.json"
            fetch.main(out)
            data = json.loads(out.read_text())
        self.assertEqual(data["mode"], "fallback")
        self.assertEqual([i["number"] for i in data["items"]], [7])
        self.assertEqual(data["items"][0]["status"], "Done")

    def test_avec_le_projet_le_mode_est_nominal(self):
        import tempfile, pathlib
        with tempfile.TemporaryDirectory() as d, \
             mock.patch.object(fetch, "fetch_milestones", return_value=[]), \
             mock.patch.object(fetch, "fetch_project_items", return_value=[{"number": 1}]):
            out = pathlib.Path(d) / "data.json"
            fetch.main(out)
            data = json.loads(out.read_text())
        self.assertEqual(data["mode"], "project")
        self.assertEqual(data["items"], [{"number": 1}])


if __name__ == "__main__":
    unittest.main()
