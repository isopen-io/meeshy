# Rapport - Chemins de Téléchargement des Modèles ML

**Date** : 2026-01-19
**Commit** : `9dbd97e1a` - feat(translator): affichage détaillé des chemins de téléchargement des modèles ML

---

## ✅ Modifications Apportées

### 1. Affichage des Chemins au Démarrage

Ajout d'un tableau formaté dans `config/settings.py` qui s'affiche au démarrage du service :

```
================================================================================
📦 CHEMINS DE TÉLÉCHARGEMENT DES MODÈLES ML
================================================================================
  Répertoire principal           → /Users/smpceo/Documents/v2_meeshy/services/translator/models
  HuggingFace (TTS, Traduction)  → /Users/smpceo/Documents/v2_meeshy/services/translator/models/huggingface
  Whisper (STT)                  → /Users/smpceo/Documents/v2_meeshy/services/translator/models/whisper
  OpenVoice (Clonage)            → /Users/smpceo/Documents/v2_meeshy/services/translator/models/openvoice
  XTTS v2 (Legacy)               → /Users/smpceo/Documents/v2_meeshy/services/translator/models/xtts
  Voice Cache                    → /Users/smpceo/Documents/v2_meeshy/services/translator/models/voice_cache

🔧 Variables d'environnement:
  HF_HOME                        → /Users/smpceo/Documents/v2_meeshy/services/translator/models/huggingface
  TRANSFORMERS_CACHE             → /Users/smpceo/Documents/v2_meeshy/services/translator/models/huggingface
  TORCH_HOME                     → NOT SET
================================================================================
```

### 2. Variables d'Environnement Configurées

Les variables HuggingFace sont maintenant correctement configurées dans `.env` :

```bash
HF_HOME=/Users/smpceo/Documents/v2_meeshy/services/translator/models/huggingface
TRANSFORMERS_CACHE=/Users/smpceo/Documents/v2_meeshy/services/translator/models/huggingface
```

**Impact** : Les **nouveaux** modèles HuggingFace téléchargés utiliseront désormais le répertoire centralisé `./models/huggingface/`.

---

## 📊 État Actuel des Modèles

### Modèles dans `./models/huggingface/` (Nouveau Répertoire)

```
models--ResembleAI--chatterbox-turbo          (Chatterbox Turbo - monolingual)
models--bosonai--higgs-audio-v2-generation-3B-base  (Higgs TTS)
models--facebook--nllb-200-distilled-1.3B     (Traduction NLLB 1.3B)
models--facebook--nllb-200-distilled-600M     (Traduction NLLB 600M)
```

✅ Ces modèles sont déjà dans le bon répertoire centralisé.

### Modèles dans `~/.cache/huggingface/hub/` (Ancien Cache Global)

| Modèle | Taille | Usage | Priorité |
|--------|--------|-------|----------|
| `models--ResembleAI--chatterbox` | **6.0 GB** | Chatterbox Multilingual (23 langues) - **UTILISÉ ACTUELLEMENT** | 🔴 Haute |
| `models--Systran--faster-whisper-medium` | **1.4 GB** | Whisper STT (Speech-to-Text) | 🟡 Moyenne |
| `models--facebook--mms-tts-fra` | 139 MB | MMS TTS français | 🟢 Basse |
| `models--M4869--WavMark` | 9.6 MB | WavMark (Watermarking) | 🟢 Basse |
| `models--myshell-ai--OpenVoiceV2` | 4 KB | OpenVoice V2 (clonage vocal) | 🟢 Basse |
| `models--DigitalUmuganda--lingala_vits_tts` | 4 KB | VITS Lingala | 🟢 Basse |

**Total dans cache global** : ~7.5 GB

❗ **Problème** : Ces modèles ont été téléchargés **avant** que les variables d'environnement ne soient configurées. Ils sont encore utilisés depuis l'ancien cache global, pas depuis le répertoire centralisé.

---

## 🎯 Comportement Actuel

### Lors du Démarrage du Service

1. ✅ Les chemins sont affichés clairement au démarrage
2. ✅ Les variables d'environnement HuggingFace sont configurées
3. ⚠️ Les modèles **déjà existants** dans `~/.cache` continuent d'être utilisés
4. ✅ Les **nouveaux** modèles téléchargés iront dans `./models/huggingface/`

