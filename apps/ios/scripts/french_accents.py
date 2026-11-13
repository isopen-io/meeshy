#!/usr/bin/env python3
"""
Garde « le français d'iOS porte ses accents » (#6451).

L'app servait « Communautes », « Creer la communaute », « Reglages », « Un code
SMS a ete envoye a votre telephone. » : des libellés français privés de leurs
accents, pendant que le web servait « Communautés ». Les catalogues ont été
corrigés ; ce script les empêche d'y revenir.

Il lit trois sources de TEXTE FRANÇAIS servi à l'utilisateur :
  1. la valeur `fr` de chaque entrée des catalogues `Localizable.xcstrings`
     d'iOS (app, extensions, SDK) ;
  2. chaque `defaultValue: "…"` des sources Swift écrites à la main (le repli
     qu'affiche l'app quand le catalogue ne résout pas) ;
  3. les blocs `"fr"` des textes juridiques servis en dur
     (`PrivacyPolicyView`, `TermsOfServiceView`).

Un mot de `WITHOUT_ACCENT` y fait rougir : chacun est la forme NUE d'un mot
français qui ne s'écrit jamais ainsi (« communaute », « reglages », « deja »…).
La liste ne retient aucune homographe valide (« partage », « manque », « aime »,
« publie », « accepte » sont du français correct sans accent) ni, hors des
textes français, aucun mot anglais (« creation », « preferences »,
« verification », « telephone » vivent dans `FRENCH_ONLY`, appliquée aux seules
sources 1 et 3, où la langue est certaine). C'est un PLANCHER : un mot absent de
la liste peut encore passer, mais un mot présent ne revient plus.

Run: python3 apps/ios/scripts/french_accents.py [--self-test]
Exit code 0 = aucun mot nu, 1 = violations.
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]

CATALOGS = [
    "apps/ios/Meeshy/Localizable.xcstrings",
    "apps/ios/MeeshyNotificationExtension/Localizable.xcstrings",
    "apps/ios/MeeshyNotificationContentExtension/Localizable.xcstrings",
    "apps/ios/MeeshyBroadcastExtension/Localizable.xcstrings",
    "apps/ios/MeeshyWidgets/Localizable.xcstrings",
    "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings",
]

SOURCE_ROOTS = ["apps/ios", "packages/MeeshySDK/Sources"]

FRENCH_BLOCK_FILES = [
    "apps/ios/Meeshy/Features/Settings/Views/PrivacyPolicyView.swift",
    "apps/ios/Meeshy/Features/Settings/Views/TermsOfServiceView.swift",
]

WITHOUT_ACCENT = [
    "communaute", "communautes", "creer", "creez", "creee", "reglage", "reglages",
    "numero", "numeros", "ete", "deja", "deplacee", "deplacer", "acceder", "privee",
    "moderateur", "moderateurs", "parametres", "reessayer", "reessayez",
    "supprimee", "selectionner", "selectionnee", "securite", "confidentialite",
    "generale", "verifier", "echec", "echouee", "reussi", "deconnecter",
    "deconnexion", "desactiver", "desactivee", "activee", "banniere", "reseau",
    "donnees", "donnee", "desole", "desolee", "delai", "derniere", "apres",
    "etre", "systeme", "activite", "definir", "telecharger", "telechargement",
    "epingle", "reponse", "reponses", "precedent", "evenement", "evenements",
    "categorie", "reinitialiser", "controle", "annulee", "terminee", "identite",
    "bientot", "ecrire", "equipe", "createur", "createurs", "necessaire",
    "repertoire", "envoyee", "recue", "modifiee", "bloquee", "validee",
    "demarrer", "etes", "etait", "interet", "ecran", "acces", "resultat",
    "resultats", "associee", "reservee", "visibilite", "propriete", "limitee",
    "crediter", "transfere", "republie", "tracee", "mentionne", "retrogade",
    "etapes", "requete", "decodage", "proteger", "utilisees", "ameliorer",
    "periodiquement", "responsabilite", "resiliation", "illegal",
]

FRENCH_ONLY = ["telephone", "creation", "preference", "preferences", "verification", "incomplete"]


def _pattern(words):
    return re.compile(r"\b(" + "|".join(sorted(set(words), key=len, reverse=True)) + r")\b", re.IGNORECASE)


ANY_LANGUAGE = _pattern(WITHOUT_ACCENT)
FRENCH_TEXT = _pattern(WITHOUT_ACCENT + FRENCH_ONLY)
DEFAULT_VALUE = re.compile(r'defaultValue:\s*"((?:[^"\\]|\\.)*)"')
STRING_LITERAL = re.compile(r'"((?:[^"\\]|\\.)*)"')
FRENCH_BLOCK = re.compile(r'"fr"\s*:\s*\[(.*?)\n\s*\],?\s*\n\s*"[a-z]{2}"\s*:', re.DOTALL)


def catalog_violations(catalog_text, label):
    strings = json.loads(catalog_text).get("strings", {})
    return [
        f"{label} [{key}] « {value} » : {', '.join(hits)}"
        for key, entry in strings.items()
        for value in [entry.get("localizations", {}).get("fr", {}).get("stringUnit", {}).get("value")]
        if value
        for hits in [FRENCH_TEXT.findall(value)]
        if hits
    ]


def default_value_violations(swift_text, label):
    return [
        f"{label} defaultValue « {match.group(1)} » : {', '.join(hits)}"
        for match in DEFAULT_VALUE.finditer(swift_text)
        for hits in [ANY_LANGUAGE.findall(match.group(1))]
        if hits
    ]


def french_block_violations(swift_text, label):
    return [
        f"{label} bloc fr « {literal[:80]} » : {', '.join(hits)}"
        for block in FRENCH_BLOCK.findall(swift_text)
        for literal in STRING_LITERAL.findall(block)
        for hits in [FRENCH_TEXT.findall(literal)]
        if hits
    ]


def handwritten_swift_sources():
    return sorted(
        path
        for root in SOURCE_ROOTS
        for path in (REPO / root).rglob("*.swift")
        if not any("Tests" in part or part in {"Build", ".build"} for part in path.relative_to(REPO).parts)
    )


def repository_violations():
    from_catalogs = [
        violation
        for catalog in CATALOGS
        if (REPO / catalog).exists()
        for violation in catalog_violations((REPO / catalog).read_text(encoding="utf-8"), catalog)
    ]
    from_defaults = [
        violation
        for path in handwritten_swift_sources()
        for violation in default_value_violations(path.read_text(encoding="utf-8", errors="ignore"), str(path.relative_to(REPO)))
    ]
    from_blocks = [
        violation
        for name in FRENCH_BLOCK_FILES
        for violation in french_block_violations((REPO / name).read_text(encoding="utf-8"), name)
    ]
    return from_catalogs + from_defaults + from_blocks


def self_test():
    red_catalog = json.dumps({"strings": {"community.list.title": {"localizations": {
        "fr": {"stringUnit": {"state": "new", "value": "Communautes"}},
        "en": {"stringUnit": {"state": "new", "value": "Communities"}}}}}})
    green_catalog = red_catalog.replace("Communautes", "Communautés")
    red_swift = 'Text(String(localized: "community.create.button", defaultValue: "Creer la communaute", bundle: .module))'
    homograph_swift = 'String(localized: "share.title", defaultValue: "Il manque un partage que j\'aime", bundle: .main)'
    english_swift = 'String(localized: "x", defaultValue: "Account creation failed", bundle: .main)'
    red_block = '"fr": [\n ("Securite des donnees", "Texte"),\n],\n "en": [\n ("Data", "Text")\n ]'
    green_block = red_block.replace("Securite des donnees", "Sécurité des données")
    english_block = '"fr": [\n ("Sécurité", "Texte"),\n],\n "en": [\n ("Data Security", "Your telephone verification")\n ]'
    cases = [
        ("catalogue fr sans accent", catalog_violations(red_catalog, "t"), True),
        ("catalogue fr accentué", catalog_violations(green_catalog, "t"), False),
        ("defaultValue sans accent", default_value_violations(red_swift, "t"), True),
        ("defaultValue homographe valide", default_value_violations(homograph_swift, "t"), False),
        ("defaultValue anglaise", default_value_violations(english_swift, "t"), False),
        ("bloc fr sans accent", french_block_violations(red_block, "t"), True),
        ("bloc fr accentué", french_block_violations(green_block, "t"), False),
        ("bloc en ignoré", french_block_violations(english_block, "t"), False),
    ]
    failures = [name for name, found, expected in cases if bool(found) != expected]
    for name in failures:
        print(f"self-test FAILED: {name}")
    blocks_seen = [name for name in FRENCH_BLOCK_FILES if FRENCH_BLOCK.search((REPO / name).read_text(encoding="utf-8"))]
    missing_blocks = sorted(set(FRENCH_BLOCK_FILES) - set(blocks_seen))
    for name in missing_blocks:
        print(f"self-test FAILED: aucun bloc fr lu dans {name} (la garde ne verrait plus rien)")
    return 1 if failures or missing_blocks else 0


def main(argv):
    if "--self-test" in argv:
        status = self_test()
        print("self-test OK" if status == 0 else "self-test KO")
        return status
    violations = repository_violations()
    for violation in violations:
        print(violation)
    if violations:
        print(f"\n{len(violations)} texte(s) français privé(s) de leurs accents (#6451).")
        return 1
    print("Français iOS : aucun mot privé de ses accents.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
