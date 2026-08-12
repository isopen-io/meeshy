#!/usr/bin/env python3
"""
Test Rapide des Pipelines - PRÉ-DÉMARRAGE
==========================================

Lance les tests mono-locuteur et multi-locuteur pour vérifier
que tout fonctionne AVANT de démarrer les services de développement.

Usage:
    cd services/translator
    python tests/test_pipelines_quick.py

    # Ou avec pytest
    pytest tests/test_pipelines_quick.py -v
"""

import sys
import os
import asyncio
import time
import pytest

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Couleurs
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'
BOLD = '\033[1m'


async def run_quick_tests():
    """Exécute les tests rapides des deux pipelines"""

    print(f"\n{BOLD}{'='*70}{RESET}")
    print(f"{BOLD}{BLUE}  🔬 TESTS RAPIDES PRÉ-DÉMARRAGE - Meeshy Translator{RESET}")
    print(f"{BOLD}{'='*70}{RESET}\n")

    total_start = time.time()
    results = {}

    # ═══════════════════════════════════════════════════════════════
    # TEST 1: MONO-LOCUTEUR
    # ═══════════════════════════════════════════════════════════════
    print(f"{BOLD}{BLUE}▶ TEST 1: Pipeline MONO-LOCUTEUR{RESET}")
    print(f"{'-'*50}")

    try:
        from test_pipeline_mono_speaker import test_mono_speaker_pipeline
        success, errors, warnings = await test_mono_speaker_pipeline()
        results['mono'] = {
            'success': success,
            'errors': errors,
            'warnings': warnings
        }
    except Exception as e:
        print(f"{RED}❌ Erreur test mono-locuteur: {e}{RESET}")
        results['mono'] = {
            'success': False,
            'errors': [str(e)],
            'warnings': []
        }

    # ═══════════════════════════════════════════════════════════════
    # TEST 2: MULTI-LOCUTEUR
    # ═══════════════════════════════════════════════════════════════
    print(f"\n{BOLD}{BLUE}▶ TEST 2: Pipeline MULTI-LOCUTEUR{RESET}")
    print(f"{'-'*50}")

    try:
        from test_pipeline_multi_speaker import test_multi_speaker_pipeline
        success, errors, warnings = await test_multi_speaker_pipeline()
        results['multi'] = {
            'success': success,
            'errors': errors,
            'warnings': warnings
        }
    except Exception as e:
        print(f"{RED}❌ Erreur test multi-locuteur: {e}{RESET}")
        results['multi'] = {
            'success': False,
            'errors': [str(e)],
            'warnings': []
        }

    # ═══════════════════════════════════════════════════════════════
    # RÉSUMÉ FINAL
    # ═══════════════════════════════════════════════════════════════
    total_time = time.time() - total_start

    print(f"\n{BOLD}{'='*70}{RESET}")
    print(f"{BOLD}  📊 RÉSUMÉ DES TESTS{RESET}")
    print(f"{BOLD}{'='*70}{RESET}\n")

    all_success = True
    total_errors = 0
    total_warnings = 0

    for name, result in results.items():
        status = f"{GREEN}✅ PASS{RESET}" if result['success'] else f"{RED}❌ FAIL{RESET}"
        err_count = len(result['errors'])
        warn_count = len(result['warnings'])
        total_errors += err_count
        total_warnings += warn_count

        if not result['success']:
            all_success = False

        print(f"  {name.upper():12} {status}  ({err_count} erreurs, {warn_count} avertissements)")

    print(f"\n  {'─'*50}")
    print(f"  Temps total: {total_time:.2f}s")
    print(f"  Erreurs totales: {total_errors}")
    print(f"  Avertissements totaux: {total_warnings}")

    print(f"\n{BOLD}{'='*70}{RESET}")

    if all_success:
        print(f"{GREEN}{BOLD}  ✅ TOUS LES TESTS PASSENT - Prêt pour le développement!{RESET}")
    else:
        print(f"{RED}{BOLD}  ❌ DES TESTS ONT ÉCHOUÉ - Corriger avant de démarrer{RESET}")

    print(f"{BOLD}{'='*70}{RESET}\n")

    return all_success


def main():
    """Point d'entrée principal"""
    success = asyncio.run(run_quick_tests())
    sys.exit(0 if success else 1)


# Pour pytest
@pytest.mark.slow
def test_mono_speaker_pipeline():
    """Test pytest pour le pipeline mono-locuteur"""
    from test_pipeline_mono_speaker import test_mono_speaker_pipeline as _test
    success, errors, _ = asyncio.run(_test())
    assert success, f"Pipeline mono-locuteur a échoué: {errors}"


@pytest.mark.slow
def test_multi_speaker_pipeline():
    """Test pytest pour le pipeline multi-locuteur"""
    from test_pipeline_multi_speaker import test_multi_speaker_pipeline as _test
    success, errors, _ = asyncio.run(_test())
    assert success, f"Pipeline multi-locuteur a échoué: {errors}"


if __name__ == "__main__":
    main()
