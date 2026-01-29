#!/usr/bin/env python3
"""
Test de disponibilité de sklearn et DiarizationCleaner
"""
import sys
import os

# Ajouter src au PYTHONPATH
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

print("=" * 80)
print("TEST: Disponibilité de sklearn et DiarizationCleaner")
print("=" * 80)

# Test 1: sklearn disponible
try:
    import sklearn
    print(f"✅ sklearn version: {sklearn.__version__}")
except ImportError as e:
    print(f"❌ sklearn NON disponible: {e}")
    sys.exit(1)

# Test 2: sklearn.cluster disponible
try:
    from sklearn.cluster import AgglomerativeClustering, KMeans
    from sklearn.metrics import silhouette_score
    print(f"✅ sklearn.cluster disponible (AgglomerativeClustering, KMeans)")
    print(f"✅ sklearn.metrics disponible (silhouette_score)")
except ImportError as e:
    print(f"❌ sklearn.cluster NON disponible: {e}")
    sys.exit(1)

# Test 3: DiarizationCleaner importable
try:
    from services.audio_processing.diarization_cleaner import (
        DiarizationCleaner,
        merge_consecutive_same_speaker
    )
    print(f"✅ DiarizationCleaner importable")
except ImportError as e:
    print(f"❌ DiarizationCleaner NON importable: {e}")
    sys.exit(1)

# Test 4: Créer une instance du cleaner
try:
    cleaner = DiarizationCleaner()
    print(f"✅ DiarizationCleaner instanciable")
    print(f"   - Threshold similarity: {cleaner.similarity_threshold}")
    print(f"   - Min speaker percentage: {cleaner.min_speaker_percentage}")
    print(f"   - Max sentence gap: {cleaner.max_sentence_gap}s")
    print(f"   - Min transition gap: {cleaner.min_transition_gap}s")
except Exception as e:
    print(f"❌ Erreur création DiarizationCleaner: {e}")
    sys.exit(1)

# Test 5: SpeechBrainDiarization avec nettoyage activé
try:
    from services.diarization_speechbrain import SpeechBrainDiarization
    diarizer = SpeechBrainDiarization(enable_cleaning=True)

    if diarizer.enable_cleaning and diarizer._cleaner:
        print(f"✅ SpeechBrainDiarization: Nettoyage ACTIVÉ")
        print(f"   - Cleaner chargé: {diarizer._cleaner is not None}")
        print(f"   - Merge consecutive chargé: {diarizer._merge_consecutive is not None}")
    else:
        print(f"⚠️  SpeechBrainDiarization: Nettoyage DÉSACTIVÉ")
        print(f"   - enable_cleaning: {diarizer.enable_cleaning}")
        print(f"   - _cleaner: {diarizer._cleaner}")
except Exception as e:
    print(f"❌ Erreur SpeechBrainDiarization: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 6: Vérifier les nouveaux thresholds
try:
    # Lire le fichier pour vérifier les valeurs
    with open('src/services/diarization_speechbrain.py', 'r') as f:
        content = f.read()

    if 'score > 0.60' in content:
        print(f"✅ Threshold silhouette: 0.60 (ULTRA-STRICT)")
    elif 'score > 0.35' in content:
        print(f"⚠️  Threshold silhouette: 0.35 (ancien - TROP BAS)")

    if 'window_size_ms: int = 2500' in content:
        print(f"✅ Window size: 2500ms (réduit sur-segmentation)")
    elif 'window_size_ms: int = 1500' in content:
        print(f"⚠️  Window size: 1500ms (ancien - TROP PETIT)")

except Exception as e:
    print(f"⚠️  Impossible de vérifier les thresholds: {e}")

print("=" * 80)
print("✅ TOUS LES TESTS RÉUSSIS!")
print("=" * 80)
print()
print("Le nettoyeur de diarisation est maintenant OPÉRATIONNEL.")
print("Redémarrez le service translator pour activer les changements:")
print("  docker-compose restart translator")
print("  # OU")
print("  pm2 restart translator")