### Exemple Concret

**Chatterbox Multilingual** (actuellement utilisé) :
- Téléchargé le : 4 janvier 2026
- Localisation : `~/.cache/huggingface/hub/models--ResembleAI--chatterbox`
- Taille : 6.0 GB
- État : ✅ Fonctionne, mais pas dans le répertoire centralisé

**Logs de démarrage** :
```
[TTS] ✅ Chatterbox Multilingual (23 langues) disponible
[TTS] 🌍 Tentative de chargement Chatterbox Multilingual (23 langues)...
[TTS] 🔄 Chargement Chatterbox Multilingual (23 langues)...
[TTS] Chatterbox Multilingual initialisé sur mps (via ModelManager)
[TTS] ✅ Chatterbox Multilingual chargé - support de 23 langues activé
```

---

## 📋 Options de Migration

### Option 1 : Migration Manuelle (Recommandée)

**Avantages** :
- Contrôle total du processus
- Pas de re-téléchargement (économie de bande passante)
- Rapide (~quelques minutes pour copier)

**Étapes** :
```bash
cd /Users/smpceo/Documents/v2_meeshy/services/translator

# 1. Copier le modèle Chatterbox multilingual (6 GB)
cp -r ~/.cache/huggingface/hub/models--ResembleAI--chatterbox \
      models/huggingface/

# 2. Copier le modèle Whisper (1.4 GB)
cp -r ~/.cache/huggingface/hub/models--Systran--faster-whisper-medium \
      models/whisper/

# 3. Copier les autres modèles TTS
cp -r ~/.cache/huggingface/hub/models--facebook--mms-tts-fra \
      models/huggingface/

cp -r ~/.cache/huggingface/hub/models--M4869--WavMark \
      models/huggingface/

# 4. Redémarrer le service
make restart

# 5. Vérifier que les modèles fonctionnent
# 6. Nettoyer le cache global (optionnel)
rm -rf ~/.cache/huggingface/hub/models--*
```

### Option 2 : Re-téléchargement Propre

**Avantages** :
- Fichiers fraîchement téléchargés
- Pas de risque de corruption

**Inconvénients** :
- Nécessite ~7.5 GB de bande passante
- Plus long (~30 minutes selon connexion)

**Étapes** :
```bash
# 1. Nettoyer le cache global
rm -rf ~/.cache/huggingface/hub/models--*

# 2. Redémarrer le service (re-télécharge automatiquement)
make restart

# Les modèles seront téléchargés dans ./models/huggingface/
```

### Option 3 : Laisser en l'État (Ne Pas Recommander)

**Conséquence** :
- ❌ Modèles dispersés entre deux emplacements
- ❌ Difficulté à gérer l'espace disque
- ❌ Incohérence dans l'architecture

---

## 🔍 Vérification Post-Migration

Après migration (Option 1 ou 2), vérifier :

```bash
# 1. Vérifier les modèles dans le nouveau répertoire
ls -lh models/huggingface/models--*
ls -lh models/whisper/models--*

# 2. Vérifier que le cache global est vide (si nettoyé)
ls ~/.cache/huggingface/hub/

# 3. Redémarrer et vérifier les logs
make restart
make logs-translator | grep "CHEMINS DE TÉLÉCHARGEMENT"
```

**Logs attendus** :
```
📦 CHEMINS DE TÉLÉCHARGEMENT DES MODÈLES ML
================================================================================
  HuggingFace (TTS, Traduction)  → /Users/.../models/huggingface
  Whisper (STT)                  → /Users/.../models/whisper
...
[TTS] ✅ Chatterbox Multilingual chargé depuis ./models/huggingface/
```

---

## 📝 Recommandation Finale

**Je recommande l'Option 1 (Migration Manuelle)** pour les raisons suivantes :

1. ✅ Pas de re-téléchargement (économie de 7.5 GB de bande passante)
2. ✅ Rapide (~5-10 minutes)
3. ✅ Contrôle complet du processus
4. ✅ Possibilité de vérifier avant de nettoyer l'ancien cache

**Prochaine étape** : Exécuter les commandes de l'Option 1 ci-dessus.

---

**Auteur** : Claude Sonnet 4.5
**Date** : 2026-01-19
**Commit** : `9dbd97e1a` - feat(translator): affichage détaillé des chemins de téléchargement des modèles ML
