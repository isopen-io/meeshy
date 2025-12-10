#!/usr/bin/env python3
"""
Script de migration sécurisé pour composants React
Migre localStorage.getItem vers authManager avec gestion intelligente des imports
"""

import re
import sys
from pathlib import Path

# Fichiers à migrer
COMPONENT_FILES = [
    "components/settings/user-settings.tsx",
    "components/settings/password-settings.tsx",
    "components/settings/settings-layout.tsx",
    "components/translation/language-settings.tsx",
    "components/layout/DashboardLayout.tsx",
    "components/groups/groups-layout.tsx",
    "components/groups/groups-layout-responsive.tsx",
    "components/conversations/create-link-modal.tsx",
    "components/conversations/create-link-button.tsx",
    "components/conversations/conversation-links-section.tsx",
    "components/common/bubble-stream-page.tsx",
    "components/links/link-edit-modal.tsx",
    "components/affiliate/share-affiliate-modal.tsx",
]

def has_authmanager_import(content: str) -> bool:
    """Vérifie si le fichier importe déjà authManager"""
    return "authManager" in content or "auth-manager.service" in content

def find_last_import_line(lines: list) -> int:
    """Trouve l'index de la dernière ligne d'import"""
    last_import = -1
    in_multiline = False

    for i, line in enumerate(lines):
        stripped = line.strip()

        # Détecter début d'import multi-ligne
        if stripped.startswith('import') and '{' in stripped and '}' not in stripped:
            in_multiline = True
            last_import = i
        # Détecter fin d'import multi-ligne
        elif in_multiline and '}' in stripped:
            in_multiline = False
            last_import = i
        # Import simple sur une ligne
        elif stripped.startswith('import') or stripped.startswith('export'):
            last_import = i

    return last_import

def add_authmanager_import(lines: list) -> list:
    """Ajoute l'import authManager après le dernier import existant"""
    last_import_idx = find_last_import_line(lines)

    if last_import_idx == -1:
        # Pas d'imports trouvés, ajouter au début après 'use client' si présent
        for i, line in enumerate(lines):
            if "'use client'" in line or '"use client"' in line:
                lines.insert(i + 2, "import { authManager } from '@/services/auth-manager.service';\n")
                return lines
        # Sinon au tout début
        lines.insert(0, "import { authManager } from '@/services/auth-manager.service';\n")
        return lines

    # Ajouter après le dernier import
    lines.insert(last_import_idx + 1, "import { authManager } from '@/services/auth-manager.service';\n")
    return lines

def migrate_localstorage_calls(content: str) -> tuple[str, int]:
    """
    Migre les appels localStorage vers authManager
    Retourne (nouveau_contenu, nombre_de_remplacements)
    """
    replacements = 0

    # localStorage.getItem('auth_token') -> authManager.getAuthToken()
    pattern1 = r"localStorage\.getItem\s*\(\s*['\"]auth_token['\"]\s*\)"
    content, count1 = re.subn(pattern1, "authManager.getAuthToken()", content)
    replacements += count1

    # localStorage.getItem('meeshy-auth') -> authManager (besoin contexte)
    # On laisse tel quel car plus complexe

    # localStorage.getItem('anonymous_session_token') -> authManager.getAnonymousSession()?.token
    pattern2 = r"localStorage\.getItem\s*\(\s*['\"]anonymous_session_token['\"]\s*\)"
    content, count2 = re.subn(pattern2, "authManager.getAnonymousSession()?.token", content)
    replacements += count2

    return content, replacements

def migrate_file(filepath: Path) -> tuple[bool, str]:
    """
    Migre un fichier unique
    Retourne (succès, message)
    """
    if not filepath.exists():
        return False, f"❌ Fichier non trouvé: {filepath}"

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            original_content = f.read()

        # Vérifier si déjà migré
        if has_authmanager_import(original_content):
            return True, f"⏭️  Déjà migré: {filepath.name}"

        # Vérifier si le fichier a besoin de migration
        needs_migration = any([
            "localStorage.getItem('auth_token')" in original_content,
            'localStorage.getItem("auth_token")' in original_content,
            "localStorage.getItem('anonymous_session_token')" in original_content,
            'localStorage.getItem("anonymous_session_token")' in original_content,
        ])

        if not needs_migration:
            return True, f"⏭️  Pas de migration nécessaire: {filepath.name}"

        # Migration
        lines = original_content.split('\n')

        # 1. Ajouter import authManager
        lines = add_authmanager_import(lines)

        # 2. Reconstituer le contenu
        new_content = '\n'.join(lines)

        # 3. Remplacer les appels localStorage
        new_content, num_replacements = migrate_localstorage_calls(new_content)

        # Sauvegarder
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)

        return True, f"✅ Migré: {filepath.name} ({num_replacements} remplacements)"

    except Exception as e:
        return False, f"❌ Erreur: {filepath.name} - {str(e)}"

def main():
    """Point d'entrée principal"""
    base_dir = Path(__file__).parent

    print("🚀 Migration des composants vers authManager\n")
    print(f"Répertoire: {base_dir}\n")
    print("=" * 60)

    success_count = 0
    error_count = 0

    for relative_path in COMPONENT_FILES:
        filepath = base_dir / relative_path
        success, message = migrate_file(filepath)
        print(message)

        if success:
            success_count += 1
        else:
            error_count += 1

    print("=" * 60)
    print(f"\n📊 Résumé:")
    print(f"   ✅ Succès: {success_count}")
    print(f"   ❌ Erreurs: {error_count}")
    print(f"   📁 Total: {len(COMPONENT_FILES)}")

    return 0 if error_count == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
