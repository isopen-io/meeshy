#!/usr/bin/env python3
"""
Script de démarrage qui gère correctement les imports
"""

import sys
import os
import traceback
from pathlib import Path

# Configuration des chemins
current_dir = Path(__file__).parent
src_dir = current_dir / "src"

# Ajouter src au PYTHONPATH
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

# Maintenant exécuter main.py directement
if __name__ == "__main__":
    try:
        # Vérifier si nous sommes en mode Docker ou local
        if os.path.exists("/app"):
            # Mode Docker
            os.chdir("/app/src")
            print("🔧 [TRANSLATOR] Changement de répertoire vers: /app/src")
        else:
            # Mode local
            os.chdir(str(src_dir))
            print("🔧 [TRANSLATOR] Changement de répertoire vers:", str(src_dir))
        
        # Importer et exécuter main
        import main
        print("✅ [TRANSLATOR] Module main importé avec succès")
        
        # Exécuter la fonction main si elle existe
        if hasattr(main, 'main'):
            print("🚀 [TRANSLATOR] Exécution de main.main()...")
            import asyncio
            asyncio.run(main.main())
        else:
            print("⚠️ [TRANSLATOR] Fonction main() non trouvée dans le module main")
            
    except Exception as e:
        print(f"❌ Erreur dans start_service.py: {e}")
        traceback.print_exc()
        sys.exit(1)
