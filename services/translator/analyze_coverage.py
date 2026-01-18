#!/usr/bin/env python3
"""
Analyse du rapport de couverture et identification des modules avec couverture < 95%
"""

import json
from pathlib import Path
from typing import Dict, List, Tuple

def analyze_coverage_report(status_json_path: str) -> Dict:
    """Parse le rapport JSON de couverture"""
    with open(status_json_path, 'r') as f:
        data = json.load(f)

    return data['files']

def calculate_coverage_percentage(nums: Dict) -> float:
    """Calcule le pourcentage de couverture"""
    n_statements = nums['n_statements']
    n_missing = nums['n_missing']

    if n_statements == 0:
        return 100.0

    covered = n_statements - n_missing
    return (covered / n_statements) * 100

def get_module_category(file_path: str) -> str:
    """Cat\u00e9gorise le module par domaine"""
    if 'voice_clone/' in file_path:
        return 'voice_clone'
    elif 'translation_ml/' in file_path:
        return 'translation_ml'
    elif 'tts/' in file_path:
        return 'tts'
    elif 'audio_pipeline/' in file_path:
        return 'audio_pipeline'
    elif 'voice_api/' in file_path:
        return 'voice_api'
    elif 'zmq_pool/' in file_path:
        return 'zmq_pool'
    elif file_path.endswith('_service.py'):
        return 'services_root'
    else:
        return 'other'

def main():
    status_json = Path('/Users/smpceo/Documents/v2_meeshy/services/translator/htmlcov/status.json')

    if not status_json.exists():
        print("Erreur: Fichier status.json introuvable")
        return

    files = analyze_coverage_report(str(status_json))

    # Analyser tous les modules
    modules_by_category = {
        'voice_clone': [],
        'translation_ml': [],
        'tts': [],
        'audio_pipeline': [],
        'voice_api': [],
        'zmq_pool': [],
        'services_root': [],
        'other': []
    }

    total_statements = 0
    total_covered = 0

    for file_key, file_data in files.items():
        index = file_data['index']
        file_path = index['file']
        nums = index['nums']

        coverage = calculate_coverage_percentage(nums)
        category = get_module_category(file_path)

        # Calculer les statements couverts
        covered = nums['n_statements'] - nums['n_missing']
        total_statements += nums['n_statements']
        total_covered += covered

        module_info = {
            'path': file_path,
            'coverage': coverage,
            'statements': nums['n_statements'],
            'missing': nums['n_missing'],
            'branches': nums['n_branches'],
            'missing_branches': nums['n_missing_branches']
        }

        modules_by_category[category].append(module_info)

    # Calculer la couverture totale
    global_coverage = (total_covered / total_statements * 100) if total_statements > 0 else 0

    print("=" * 100)
    print("RAPPORT D'ANALYSE DE COUVERTURE - Service Translator")
    print("=" * 100)
    print(f"\nCOUVERTURE GLOBALE: {global_coverage:.2f}%")
    print(f"Total statements: {total_statements}, Couverts: {total_covered}, Manquants: {total_statements - total_covered}\n")

    # Afficher par cat\u00e9gorie
    for category, modules in modules_by_category.items():
        if not modules:
            continue

        print(f"\n{'='*80}")
        print(f"CAT\u00c9GORIE: {category.upper()}")
        print(f"{'='*80}")

        # Calculer la couverture moyenne de la cat\u00e9gorie
        category_total = sum(m['statements'] for m in modules)
        category_covered = sum(m['statements'] - m['missing'] for m in modules)
        category_coverage = (category_covered / category_total * 100) if category_total > 0 else 0

        print(f"Couverture moyenne: {category_coverage:.2f}% ({len(modules)} modules)")
        print()

        # Trier par couverture croissante
        modules_sorted = sorted(modules, key=lambda x: x['coverage'])

        for module in modules_sorted:
            status = "✓" if module['coverage'] >= 95 else "✗"
            color = "\033[92m" if module['coverage'] >= 95 else "\033[91m"
            reset = "\033[0m"

            print(f"{status} {color}{module['path']:70} {module['coverage']:6.2f}%{reset} "
                  f"({module['statements']:4d} stmts, {module['missing']:4d} missing, "
                  f"{module['missing_branches']:3d}/{module['branches']:3d} branches)")

    # R\u00e9sum\u00e9 des modules < 95%
    print(f"\n{'='*80}")
    print("MODULES PRIORITAIRES (Couverture < 95%)")
    print(f"{'='*80}\n")

    priority_modules = []
    for category, modules in modules_by_category.items():
        for module in modules:
            if module['coverage'] < 95 and module['statements'] > 0:
                priority_modules.append((category, module))

    priority_modules.sort(key=lambda x: (x[0], x[1]['coverage']))

    for category, module in priority_modules:
        missing_pct = 100 - module['coverage']
        print(f"[{category:20}] {module['path']:60} {module['coverage']:6.2f}% "
              f"(manque {missing_pct:.2f}%, {module['missing']} stmts)")

    print(f"\n{'='*80}")
    print(f"TOTAL: {len(priority_modules)} modules n\u00e9cessitent des tests suppl\u00e9mentaires")
    print(f"{'='*80}\n")

if __name__ == '__main__':
    main()
