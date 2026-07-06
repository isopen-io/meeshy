"""
Régression pour l'incident prod 2026-07-04 : un post de 1839 caractères
(fr → 7 langues) n'a JAMAIS été traduit. Le texte est bien segmenté en
phrases par translate_with_structure, mais le processor appliquait un
timeout FIXE de 45 s à la traduction du texte ENTIER (tous segments,
modèle premium, CPU) : tout texte >~1500 chars force-échouait
(inference_timeout), le gateway épuisait 5 retries et le message restait
dans sa langue d'origine — rupture silencieuse du Prisme Linguistique.

Le budget d'inférence est désormais proportionnel à la longueur du texte,
borné pour ne pas monopoliser un worker.
"""

import inspect

import pytest

from services.zmq_pool import translation_processor as tp


@pytest.mark.unit
def test_short_text_keeps_the_45s_base():
    assert tp.inference_timeout_for(100) == pytest.approx(45.0)
    assert tp.inference_timeout_for(500) == pytest.approx(45.0)


@pytest.mark.unit
def test_incident_text_length_gets_a_workable_budget():
    # 1839 chars (le post de l'incident) : 45 + 30·(1339/500) ≈ 125 s —
    # assez pour ~20 segments premium sur CPU, loin du cap.
    budget = tp.inference_timeout_for(1839)
    assert 100.0 < budget < tp.INFERENCE_TIMEOUT_MAX_S


@pytest.mark.unit
def test_budget_is_capped_and_monotonic():
    assert tp.inference_timeout_for(100_000) == pytest.approx(tp.INFERENCE_TIMEOUT_MAX_S)
    budgets = [tp.inference_timeout_for(n) for n in (0, 200, 800, 2000, 10_000, 100_000)]
    assert budgets == sorted(budgets)


@pytest.mark.unit
def test_single_language_path_uses_the_proportional_budget():
    src = inspect.getsource(tp._translate_single_language)
    assert "inference_timeout_for" in src, (
        "le chemin per-langue doit utiliser le budget proportionnel — un "
        "timeout fixe de 45 s rejouerait l'incident du 2026-07-04"
    )


@pytest.mark.unit
def test_no_hardcoded_45s_waitfor_remains():
    module_src = inspect.getsource(tp)
    assert "timeout=45.0" not in module_src, (
        "plus aucun asyncio.wait_for(timeout=45.0) littéral : tous les "
        "chemins (single, batch fallback) passent par inference_timeout_for"
    )
