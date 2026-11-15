#!/usr/bin/env python3
"""Extrait l'état du pilotage Meeshy depuis GitHub vers un data.json.

Mode nominal  : les items du projet « Meeshy — pilotage » (org isopen-io, #1) avec Status / Horizon / dates.
Mode dégradé  : si le projet n'est pas lisible (le GITHUB_TOKEN des Actions ne lit pas les projets
                d'organisation), les issues du dépôt via REST — Status dérivé de l'état, horizon dérivé de l'échéance.
Usage : fetch.py [chemin/data.json]   (authentification : gh CLI, GH_TOKEN)
"""
import datetime
import json
import pathlib
import subprocess
import sys

ORG, REPO, PROJECT_NUMBER = "isopen-io", "isopen-io/meeshy", 1
MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]

QUERY = """
query($after: String) {
  organization(login: "%s") {
    projectV2(number: %d) {
      items(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          type
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
              ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } }
              ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
            }
          }
          content {
            ... on Issue {
              number title state createdAt closedAt url
              milestone { number title dueOn state }
              labels(first: 20) { nodes { name } }
            }
          }
        }
      }
    }
  }
}
""" % (ORG, PROJECT_NUMBER)


def gh_json(*args):
    return parse_concatenated(subprocess.check_output(["gh", *args], text=True))


def parse_concatenated(text):
    """`gh api --paginate` concatène un document JSON par page ; on les lit tous et on aplatit les listes."""
    decoder, pos, docs = json.JSONDecoder(), 0, []
    while True:
        while pos < len(text) and text[pos].isspace():
            pos += 1
        if pos >= len(text):
            break
        doc, pos = decoder.raw_decode(text, pos)
        docs.append(doc)
    if all(isinstance(d, list) for d in docs):
        return [x for d in docs for x in d]
    return docs[0] if len(docs) == 1 else docs


def french_date(iso):
    d = datetime.date.fromisoformat(iso[:10])
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def normalize_project_items(nodes):
    items = []
    for n in nodes:
        content = n.get("content")
        if not content:
            continue
        fields = {fv["field"]["name"]: fv.get("name") or fv.get("date") or fv.get("text")
                  for fv in n["fieldValues"]["nodes"] if fv and fv.get("field")}
        ms = content.get("milestone") or {}
        items.append({
            "id": n["id"], "number": content["number"], "title": content["title"], "url": content["url"],
            "state": content["state"], "createdAt": content["createdAt"], "closedAt": content["closedAt"],
            "milestone": ms.get("title"), "milestoneNumber": ms.get("number"), "milestoneDue": ms.get("dueOn"),
            "labels": [l["name"] for l in (content.get("labels") or {}).get("nodes", [])],
            "status": fields.get("Status"), "horizon": fields.get("Horizon"), "priorite": fields.get("Priorité"),
            "debut": fields.get("Début"), "echeance": fields.get("Échéance"), "tacheP0": fields.get("Tâche P0"),
        })
    return items


def fetch_project_items():
    items, after = [], None
    while True:
        args = ["api", "graphql", "-f", f"query={QUERY}"] + (["-f", f"after={after}"] if after else [])
        page = gh_json(*args)["data"]["organization"]["projectV2"]["items"]
        items += normalize_project_items(page["nodes"])
        if not page["pageInfo"]["hasNextPage"]:
            return items
        after = page["pageInfo"]["endCursor"]


def items_from_rest(issues):
    items = []
    for i in issues:
        if "pull_request" in i:
            continue
        ms = i.get("milestone") or {}
        due = ms.get("due_on")
        items.append({
            "id": None, "number": i["number"], "title": i["title"], "url": i["html_url"],
            "state": i["state"].upper(), "createdAt": i["created_at"], "closedAt": i["closed_at"],
            "milestone": ms.get("title"), "milestoneNumber": ms.get("number"), "milestoneDue": due,
            "labels": [l["name"] for l in i.get("labels", [])],
            "status": "Done" if i["state"] == "closed" else "Todo",
            "horizon": f"Échéance {french_date(due)}" if due else None,
            "priorite": None, "debut": None, "echeance": due[:10] if due else None, "tacheP0": None,
        })
    return items


def fetch_issues_rest():
    return gh_json("api", f"repos/{REPO}/issues?state=all&per_page=100", "--paginate")


def fetch_milestones():
    raw = gh_json("api", f"repos/{REPO}/milestones?state=all&per_page=100", "--paginate")
    return [{"number": m["number"], "title": m["title"], "state": m["state"], "dueOn": m["due_on"],
             "open": m["open_issues"], "closed": m["closed_issues"], "closedAt": m["closed_at"],
             "createdAt": m["created_at"], "url": m["html_url"], "description": m.get("description")} for m in raw]


def main(out_path):
    milestones = fetch_milestones()
    try:
        items, mode = fetch_project_items(), "project"
    except (subprocess.CalledProcessError, KeyError, TypeError) as err:
        print(f"projet non lisible ({err.__class__.__name__}) → mode dégradé : issues + milestones", file=sys.stderr)
        items, mode = items_from_rest(fetch_issues_rest()), "fallback"
    out = pathlib.Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "mode": mode, "items": items, "milestones": milestones,
    }, ensure_ascii=False, indent=1))
    print(f"{len(items)} items ({mode}), {len(milestones)} milestones → {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).with_name("data.json"))
