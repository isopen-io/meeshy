"""
Test du cache de conversion WAV
================================

Script de test pour vérifier le fonctionnement du cache de conversion M4A → WAV.
"""

import os
import time
from src.services.audio_pipeline.multi_speaker_processor import (
    cleanup_wav_cache,
    get_wav_cache_stats,
    WAV_CACHE_DIR
)


def test_cache_stats():
    """Affiche les statistiques du cache"""
    print("\n" + "=" * 60)
    print("📊 STATISTIQUES DU CACHE WAV")
    print("=" * 60)

    stats = get_wav_cache_stats()

    print(f"📁 Répertoire: {WAV_CACHE_DIR}")
    print(f"📄 Nombre de fichiers: {stats['total_files']}")
    print(f"💾 Taille totale: {stats['total_size_mb']} MB")
    print(f"📅 Fichier le plus ancien: {stats['oldest_file_age_days']} jours")

    if stats['total_files'] == 0:
        print("\n⚠️  Cache vide - aucune conversion effectuée récemment")
    else:
        print(f"\n✅ Cache actif avec {stats['total_files']} fichier(s)")


def test_cache_cleanup(dry_run=True):
    """
    Test du nettoyage du cache

    Args:
        dry_run: Si True, affiche ce qui serait supprimé sans rien supprimer
    """
    print("\n" + "=" * 60)
    print("🧹 NETTOYAGE DU CACHE WAV")
    print("=" * 60)

    if dry_run:
        print("Mode DRY RUN - Aucune suppression réelle\n")

        # Lister les fichiers expirés
        if not os.path.exists(WAV_CACHE_DIR):
            print("❌ Répertoire cache n'existe pas")
            return

        max_age_seconds = 7 * 86400  # 7 jours
        current_time = time.time()
        expired_files = []

        for filename in os.listdir(WAV_CACHE_DIR):
            if not filename.endswith('.wav'):
                continue

            file_path = os.path.join(WAV_CACHE_DIR, filename)
            file_age = current_time - os.path.getmtime(file_path)

            if file_age > max_age_seconds:
                age_days = file_age / 86400
                size_kb = os.path.getsize(file_path) / 1024
                expired_files.append((filename, age_days, size_kb))

        if expired_files:
            print(f"🗑️  Fichiers expirés (>{7} jours) :\n")
            for filename, age, size in expired_files:
                print(f"   • {filename}")
                print(f"     Age: {age:.1f} jours | Taille: {size:.1f} KB")

            print(f"\n📊 Total: {len(expired_files)} fichier(s) à supprimer")
        else:
            print("✅ Aucun fichier expiré - cache propre")

    else:
        print("Mode RÉEL - Suppression effective\n")
        removed = cleanup_wav_cache()

        if removed > 0:
            print(f"✅ {removed} fichier(s) supprimé(s)")
        else:
            print("✅ Aucun fichier à supprimer - cache propre")


def test_list_cache_files():
    """Liste tous les fichiers dans le cache"""
    print("\n" + "=" * 60)
    print("📋 CONTENU DU CACHE WAV")
    print("=" * 60 + "\n")

    if not os.path.exists(WAV_CACHE_DIR):
        print("❌ Répertoire cache n'existe pas")
        return

    files = []
    current_time = time.time()

    for filename in os.listdir(WAV_CACHE_DIR):
        if not filename.endswith('.wav'):
            continue

        file_path = os.path.join(WAV_CACHE_DIR, filename)
        file_age = (current_time - os.path.getmtime(file_path)) / 86400
        size_kb = os.path.getsize(file_path) / 1024

        files.append((filename, file_age, size_kb))

    if files:
        # Trier par âge décroissant
        files.sort(key=lambda x: x[1], reverse=True)

        for filename, age, size in files:
            status = "🟢" if age < 7 else "🔴"
            print(f"{status} {filename}")
            print(f"   Age: {age:.1f} jours | Taille: {size:.1f} KB\n")

        print(f"Total: {len(files)} fichier(s)")
    else:
        print("📭 Cache vide")


if __name__ == "__main__":
    print("\n🧪 TEST DU CACHE DE CONVERSION WAV\n")

    # 1. Afficher les stats
    test_cache_stats()

    # 2. Lister le contenu
    test_list_cache_files()

    # 3. Test nettoyage (dry run)
    test_cache_cleanup(dry_run=True)

    # Demander confirmation pour nettoyage réel
    print("\n" + "=" * 60)
    response = input("\n❓ Voulez-vous effectuer un nettoyage réel ? (oui/non) : ")

    if response.lower() in ['oui', 'o', 'yes', 'y']:
        test_cache_cleanup(dry_run=False)
        test_cache_stats()  # Afficher les nouvelles stats
    else:
        print("\n✅ Nettoyage annulé")

    print("\n✅ Tests terminés\n")
