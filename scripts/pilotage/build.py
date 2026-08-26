#!/usr/bin/env python3
"""Génère la page « Avancement Meeshy » : template.html + compute.mjs (inliné) + data.json → une page autonome.
Usage : build.py [--data data.json] [--out site/index.html]
"""
import argparse
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
KEEP_ITEM = ("number", "title", "state", "createdAt", "closedAt", "milestone", "milestoneNumber", "milestoneDue", "status", "horizon", "priorite")
KEEP_MILESTONE = ("number", "title", "state", "dueOn", "closedAt", "url")


def slim(data):
    payload = {
        "fetchedAt": data["fetchedAt"], "mode": data.get("mode", "project"),
        "items": [{k: v for k, v in i.items() if k in KEEP_ITEM} for i in data["items"]],
        "milestones": [{k: v for k, v in m.items() if k in KEEP_MILESTONE} for m in data["milestones"]],
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def inline_compute(source):
    return re.sub(r"^export ", "", source, flags=re.MULTILINE)


def render(template, compute_source, data):
    return template.replace("__COMPUTE__", inline_compute(compute_source)).replace("__DATA__", slim(data))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=HERE / "data.json", type=pathlib.Path)
    ap.add_argument("--out", default=HERE / "site" / "index.html", type=pathlib.Path)
    args = ap.parse_args()
    html = render((HERE / "template.html").read_text(), (HERE / "compute.mjs").read_text(), json.loads(args.data.read_text()))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(html)
    print(f"{args.out} — {len(html) // 1024} Ko")


if __name__ == "__main__":
    main()
