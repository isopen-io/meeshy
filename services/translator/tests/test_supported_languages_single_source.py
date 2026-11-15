"""#3658 — SUPPORTED_LANGUAGES vient de packages/shared, jamais d'un littéral.

Avant ce lot, `Settings.supported_languages` défaut à une chaîne de 40 codes
codée en dur dans `settings.py`, indépendante de `packages/shared` (83 codes)
et de `LANGUAGE_MAPPINGS` (63 codes NLLB) — trois listes qui pouvaient diverger
sans qu'aucun témoin ne le voie. `generated_languages.py` (généré depuis
`packages/shared/utils/language-codes.ts`, jamais édité à la main) est
désormais la source ; `_default_supported_languages_csv()` en prend
l'INTERSECTION avec `LANGUAGE_MAPPINGS`.

L'intersection est le point à garder au rouge s'il casse : annoncer un code
sans mapping NLLB reproduirait le bug déjà documenté dans
`translator_engine.py` (repli silencieux de `TranslatorEngine.lang_codes` vers
`eng_Latn`/`fra_Latn`).
"""

import os

from config.generated_languages import SUPPORTED_LANGUAGE_CODES
from config.settings import LANGUAGE_MAPPINGS, Settings


def _settings_without_env_override() -> Settings:
    previous = os.environ.pop("SUPPORTED_LANGUAGES", None)
    try:
        return Settings()
    finally:
        if previous is not None:
            os.environ["SUPPORTED_LANGUAGES"] = previous


def test_default_is_exactly_the_intersection_of_shared_codes_and_nllb_mappings():
    settings = _settings_without_env_override()
    expected = [code for code in SUPPORTED_LANGUAGE_CODES if code in LANGUAGE_MAPPINGS]

    assert settings.supported_languages_list == expected


def test_default_never_announces_a_code_without_an_nllb_mapping():
    """Le garde-fou réel : un code annoncé sans mapping NLLB mentirait sur ce
    que le translator sait faire (voir la note de translator_engine.py)."""
    settings = _settings_without_env_override()

    unmapped = [code for code in settings.supported_languages_list if code not in LANGUAGE_MAPPINGS]

    assert unmapped == []


def test_generated_file_is_not_hand_edited_into_something_hollow():
    """Fusible : les deux témoins ci-dessus passeraient au vert sur une
    feuille VIDE. Celui-ci ancre l'existence réelle du catalogue généré."""
    assert len(SUPPORTED_LANGUAGE_CODES) > 50
    assert "fr" in SUPPORTED_LANGUAGE_CODES
    assert "en" in SUPPORTED_LANGUAGE_CODES


def test_env_override_still_wins_over_the_generated_default():
    os.environ["SUPPORTED_LANGUAGES"] = "fr,en"
    try:
        settings = Settings()
        assert settings.supported_languages_list == ["fr", "en"]
    finally:
        del os.environ["SUPPORTED_LANGUAGES"]


def test_no_regression_against_the_previous_hardcoded_default():
    """La précédente valeur par défaut (40 codes, #3658) était déjà un
    sous-ensemble sûr de LANGUAGE_MAPPINGS. Ce lot ne doit en retirer aucun —
    seulement en ajouter, pour les codes que packages/shared reconnaît et que
    LANGUAGE_MAPPINGS sait déjà traduire mais que le littéral n'annonçait pas."""
    previous_default = (
        "af,ar,bg,bn,cs,da,de,el,en,es,fa,fi,fr,he,hi,hr,hu,hy,id,ig,it,ja,ko,ln,lt,"
        "ms,nl,no,pl,pt,ro,ru,sv,sw,th,tr,uk,ur,vi,zh"
    ).split(",")

    settings = _settings_without_env_override()

    missing = [code for code in previous_default if code not in settings.supported_languages_list]

    assert missing == []
