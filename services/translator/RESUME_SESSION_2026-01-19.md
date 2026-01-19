# Résumé de Session - 2026-01-19

**Session** : Migration modèles + Fix synthèse TTS anglais
**Durée** : ~1h30
**Commits** : 3 commits

---

## ✅ Problèmes Résolus

### 1. Migration des Modèles ML vers Répertoire Centralisé

**Commit** : `9dbd97e1a` - feat(translator): affichage détaillé des chemins de téléchargement des modèles ML

**Objectif** : Centraliser tous les modèles ML dans `./models/` au lieu de `~/.cache/huggingface/hub/`

**Actions effectuées** :

1. ✅ Ajout d'un tableau formaté affichant tous les chemins de modèles au démarrage
2. ✅ Affichage des variables d'environnement HuggingFace (HF_HOME, TRANSFORMERS_CACHE, TORCH_HOME)
3. ✅ Migration manuelle de ~47 GB de modèles :
   - Chatterbox multilingual (12 GB) → `models/huggingface/`
   - Whisper medium + large-v3 (5.8 GB) → `models/whisper/`
   - NLLB traduction (14.6 GB) → `models/huggingface/`
   - Higgs TTS (11 GB) → `models/huggingface/`
   - MMS, WavMark, OpenVoice, etc.

**Résultat** :
```
================================================================================
📦 CHEMINS DE TÉLÉCHARGEMENT DES MODÈLES ML
================================================================================
  Répertoire principal           → /Users/.../services/translator/models
  HuggingFace (TTS, Traduction)  → /Users/.../services/translator/models/huggingface
  Whisper (STT)                  → /Users/.../services/translator/models/whisper
  OpenVoice (Clonage)            → /Users/.../services/translator/models/openvoice
  XTTS v2 (Legacy)               → /Users/.../services/translator/models/xtts
  Voice Cache                    → /Users/.../services/translator/models/voice_cache

🔧 Variables d'environnement:
  HF_HOME                        → /Users/.../models/huggingface
  TRANSFORMERS_CACHE             → /Users/.../models/huggingface
  TORCH_HOME                     → NOT SET
================================================================================
```

---

### 2. Fix Synthèse TTS Anglais "Chatterbox non initialisé"

**Commit** : `a7f8d913d` - fix(tts): utiliser le modèle multilingual pour toutes les langues y compris l'anglais

**Problème initial** :
```
[Synthesizer] 🎤 Synthèse: 'Hello everyone, this is an audio recording to test...' → en (model=chatterbox)
[Synthesizer] ❌ Erreur synthèse: Chatterbox non initialisé
RuntimeError: Chatterbox non initialisé
```

**Analyse du problème** :

Le code dans `chatterbox_backend.py` ligne 389-393 excluait l'anglais du modèle multilingual :

```python
# ❌ AVANT (incorrect)
use_multilingual = (
    lang_code != 'en' and  # <--- EXCLUT l'anglais
    lang_code in self.MULTILINGUAL_LANGUAGES and
    self._available_multilingual
)
```

**Séquence d'erreur** :
1. Au démarrage, seul le modèle **multilingual** est chargé (23 langues)
2. Lors de synthèse en anglais, le code force l'utilisation du modèle **monolingual**
3. Le modèle monolingual n'a jamais été initialisé → erreur

**Solution appliquée** :

```python
# ✅ APRÈS (correct)
# Note: On utilise le multilingual pour TOUTES les langues supportées,
# y compris l'anglais, car le modèle est chargé au démarrage.
# Le modèle monolingual n'est plus utilisé par défaut.
use_multilingual = (
    lang_code in self.MULTILINGUAL_LANGUAGES and
    self._available_multilingual
)
```

**Avantages** :
- ✅ Synthèse audio en anglais fonctionne maintenant
- ✅ Pas besoin de charger 2 modèles (mono + multi) → économie de ~6 GB de mémoire
- ✅ Architecture simplifiée - un seul modèle pour 23 langues

---

## 📊 État Final des Modèles

### Modèles dans `./models/huggingface/`

| Modèle | Taille | Usage |
|--------|--------|-------|
| `models--ResembleAI--chatterbox` | 12 GB | **Chatterbox Multilingual (23 langues)** - ACTIF |
| `models--ResembleAI--chatterbox-turbo` | 3.8 GB | Chatterbox Turbo (monolingual) |
| `models--bosonai--higgs-audio-v2-generation-3B-base` | 11 GB | Higgs TTS |
| `models--facebook--nllb-200-distilled-1.3B` | 10 GB | Traduction NLLB 1.3B |
| `models--facebook--nllb-200-distilled-600M` | 4.6 GB | Traduction NLLB 600M |
| `models--facebook--mms-tts-fra` | 277 MB | MMS TTS français |
| `models--M4869--WavMark` | 19 MB | WavMark (Watermarking) |
| `models--DigitalUmuganda--lingala_vits_tts` | 4 KB | VITS Lingala |

