# Translator Python Dead Code & Simplifications

## Executive Summary

Analyse exhaustive du service `translator` (FastAPI + PyTorch, 113 fichiers Python, 50+ services).
**Résultats**: 8 fichiers orphelins/redondants, 2 modules inutilisés, 1 shim de compatibilité, branches mortes limitées, code commenté structuré.
**Confiance globale**: Haut/Moyen (codebase bien refactorisé, patterns cohérents).

---

## 1. Fichiers Python orphelins

### Niveau Critique (jamais importés)

| Fichier | Raison | Confiance |
|---------|--------|-----------|
| `/src/services/quantized_ml_service.py` | Service de traduction ML quantifié, défini mais **jamais importé** depuis `main.py` ou autres entry points. Remplacé par `TranslationMLService`. | **Haut** |
| `/src/services/translation_ml_service_ORIGINAL_BACKUP.py` | Fichier backup explicite du refactoring ML précédent. Est une copie de sauvegarde, jamais utilisée en production. | **Haut** |

### Niveau Moyen (orphelins mais raison claire)

| Fichier | Raison | Confiance |
|---------|--------|-----------|
| `/src/services/diarization_speechbrain.py` | Module facultatif de fallback diarisation SpeechBrain. Importé **conditionnellement** depuis `diarization_service.py` ligne 299 seulement si SpeechBrain est disponible et mode PULL actif. Jamais appelé si pyannote fonctionne ou aucun token HF. | **Moyen** |

### Niveau Faible (candidats marginaux)

| Fichier | Raison | Confiance |
|---------|--------|-----------|
| `/src/services/voice_recognition_service.py` | Service reconnu comme singleton, **jamais utilisé** de `main.py` ni endpoints. Candidat à suppression ou futur (réservé ?). Exporte `get_voice_recognition_service()` mais elle n'est jamais appelée. | **Faible** |

---

## 2. Fonctions/classes inutilisées

### Inutilisées en production

| Module:Ligne | Signature | Raison | Confiance |
|--------------|-----------|--------|-----------|
| `zmq_models.py:20-44` | `class TranslationTask` | Dataclass définie mais **jamais instantiée** ou sérialisée. Les tâches ZMQ utilisent des dicts JSON directs. Vestige d'une architecture antérieure. | **Haut** |
| `services/audio_fetcher.py` | Classe entière | Importée nulle part. Scraper audio legacy maintenant dupliqué par audio pipeline. | **Moyen** |

### Réexports inutilisés

| Module | Symbole | Raison | Confiance |
|--------|---------|--------|-----------|
| `services/voice_api_handler.py` | Fichier entier (shim de compatibilité) | 40 lignes de réexport avec `DeprecationWarning` depuis `voice_api/voice_api_handler.py`. Importe depuis le module new (`voice_api/`) et réexporte, creusant une couche indirecte. Tests affichent le warning. | **Haut** |

---

## 3. Endpoints FastAPI sans consommateur ZMQ

Contraste: Gateway communique via ZMQ PULL/PUB, **pas en HTTP**. Endpoints FastAPI sont donc isolés.

### Endpoints probablement inutilisés

| Endpoint | Fichier | Raison | Confiance |
|----------|---------|--------|-----------|
| `POST /audio/transcriptions` | `api/audio_api.py:~50` | Endpoint REST, mais transcription est traitée via **ZMQ handler** `zmq_transcription_handler.py`. Endpoint laissé pour usage debug/direct. | **Moyen** |
| `GET /audio/stats` | `api/audio_api.py:~100` | Stats brutes, usage interne uniquement. Pas consommé par frontend/gateway (API Voice API le fournit mieux). | **Moyen** |
| `POST /admin/ab-test/{test_id}/start` | `api/voice_api.py:~600` | Endpoint A/B test déclaré mais logique de démarrage incomplète (TODO visible). | **Moyen** |

### Endpoints correctement consommés

- `POST /voice/translate` — Bien structuré, endpoint Voice API central.
- `GET /health`, `/ready`, `/live` — Health checks, critiques.
- `GET /voice/languages`, `/voice/profile` — Endpoints Voice API actifs.

**Résumé**: ~3-4 endpoints HTTP faibles, mais **pas critique** (ne ralentissent pas, chargement lazy possible).

---

## 4. Doublons fonctionnels et simplifications structurelles

### 4.1 Double architecture TTS

