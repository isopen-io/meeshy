"""Outils partagés des tests : relire un fichier de ressources Android comme aapt2."""
import atexit
import contextlib
import io
import json
import shutil
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

import xcstrings_to_android

_BOLD_OPEN = "\x00B"
_BOLD_CLOSE = "\x00E"


def android_unescape(raw):
    """Applique les règles de aapt2 à un contenu de chaîne : guillemets, échappements, blancs."""
    resolved = []
    in_quote = False
    pending_space = False

    def emit(char):
        nonlocal pending_space
        if pending_space and resolved:
            resolved.append(" ")
        pending_space = False
        resolved.append(char)

    index = 0
    while index < len(raw):
        char = raw[index]
        if char == "\\" and index + 1 < len(raw):
            index += 1
            emit({"n": "\n", "t": "\t"}.get(raw[index], raw[index]))
        elif char == '"':
            in_quote = not in_quote
        elif char in " \t\n\r" and not in_quote:
            pending_space = True
        else:
            emit(char)
        index += 1
    return "".join(resolved)


def _inner(element):
    parts = [element.text or ""]
    for child in element:
        parts.append(_BOLD_OPEN + _inner(child) + _BOLD_CLOSE + (child.tail or ""))
    return "".join(parts)


def resolved_text(element):
    return android_unescape(_inner(element)).replace(_BOLD_OPEN, "<b>").replace(_BOLD_CLOSE, "</b>")


def parse_resources(xml_text):
    """nom -> texte résolu (chaîne) ou {quantité: texte} (pluriel)."""
    root = ET.fromstring(xml_text)
    resources = {}
    for element in root:
        name = element.get("name")
        if element.tag == "string":
            resources[name] = resolved_text(element)
        elif element.tag == "plurals":
            resources[name] = {item.get("quantity"): resolved_text(item) for item in element}
    return resources


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def make_temp_dir():
    directory = tempfile.mkdtemp(prefix="i18n-test-")
    atexit.register(shutil.rmtree, directory, ignore_errors=True)
    return directory


def write_json(directory, name, document):
    path = Path(directory) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def catalog_document(strings, source_language="fr"):
    return {"sourceLanguage": source_language, "strings": strings, "version": "1.1"}


def string_unit(value, state="translated"):
    return {"stringUnit": {"state": state, "value": value}}


def plural_variations(**quantities):
    return {"variations": {"plural": {name: string_unit(text) for name, text in quantities.items()}}}


RES_DIR = "feature/demo/src/main/res"


class Project:
    """Un dépôt minimal : un catalogue iOS, un manifeste, un dossier de ressources Android."""

    def __init__(self, manifest=None):
        self.root = Path(make_temp_dir())
        self.android = self.root / "apps" / "android"
        self.catalog_path = self.root / "apps/ios/Meeshy/Localizable.xcstrings"
        self.manifest_path = self.android / "i18n/manifest/mini.json"
        self.catalog_path.parent.mkdir(parents=True)
        self.manifest_path.parent.mkdir(parents=True)
        shutil.copy(FIXTURES / "mini.xcstrings", self.catalog_path)
        document = manifest or json.loads((FIXTURES / "mini-manifest.json").read_text(encoding="utf-8"))
        self.write_manifest(document)

    def write_manifest(self, document):
        self.manifest_path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")

    def manifest(self):
        return json.loads(self.manifest_path.read_text(encoding="utf-8"))

    def edit_manifest(self, edit):
        document = self.manifest()
        edit(document["modules"][":feature:demo"]["entries"])
        self.write_manifest(document)

    def edit_catalog(self, edit):
        document = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        edit(document["strings"])
        self.catalog_path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")

    def res(self, folder="values", name="strings_generated.xml"):
        return self.android / RES_DIR / folder / name

    def generated(self, folder="values"):
        return parse_resources(self.res(folder).read_text(encoding="utf-8"))

    def hand_written(self, folder, body, file="strings.xml"):
        path = self.res(folder, file)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f'<resources>\n{body}\n</resources>\n', encoding="utf-8")
        return path

    def run(self, *flags):
        out, err = io.StringIO(), io.StringIO()
        arguments = ["--repo-root", str(self.root), "--android-root", str(self.android), *flags]
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = xcstrings_to_android.main(arguments)
        return code, out.getvalue(), err.getvalue()

    def snapshot(self):
        return {str(p.relative_to(self.root)): p.read_bytes() for p in sorted(self.root.rglob("*")) if p.is_file()}
