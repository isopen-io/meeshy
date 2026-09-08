"""#3659 — Les 25 langues fantômes sont mappées ou retirées, plus jamais de
repli silencieux vers le français.

Décision du porteur (issue #3659, tranchée le 2026-09-02) :
1. Une cible sans code NLLB rend une erreur EXPLICITE, jamais `fra_Latn`.
2. Les 18 langues du catalogue NLLB-200 (ca, et, ka, kk, km, lo, lv, my, ne,
   sk, sl, sr, ta, tl, uz, az, ak, bm) sont MAPPÉES dans `LANGUAGE_MAPPINGS`.
3. Les 7 langues absentes de NLLB-200 (bas, byv, dua, ewo, fan, ksf, nnh —
   camerounaises) restent OFFERTES au produit mais ne sont JAMAIS traduites :
   aucune entrée dans `LANGUAGE_MAPPINGS`, donc `TranslatorEngine` lève
   `UnsupportedLanguageError` plutôt que de deviner une langue.

Avant ce lot, `TranslatorEngine.lang_codes.get(code, 'eng_Latn'/'fra_Latn')`
retombait silencieusement sur l'anglais ou le français pour les 25 — une
demande de tamoul rendait du français sans que rien ne le signale. C'est
exactement le repli que la règle 1 du Prisme Linguistique interdit.
"""
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest

from config.settings import LANGUAGE_MAPPINGS
from services.translation_ml.translator_engine import (
    TranslatorEngine,
    UnsupportedLanguageError,
)

# Les 18 langues fantômes que le catalogue NLLB-200/FLORES-200 sait servir —
# elles DOIVENT désormais avoir une entrée dans LANGUAGE_MAPPINGS.
NLLB_MAPPED_GHOSTS = {
    'ak': 'aka_Latn',
    'az': 'azj_Latn',
    'bm': 'bam_Latn',
    'ca': 'cat_Latn',
    'et': 'est_Latn',
    'ka': 'kat_Geor',
    'kk': 'kaz_Cyrl',
    'km': 'khm_Khmr',
    'lo': 'lao_Laoo',
    'lv': 'lvs_Latn',
    'my': 'mya_Mymr',
    'ne': 'npi_Deva',
    'sk': 'slk_Latn',
    'sl': 'slv_Latn',
    'sr': 'srp_Cyrl',
    'ta': 'tam_Taml',
    'tl': 'tgl_Latn',
    'uz': 'uzn_Latn',
}

# Les 7 langues camerounaises absentes de NLLB-200 — décision du porteur :
# restent offertes au produit, jamais traduites. Elles ne doivent JAMAIS
# apparaître dans LANGUAGE_MAPPINGS (un ajout à l'aveugle referait vivre le
# repli silencieux que ce lot corrige).
NLLB_UNAVAILABLE_GHOSTS = ['bas', 'byv', 'dua', 'ewo', 'fan', 'ksf', 'nnh']


def _engine():
    model_loader = MagicMock()
    model_loader.is_model_loaded.return_value = True
    return TranslatorEngine(model_loader=model_loader, executor=ThreadPoolExecutor(max_workers=1))


class TestLanguageMappingsCatalog:
    def test_the_eighteen_nllb_catalog_ghosts_are_mapped(self):
        for iso_code, expected_nllb_code in NLLB_MAPPED_GHOSTS.items():
            assert LANGUAGE_MAPPINGS.get(iso_code) == expected_nllb_code, (
                f"'{iso_code}' devrait pointer vers '{expected_nllb_code}' "
                f"(NLLB-200) et non {LANGUAGE_MAPPINGS.get(iso_code)!r}"
            )

    def test_the_seven_non_nllb_ghosts_stay_unmapped(self):
        """Garde-fou : un ajout à l'aveugle de ces 7 codes réintroduirait un
        mapping non vérifié contre le catalogue NLLB-200 réel."""
        for iso_code in NLLB_UNAVAILABLE_GHOSTS:
            assert iso_code not in LANGUAGE_MAPPINGS, (
                f"'{iso_code}' est hors NLLB-200 (décision porteur #3659) — "
                f"il ne doit pas apparaître dans LANGUAGE_MAPPINGS"
            )


class TestResolveNllbCode:
    """`_resolve_nllb_code` est le point de passage unique des deux call
    sites de traduction (chunk unique, batch) — le tester directement couvre
    les deux sans dépendre de PyTorch/NLLB chargés."""

    @pytest.mark.parametrize("iso_code,expected", list(NLLB_MAPPED_GHOSTS.items()))
    def test_mapped_ghost_resolves_to_its_real_nllb_code(self, iso_code, expected):
        assert _engine()._resolve_nllb_code(iso_code, 'cible') == expected

    @pytest.mark.parametrize("iso_code", NLLB_UNAVAILABLE_GHOSTS)
    def test_unmapped_ghost_raises_instead_of_defaulting_to_french(self, iso_code):
        with pytest.raises(UnsupportedLanguageError) as excinfo:
            _engine()._resolve_nllb_code(iso_code, 'cible')
        assert iso_code in str(excinfo.value)

    def test_unknown_source_code_raises_instead_of_defaulting_to_english(self):
        with pytest.raises(UnsupportedLanguageError):
            _engine()._resolve_nllb_code('bas', 'source')

    def test_known_code_still_resolves_normally(self):
        assert _engine()._resolve_nllb_code('fr', 'cible') == 'fra_Latn'
        assert _engine()._resolve_nllb_code('en', 'source') == 'eng_Latn'


class TestTranslateTextNeverFallsBackSilently:
    """Bout en bout sur `translate_text`/`translate_batch` : le repli
    silencieux visé par #3659 se produisait précisément à cet endroit, avant
    même la création d'un pipeline ML — donc reproductible sans PyTorch."""

    @pytest.mark.asyncio
    async def test_translate_text_raises_for_a_target_outside_nllb_200(self):
        engine = _engine()
        with pytest.raises(UnsupportedLanguageError):
            await engine.translate_text("Bonjour", "fr", "bas", "basic")

    @pytest.mark.asyncio
    async def test_translate_batch_raises_for_a_target_outside_nllb_200(self):
        engine = _engine()
        with pytest.raises(UnsupportedLanguageError):
            await engine.translate_batch(
                ["texte un", "texte deux", "texte trois"], "fr", "nnh", "basic"
            )

    @pytest.mark.asyncio
    async def test_translate_text_never_produces_french_for_an_unmapped_target(self):
        """Le symptôme original de #3659 : demander une cible sans mapping ne
        doit JAMAIS rendre un texte — français ou autre — comme si la
        traduction avait réussi."""
        engine = _engine()
        try:
            result = await engine.translate_text("Bonjour", "fr", "ksf", "basic")
        except UnsupportedLanguageError:
            return
        pytest.fail(f"attendu UnsupportedLanguageError, obtenu un résultat: {result!r}")