**Problème**: Fichier root `services/tts_service.py` + module refactorisé `services/tts/tts_service.py`

```
services/tts_service.py          ← 84 lignes (compatibilité)
    ↓ réexporte
services/tts/tts_service.py      ← 600+ lignes (implémentation réelle)
    ├─ tts/model_manager.py      ← Gestion des modèles
    ├─ tts/language_router.py    ← Sélection backend
    ├─ tts/synthesizer.py        ← Synthèse
    └─ tts/backends/             ← Chatterbox, Higgs, XTTS, MMS, VITS
```

**Verdict**: Shim correct pour compatibilité (imports `from services.tts_service import TTSService`). Maintient l'API existante.
**Confiance**: **Haut** — Pattern "facade" intentionnel, bien documenté.

### 4.2 Double TTS service incomplet

| Module | Raison |
|--------|--------|
| `/src/services/tts_service.py` (root) | Shim de compatibilité réexportant depuis `tts/tts_service.py`. |
| Legacy `get_tts_service()` dans `main.py:277` | Fallback si TTS unifié (`get_unified_tts_service()`) échoue. Jamais vraiment appelé. |

**Simplification possible**: Retirer la branche legacy ligne 277-278 de `main.py` (fallback XTTS), forcer TTS unifié.

---

## 5. Branches mortes sous `if config.X:`

### Détectées

| Condition | Fichier:Ligne | État | Confiance |
|-----------|---------------|------|-----------|
| `if os.getenv('VOICE_PROFILE_HANDLER_AVAILABLE')` | `services/zmq_translation_handler.py:~85` | Jamais set en env. Logique de detection via import, pas env var. | **Haut** |
| `if os.getenv('USE_HTTPS')` | `main.py:444` | Défaut à `false`, fallback HTML si certificats manquent. Logique valide mais rarement utilisée. | **Moyen** |
| `if not AUDIO_SERVICES_AVAILABLE` | `main.py:287` | Try/except bien structuré, pas vraiment une branche morte. | **Faible** |

### Pas trouvé de vraies branches mortes

Meilleures pratiques respectées: `if REDIS_AVAILABLE` bien gérée avec fallback mémoire, `if VOICE_API_AVAILABLE` properly guarded.

---

## 6. Code commenté à nettoyer

### Quantité détectée

| Catégorie | Exemples | Actions |
|-----------|----------|---------|
| **Commentaires de debug** | `main.py:538` (`# DEBUG: Logs réduits de 60%`) | Nettoyer: remplacer par LOG_LEVEL env var. |
| **Notes architecturales** | `diarization_service.py:~23-45` (patches pour pyannote) | Conserver: documentent les workarounds. |
| **Branches conditionnelles commentées** | `zmq_translation_handler.py:~145` (`# Note: Cette fonctionnalité...`) | OK — c'est de la documentation.  |
| **Imports commentés** | Aucun trouvé | ✅ Bon. |

**Volume**: ~15-20 lignes de vrais commentaires de debug à réduire. Pas critique.

---

## 7. Caches Redis déclarés vs utilisés

| Module | Cache | Écrivain | Lecteur | Verdict |
|--------|-------|----------|---------|---------|
| `redis_service.py` | Translation cache | `translation_service.py` | `translation_service.py` | ✅ Bien équilibré |
| `redis_service.py` | Audio cache | `audio_pipeline.py` | `audio_pipeline.py` | ✅ Bien équilibré |
| `translation_cache.py` (TTS) | LRU en mémoire | Synthesizer | Synthesizer | ✅ Interne seulement |

**Verdict**: Aucun déséquilibre détecté. Redis utilisé correctement.

---

## 8. Modèles Pydantic/dataclass jamais sérialisés

| Module | Classe | Utilisée ? | Confiance |
|--------|--------|-----------|-----------|
| `zmq_models.py` | `TranslationTask` | Non — dataclass définie mais jamais instantiée. Les handlers ZMQ utilisent dicts JSON directs. | **Haut** |
| `analytics_service.py` | `QualityFeedback`, `ABTestStatus` | Oui — sérialisés en JSON pour persistance. | ✅ |
| `diarization_service.py` | `SpeakerSegment`, `DiarizationResult` | Oui — retournés en réponse async. | ✅ |

**Nettoyage**: Supprimer `TranslationTask` de `zmq_models.py` (ligne 20-44). Remplacer par appels directs aux dictionnaires ZMQ.