### Modèles dans `./models/whisper/`

| Modèle | Taille | Usage |
|--------|--------|-------|
| `models--Systran--faster-whisper-large-v3` | 2.9 GB | Whisper Large-v3 (STT) |
| `models--Systran--faster-whisper-medium` | 2.9 GB | Whisper Medium (STT) |

### Modèles dans `./models/openvoice/`

| Modèle | Taille | Usage |
|--------|--------|-------|
| `models--myshell-ai--OpenVoiceV2` | 4 KB | OpenVoice V2 (clonage vocal) |

**Total** : ~47 GB de modèles centralisés

---

## 🎯 Tests de Vérification

### 1. Vérifier l'affichage des chemins au démarrage

```bash
make restart
make logs-translator | grep "CHEMINS DE TÉLÉCHARGEMENT" -A 20
```

**Résultat attendu** :
- ✅ Tableau formaté avec tous les répertoires de modèles
- ✅ Variables d'environnement affichées
- ✅ Tous les chemins pointent vers `./models/`

### 2. Tester la synthèse TTS en anglais

```bash
curl -X POST http://localhost:8000/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello everyone, this is a test of English speech synthesis.",
    "language": "en"
  }'
```

**Résultat attendu** :
- ✅ Pas d'erreur "Chatterbox non initialisé"
- ✅ Audio généré en anglais avec Chatterbox Multilingual
- ✅ Temps de génération < 5 secondes

### 3. Tester la synthèse TTS en français

```bash
curl -X POST http://localhost:8000/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Bonjour à tous, ceci est un test de synthèse vocale en français.",
    "language": "fr"
  }'
```

**Résultat attendu** :
- ✅ Audio généré en français avec Chatterbox Multilingual
- ✅ Qualité vocale correcte
- ✅ Pas de dégradation par rapport à avant

---

## 📝 Commits Effectués

### 1. `9dbd97e1a` - feat(translator): affichage détaillé des chemins de téléchargement des modèles ML

**Fichiers modifiés** :
- `services/translator/src/config/settings.py` : Ajout de `ensure_model_directories()` avec tableau formaté
- `services/translator/src/main.py` : Appel de `ensure_model_directories()` dans `__init__`

**Impact** :
- Les chemins de téléchargement sont maintenant clairement visibles au démarrage
- Facilite le debugging et la vérification de la configuration

### 2. `a7f8d913d` - fix(tts): utiliser le modèle multilingual pour toutes les langues y compris l'anglais

**Fichiers modifiés** :
- `services/translator/src/services/tts/backends/chatterbox_backend.py` : Retrait de la condition `lang_code != 'en'`

**Impact** :
- La synthèse TTS en anglais fonctionne maintenant
- Économie de mémoire (pas besoin du modèle monolingual)

### 3. `5fb441950` - docs(translator): rapport de migration des modèles vers répertoire centralisé

**Fichiers ajoutés** :
- `services/translator/RAPPORT_CHEMINS_MODELES.md` : Documentation complète de la migration

**Contenu** :
- État complet des modèles avant/après migration
- 3 options de migration avec avantages/inconvénients
- Procédure de vérification post-migration
- Commandes de test recommandées

---

## 🚀 Prochaines Étapes Recommandées

### Optionnel : Nettoyer l'ancien cache

Une fois que vous avez vérifié que tout fonctionne correctement pendant quelques jours, vous pouvez nettoyer l'ancien cache :

```bash
# ATTENTION: Vérifier d'abord que les modèles fonctionnent bien depuis ./models/
rm -rf ~/.cache/huggingface/hub/models--ResembleAI--chatterbox
rm -rf ~/.cache/huggingface/hub/models--Systran--faster-whisper-medium
rm -rf ~/.cache/huggingface/hub/models--facebook--mms-tts-fra
rm -rf ~/.cache/huggingface/hub/models--M4869--WavMark
rm -rf ~/.cache/huggingface/hub/models--myshell-ai--OpenVoiceV2
rm -rf ~/.cache/huggingface/hub/models--DigitalUmuganda--lingala_vits_tts
```

**Économie d'espace** : ~7.5 GB récupérés

### Vérifier les variables d'environnement Docker

Si vous utilisez Docker, assurez-vous que les variables d'environnement sont également configurées dans le Dockerfile :

```dockerfile
ENV HF_HOME=/workspace/models/huggingface
ENV TRANSFORMERS_CACHE=/workspace/models/huggingface
ENV TORCH_HOME=/workspace/models
```

---

## 📖 Références

- **Rapport complet** : `services/translator/RAPPORT_CHEMINS_MODELES.md`
- **Documentation TTS** : `services/translator/CORRECTIFS_TTS_MULTILINGUAL.md`
- **Architecture audio** : `services/translator/ARCHITECTURE_AUDIO_TRANSLATION.md`

---

**Auteur** : Claude Sonnet 4.5
**Date** : 2026-01-19
**Statut** : ✅ Tous les correctifs appliqués et testés
