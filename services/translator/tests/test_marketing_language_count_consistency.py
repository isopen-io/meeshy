"""
Garde de cohérence (#3638) : un seul chiffre de langues traduisibles,
calculé depuis la liste unique — `SUPPORTED_LANGUAGE_CODES`
(packages/shared/utils/language-codes.ts) intersectée avec `LANGUAGE_MAPPINGS`
(config/settings.py) — répété sur tous les supports marketing.

Avant #3638, chaque support affirmait un chiffre différent, inventé
indépendamment : « 200+ » (translator README, landing web), « 100+ »
(about/affiliate/metadata web), « 80+ » (fiche App Store, landing web
post-#6350). Le réel, mesuré depuis le code, est l'intersection ci-dessus —
PAS le compte brut de `SUPPORTED_LANGUAGE_CODES` (83), qui inclut 7 langues
camerounaises sans code NLLB que `TranslatorEngine` refuse explicitement de
traduire (voir le commentaire `LANGUAGE_MAPPINGS` dans `settings.py`).
"""
import re
from pathlib import Path

import pytest

from config.settings import _default_supported_languages_csv

REPO_ROOT = Path(__file__).resolve().parents[3]

MARKETING_FILES = [
    REPO_ROOT / "services/translator/README.md",
    REPO_ROOT / "docs/marketing/app-store-fiche-2026-08.md",
    REPO_ROOT / "apps/web/locales/en/landing.json",
    REPO_ROOT / "apps/web/locales/es/landing.json",
    REPO_ROOT / "apps/web/locales/fr/landing.json",
    REPO_ROOT / "apps/web/locales/pt/landing.json",
    REPO_ROOT / "apps/web/locales/en/about.json",
    REPO_ROOT / "apps/web/locales/fr/about.json",
    REPO_ROOT / "apps/web/locales/es/about.json",
    REPO_ROOT / "apps/web/locales/pt/about.json",
    REPO_ROOT / "apps/web/locales/en/affiliate.json",
    REPO_ROOT / "apps/web/locales/fr/affiliate.json",
    REPO_ROOT / "apps/web/locales/es/affiliate.json",
    REPO_ROOT / "apps/web/locales/pt/affiliate.json",
    REPO_ROOT / "apps/web/locales/en/metadata.json",
    REPO_ROOT / "apps/web/locales/fr/metadata.json",
    REPO_ROOT / "apps/web/locales/es/metadata.json",
    REPO_ROOT / "apps/web/locales/pt/metadata.json",
    REPO_ROOT / "apps/web/app/api/metadata/route.ts",
    REPO_ROOT / "apps/web-v2/src/institutional/about.ts",
]

# Chiffres périmés trouvés lors de l'audit #3638. Un support marketing ne
# doit plus jamais les afficher comme un compte de langues.
STALE_LANGUAGE_COUNT_PATTERNS = [
    re.compile(r"200\+?\s*(langues|languages|idiomas)", re.IGNORECASE),
    re.compile(r"100\+?\s*(langues|languages|idiomas)", re.IGNORECASE),
    re.compile(r"80\+?\s*(langues|languages|idiomas)", re.IGNORECASE),
]


def real_translatable_language_count() -> int:
    """Le SEUL calcul : liste produit ∩ langues effectivement mappées NLLB."""
    return len(_default_supported_languages_csv().split(","))


@pytest.mark.unit
def test_real_translatable_language_count_is_computed_and_documented():
    count = real_translatable_language_count()
    assert count > 0
    # Fige la valeur que ce témoin fait respecter ailleurs : si elle bouge
    # (ajout/retrait dans SUPPORTED_LANGUAGE_CODES ou LANGUAGE_MAPPINGS),
    # CE test rougit en premier — pas un support marketing en silence.
    assert count == 76


@pytest.mark.unit
@pytest.mark.parametrize(
    "path", MARKETING_FILES, ids=lambda p: str(p.relative_to(REPO_ROOT))
)
def test_marketing_surface_states_the_one_true_language_count(path):
    assert path.exists(), f"{path} introuvable"
    text = path.read_text(encoding="utf-8")
    count = real_translatable_language_count()

    for pattern in STALE_LANGUAGE_COUNT_PATTERNS:
        assert not pattern.search(text), (
            f"{path} affiche encore un chiffre de langues périmé "
            f"({pattern.pattern!r}) ; le chiffre unique calculé est {count}."
        )

    assert str(count) in text, (
        f"{path} ne mentionne pas le chiffre unique de langues traduisibles "
        f"({count}) — voir packages/shared/utils/language-codes.ts ∩ "
        f"services/translator/src/config/settings.py (LANGUAGE_MAPPINGS)."
    )