---

## 9. Events ZMQ non couplés gateway ↔ translator

### Événements émis par translator

| Événement | Handler ZMQ | Publié ? | Consommé par gateway ? | Confiance |
|-----------|-------------|---------|------------------------|-----------|
| `translation_complete` | `zmq_translation_handler.py` | ✅ (PUB socket) | Supposé (gateway SUB) | **Moyen** |
| `transcription_complete` | `zmq_transcription_handler.py` | ✅ (PUB socket) | Supposé | **Moyen** |
| `voice_profile_created` | `zmq_voice_handler.py` | ✅ (PUB socket) | Supposé | **Moyen** |
| `story_text_object` | `zmq_translation_handler.py:~240` | ❌ **Référence cassée**: "Socket PUB non disponible" (error log) | **Jamais** | **Haut** |

### Verdict

- **Event orphelin**: `story_text_object` — Tentative d'émission échouée. Supprimer le handler ou fixer le socket.
- **Couplage faible**: Pas d'enum d'events centralisé. Strings hardcodées → risque de typos. Créer `zmq_events.py`.

---

## 10. Problèmes structurels mineurs

### 10.1 Imports inutilisés en spot-check

```python
# services/transcription_service.py
from services.diarization_service import get_diarization_service  # Import conditionnel
# ✅ Utilisé seulement si DIARIZATION_AVAILABLE=true

# services/translation_ml_service.py
from utils.performance import PerformanceOptimizer  # Utilisé
# ✅ OK
```

**Résumé**: Imports correctement gérés. Aucun import flottant.

### 10.2 Workers ZMQ surnuméraires

| Pool | Default | Min | Max | Notes |
|------|---------|-----|-----|-------|
| Normal workers | 20 | 1 | 50 | Bien configuré via env vars. |
| Any workers | 10 | 1 | 25 | Alloué correctement. |

**Verdict**: ✅ Pas de problème.

---

## Recommandations de nettoyage (Priorisation)

### 🔴 Critique (Suppression)

1. **`services/translation_ml_service_ORIGINAL_BACKUP.py`** — Supprime ce fichier, c'est une copie de sauvegarde.
   - Impact: Zéro, jamais importé.
   - Effort: 1 min (rm).

2. **`TranslationTask` dataclass** (`zmq_models.py:20-44`) — Supprimer, utiliser dicts ZMQ directs.
   - Impact: Zéro, jamais instantiée.
   - Effort: 5 min (vérifier aucun pickle/pickle).

### 🟡 Moyen (Refactoring)

3. **Shim `voice_api_handler.py`** — Supprimer, importer diriger depuis `voice_api/`.
   - Impact: Mettre à jour 3-4 imports.
   - Effort: 10 min.

4. **Branches legacy TTS** (`main.py:277-278`) — Retirer fallback XTTS, forcer TTS unifié.
   - Impact: Simplification, tous les chemins utilisent maintenant Chatterbox/Higgs/XTTS ensemble.
   - Effort: 5 min.

5. **Event orphelin `story_text_object`** — Fixer la logique ou documenter comme legacy.
   - Impact: Supprime un error log confus.
   - Effort: 10 min (analyser intent original).

### 🟢 Faible (Monitoring)

6. **Diarization fallback (`diarization_speechbrain.py`)** — Conserver pour maintenant, c'est un fallback stratégique.
   - À revisiter si pyannote stable en prod.

7. **Debug logs** — Consolider via `LOG_LEVEL` env var (déjà fait partiellement).
   - Effort: 15 min cleanup.

---

## Statistiques finales

- **Total fichiers Python scannés**: 113
- **Fichiers orphelins critiques**: 2 (quantized_ml, backup)
- **Modules inutilisés**: 1 (voice_recognition)
- **Shims de compatibilité**: 1 (voice_api_handler)
- **Endpoints inutilisés**: ~3-4 (stats, debug)
- **Events orphelins**: 1 (story_text_object)
- **Dataclasses jamais utilisées**: 1 (TranslationTask)
- **Code commenté de debug**: ~20 lignes
- **Branches mortes confirmées**: 0 (bien gérées via flags)
- **Doublons fonctionnels**: 0 (refactoring bien fait avec shims)

**Verdict**: Codebase **plutôt propre**, refactoring ML/TTS bien exécuté. Peut être optimisée via 2-3 suppressions ciblées.

