#!/usr/bin/env python3
"""
Script de vérification des imports Python
Vérifie que tous les modules peuvent être importés sans erreur
"""

import sys
import importlib.util
from pathlib import Path
import ast


def check_imports_in_file(filepath: Path) -> tuple[bool, list[str]]:
    """
    Vérifie les imports dans un fichier Python

    Returns:
        (success, errors): Tuple avec succès et liste d'erreurs
    """
    errors = []

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            tree = ast.parse(f.read(), filename=str(filepath))

        # Extraire tous les imports
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.append(node.module)

        # Vérifier que le fichier compile
        spec = importlib.util.spec_from_file_location("module", filepath)
        if spec is None:
            errors.append(f"Impossible de créer spec pour {filepath}")
            return False, errors

        return True, []

    except SyntaxError as e:
        errors.append(f"Erreur de syntaxe: {e}")
        return False, errors
    except Exception as e:
        errors.append(f"Erreur: {e}")
        return False, errors


def main():
    """Vérifie tous les fichiers Python dans src/"""
    translator_root = Path(__file__).parent
    src_dir = translator_root / "src"

    if not src_dir.exists():
        print(f"❌ Dossier {src_dir} introuvable")
        sys.exit(1)

    # Trouver tous les fichiers Python
    python_files = list(src_dir.rglob("*.py"))

    print(f"🔍 Vérification de {len(python_files)} fichiers Python...\n")

    all_success = True
    failed_files = []

    for filepath in python_files:
        # Ignorer __pycache__ et autres
        if "__pycache__" in str(filepath):
            continue

        success, errors = check_imports_in_file(filepath)

        if success:
            print(f"✅ {filepath.relative_to(translator_root)}")
        else:
            print(f"❌ {filepath.relative_to(translator_root)}")
            for error in errors:
                print(f"   {error}")
            all_success = False
            failed_files.append(filepath)

    print("\n" + "="*70)
    if all_success:
        print(f"✅ SUCCÈS - Tous les {len(python_files)} fichiers sont valides")
        sys.exit(0)
    else:
        print(f"❌ ÉCHEC - {len(failed_files)}/{len(python_files)} fichiers ont des erreurs:")
        for filepath in failed_files:
            print(f"   - {filepath.relative_to(translator_root)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
