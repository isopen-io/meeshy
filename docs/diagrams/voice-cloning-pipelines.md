# Schémas des Pipelines de Clonage Vocal - Meeshy Translator

## 📊 Vue d'ensemble comparative

| Aspect | **Lingala (VITS)** | **Espagnol (Chatterbox)** |
|--------|-------------------|---------------------------|
| **Modèle TTS** | DigitalUmuganda/lingala_vits_tts (ESPnet2) | ResembleAI/chatterbox-multilingual |
| **Clonage vocal** | OpenVoice (conversion de timbre) | Natif Chatterbox |
| **Pipeline** | 🔀 Hybride (2 étapes) | ✅ Direct (1 étape) |
| **Latence** | ⚠️ Plus élevée | ✅ Optimale |
| **Qualité clonage** | ⚠️ Dépend d'OpenVoice | ✅ Excellente |
| **Langues supportées** | Lingala uniquement | 23 langues |

---

## 🎯 Pipeline 1 : LINGALA (VITS + OpenVoice) - Pipeline Hybride

### Architecture complète

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PIPELINE LINGALA (ln) - HYBRIDE                      │
│                                                                         │
│  Utilise : VITS (ESPnet2) + OpenVoice ToneColorConverter              │
│  Raison  : Lingala non supporté par Chatterbox                        │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ 📝 INPUTS    │
├──────────────┤
│ • text: "Mbote, ozali malamu?"                                         │
│ • target_language: "ln" (Lingala)                                      │
│ • speaker_audio_path: "/path/to/reference_voice.mp3" (voix source)    │
└──────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ÉTAPE 1 : ANALYSE VOCALE (VoiceAnalyzerService)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  🎤 Extraction des caractéristiques de la voix source :                │
│     ┌────────────────────────────────────────────────────────┐        │
│     │ • Pitch (F0) : 150-250 Hz                              │        │
│     │ • Energy : -20 dB                                       │        │
│     │ • Speaking rate : 1.2x                                  │        │
│     │ • Timbre spectral : Vecteur 512D                       │        │
│     │ • Gender : "male" / "female"                            │        │
│     └────────────────────────────────────────────────────────┘        │
│                                                                         │
│  📊 Output: VoiceCharacteristics                                       │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ÉTAPE 2a : GÉNÉRATION TTS (VITS via ESPnet2)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  🔧 Modèle : DigitalUmuganda/lingala_vits_tts                          │
│  📦 Framework : ESPnet2 (espnet==202511)                                │
│                                                                         │
│  1. Chargement du modèle depuis HuggingFace :                          │
│     ┌────────────────────────────────────────────────────────┐        │
│     │ hf_hub_download(                                        │        │
│     │   repo_id="DigitalUmuganda/lingala_vits_tts",          │        │
│     │   filename="config.yaml"                                │        │
│     │ )                                                        │        │
│     │ hf_hub_download(                                        │        │
│     │   filename="train.total_count.best.pth"                 │        │
│     │ )                                                        │        │
│     └────────────────────────────────────────────────────────┘        │
│                                                                         │
│  2. Initialisation ESPnet2 :                                           │
│     ┌────────────────────────────────────────────────────────┐        │
│     │ from espnet2.bin.tts_inference import Text2Speech       │        │
│     │                                                          │        │
│     │ model = Text2Speech(                                     │        │
│     │     train_config=config_path,                            │        │
│     │     model_file=model_path,                               │        │
│     │     device="cpu"  # ou "cuda"                            │        │
│     │ )                                                         │        │
│     └────────────────────────────────────────────────────────┘        │
│                                                                         │
│  3. Synthèse vocale :                                                  │
│     ┌────────────────────────────────────────────────────────┐        │
│     │ audio = model(text="Mbote, ozali malamu?")              │        │
│     │                                                          │        │
│     │ # Génère un audio en Lingala avec une voix             │        │
│     │ # SYNTHÉTIQUE PAR DÉFAUT (pas encore clonée)           │        │
│     └────────────────────────────────────────────────────────┘        │
│                                                                         │
│  📊 Output: audio_synthetic_lingala.wav                                │
│            (Lingala, voix synthétique neutre)                          │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ÉTAPE 2b : CLONAGE VOCAL (OpenVoice ToneColorConverter)                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ⚠️ CRITIQUE : OpenVoice requis pour le clonage vocal Lingala          │
│  ❌ PROBLÈME : OpenVoice incompatible Python 3.11 (nécessite 3.9-3.10) │
│                                                                         │
│  SI OpenVoice disponible (Python 3.9-3.10) :                           │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ 1. Initialisation OpenVoice :                                 │     │
│  │    ┌──────────────────────────────────────────────┐          │     │
│  │    │ from openvoice.api import ToneColorConverter  │          │     │
│  │    │                                                │          │     │
│  │    │ converter = ToneColorConverter(               │          │     │
│  │    │     config_path="/models/openvoice/config.json",│        │     │
│  │    │     device="cpu"                               │          │     │
│  │    │ )                                               │          │     │
│  │    │ converter.load_ckpt("/models/openvoice/checkpoint.pth")│ │     │
│  │    └──────────────────────────────────────────────┘          │     │
│  │                                                                │     │
│  │ 2. Extraction embedding vocal source :                        │     │
│  │    ┌──────────────────────────────────────────────┐          │     │
│  │    │ source_embedding = converter.extract_se(      │          │     │
│  │    │     audio_path=speaker_audio_path             │          │     │
│  │    │ )                                              │          │     │
│  │    │ # Vecteur 256D représentant le timbre         │          │     │
│  │    └──────────────────────────────────────────────┘          │     │
│  │                                                                │     │
│  │ 3. Conversion de timbre :                                     │     │
│  │    ┌──────────────────────────────────────────────┐          │     │
│  │    │ audio_cloned = converter.convert(             │          │     │
│  │    │     audio=audio_synthetic_lingala,            │          │     │
│  │    │     src_se=None,  # embedding source automatique│        │     │
│  │    │     tgt_se=source_embedding  # cible          │          │     │
│  │    │ )                                              │          │     │
│  │    │                                                │          │     │
│  │    │ # Transforme le timbre de la voix synthétique │          │     │
│  │    │ # pour correspondre à la voix source          │          │     │
│  │    └──────────────────────────────────────────────┘          │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  SI OpenVoice NON disponible (Python 3.11+) :                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ ⚠️ MODE DÉGRADÉ : Pas de clonage vocal                        │     │
│  │                                                                 │     │
│  │ • Output = audio_synthetic_lingala.wav (inchangé)              │     │
│  │ • Log warning: "Clonage vocal désactivé (OpenVoice manquant)" │     │
│  │ • La synthèse fonctionne mais avec voix par défaut            │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  📊 Output: audio_cloned_lingala.wav                                   │
│            (Lingala, voix clonée OU voix par défaut si pas OpenVoice) │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ÉTAPE 3 : POST-TRAITEMENT                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  🎵 Normalisation audio :                                               │
│     • Ajustement du volume                                             │
│     • Suppression du silence                                           │
│     • Conversion format (MP3, WAV, etc.)                               │
│                                                                         │
│  💾 Sauvegarde :                                                        │
│     /workspace/generated/audios/{message_id}_ln.mp3                    │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────┐
│ 🎧 OUTPUT    │
├──────────────┤
│ UnifiedTTSResult {                                                     │
│   audio_path: "/workspace/generated/audios/msg123_ln.mp3"             │
│   duration: 3.5 seconds                                                │
│   format: "mp3"                                                        │
│   sample_rate: 22050 Hz                                                │
│   language: "ln"                                                       │
│   model_used: "vits"                                                   │
│   voice_cloning_used: true/false (selon OpenVoice disponibilité)      │
│   backend: "VITSBackend"                                               │
│ }                                                                      │
└──────────────┘

⏱️ LATENCE TOTALE ESTIMÉE :
   • VITS génération : ~2-3 secondes
   • OpenVoice conversion : ~1-2 secondes (si disponible)
   • Post-traitement : ~0.5 secondes
   • TOTAL : ~3.5-5.5 secondes (sans OpenVoice : ~2.5-3.5s)

⚠️ LIMITATIONS ACTUELLES :
   1. OpenVoice incompatible Python 3.11 → Pas de clonage vocal
   2. Pipeline en 2 étapes → Latence plus élevée
   3. Qualité dépend de la conversion OpenVoice
   4. Lingala uniquement (pas d'autres langues VITS)
```

---

## ✅ Pipeline 2 : ESPAGNOL (Chatterbox Multilingual) - Pipeline Direct

### Architecture complète

```
┌─────────────────────────────────────────────────────────────────────────┐
│              PIPELINE ESPAGNOL (es) - DIRECT NATIF                      │
│                                                                         │
│  Utilise : Chatterbox Multilingual (ResembleAI)                       │
│  Raison  : Espagnol supporté nativement (1 des 23 langues)            │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ 📝 INPUTS    │
├──────────────┤
│ • text: "Hola, ¿cómo estás?"                                          │
│ • target_language: "es" (Espagnol)                                     │
│ • speaker_audio_path: "/path/to/reference_voice.mp3" (voix source)    │
└──────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ÉTAPE 1 : ANALYSE VOCALE (VoiceAnalyzerService)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  🎤 Extraction des caractéristiques de la voix source :                │
│     ┌────────────────────────────────────────────────────────┐        │
│     │ • Pitch (F0) : 180-280 Hz                              │        │
│     │ • Energy : -18 dB                                       │        │
│     │ • Speaking rate : 1.0x                                  │        │
│     │ • Timbre spectral : Vecteur 512D                       │        │
│     │ • Gender : "male" / "female"                            │        │
│     │ • Emotion : "neutral" / "happy" / etc.                 │        │
│     └────────────────────────────────────────────────────────┘        │
│                                                                         │
│  📊 Output: VoiceCharacteristics                                       │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ÉTAPE 2 : GÉNÉRATION TTS AVEC CLONAGE (Chatterbox Multilingual)        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  🔧 Modèle : ResembleAI/chatterbox-multilingual                         │
│  📦 Package : chatterbox-tts==0.1.6                                     │
│  🌍 Langues : 23 langues (ar, da, de, el, en, es, fi, fr, ...)         │
│                                                                         │
│  1. Chargement du modèle (via ModelManager) :                          │
│     ┌────────────────────────────────────────────────────────┐        │
│     │ from chatterbox.mtl_tts import ChatterboxMultilingualTTS│       │
│     │                                                          │        │
│     │ model = ChatterboxMultilingualTTS(                       │        │
│     │     device="cpu",  # ou "cuda"                           │        │
│     │     cache_dir="/workspace/models"                        │        │
│     │ )                                                         │        │
│     │                                                           │        │
│     │ # Modèle unique géré par ModelManager (LRU cache)       │        │
│     └────────────────────────────────────────────────────────┘        │
│                                                                         │
│  2. Pré-calcul des conditionals (OPTIMISATION) :                       │
│     ┌────────────────────────────────────────────────────────┐        │
│     │ # Fait UNE SEULE FOIS par voix, puis réutilisé         │        │
│     │                                                          │        │
│     │ conditionals = model.get_conditionals(                  │        │
│     │     audio_path=speaker_audio_path                        │        │
│     │ )                                                         │        │
│     │                                                           │        │
│     │ # Génère :                                               │        │
│     │ # • T3Cond : Tensors pour le timbre vocal              │        │
│     │ # • gen_params : Paramètres de génération optimaux     │        │
│     │                                                           │        │
│     │ # ✅ Ces conditionals sont stockés dans le profil vocal │        │
│     │ #    et réutilisés pour toutes les synthèses suivantes  │        │
│     └────────────────────────────────────────────────────────┘        │
│                                                                         │
│  3. Synthèse avec clonage vocal intégré :                              │
│     ┌────────────────────────────────────────────────────────┐        │
│     │ audio = model.generate(                                  │        │
│     │     text="Hola, ¿cómo estás?",                          │        │
│     │     lang="es",  # Espagnol                              │        │
│     │     conditionals=conditionals,  # Pré-calculés ✅       │        │
│     │     cfg=7.0,     # Classifier-free guidance            │        │
│     │     temperature=0.7,                                     │        │
│     │     top_k=210,                                           │        │
│     │     top_p=0.9                                            │        │
│     │ )                                                         │        │
│     │                                                           │        │
│     │ # 🎯 UNE SEULE ÉTAPE :                                  │        │
│     │ #    • Génère l'audio en Espagnol                       │        │
│     │ #    • Clone la voix source directement                 │        │
│     │ #    • Préserve l'émotion et le style                   │        │
│     └────────────────────────────────────────────────────────┘        │
│                                                                         │
│  📊 Output: audio_cloned_spanish.wav                                   │
│            (Espagnol, voix clonée de haute qualité)                    │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ÉTAPE 3 : POST-TRAITEMENT                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  🎵 Normalisation audio :                                               │
│     • Ajustement du volume                                             │
│     • Suppression du silence                                           │
│     • Conversion format (MP3, WAV, etc.)                               │
│                                                                         │
│  💾 Sauvegarde :                                                        │
│     /workspace/generated/audios/{message_id}_es.mp3                    │
└─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────┐
│ 🎧 OUTPUT    │
├──────────────┤
│ UnifiedTTSResult {                                                     │
│   audio_path: "/workspace/generated/audios/msg456_es.mp3"             │
│   duration: 2.8 seconds                                                │
│   format: "mp3"                                                        │
│   sample_rate: 24000 Hz                                                │
│   language: "es"                                                       │
│   model_used: "chatterbox"                                             │
│   voice_cloning_used: true                                             │
│   backend: "ChatterboxBackend"                                         │
│   conditionals_reused: true  # ✅ Optimisation                         │
│ }                                                                      │
└──────────────┘

⏱️ LATENCE TOTALE ESTIMÉE :
   • Première synthèse (calcul conditionals) : ~2-3 secondes
   • Synthèses suivantes (conditionals réutilisés) : ~1-2 secondes ✅
   • Post-traitement : ~0.5 secondes
   • TOTAL : ~1.5-3.5 secondes (optimisé après première utilisation)

✅ AVANTAGES :
   1. Pipeline direct (1 seule étape)
   2. Clonage vocal natif de haute qualité
   3. Support 23 langues (ar, da, de, el, en, es, fi, fr, he, hi, it, ja, ko, ms, nl, no, pl, pt, ru, sv, sw, tr, zh)
   4. Optimisation avec conditionals réutilisables
   5. Sub-200ms streaming latency possible
   6. Compatible Python 3.11+ ✅
```

---

## 🔍 Comparaison détaillée des architectures

### Flux de données

#### **LINGALA (Hybride)** :
```
Audio source → VoiceAnalyzer → VITS (texte→audio Lingala) → OpenVoice (conversion timbre) → Audio final
                                  └─ ESPnet2 ─┘              └─ ToneColorConverter ─┘

                                  ⚠️ 2 modèles différents
                                  ⚠️ 2 étapes séquentielles
```

#### **ESPAGNOL (Direct)** :
```
Audio source → VoiceAnalyzer → Chatterbox Multilingual (texte→audio + clonage) → Audio final
                                └────────── 1 modèle intégré ──────────┘

                                ✅ 1 seul modèle
                                ✅ 1 étape unifiée
```

### Gestion mémoire

#### **LINGALA** :
- VITS : ~500 MB (modèle ESPnet2)
- OpenVoice : ~200 MB (ToneColorConverter) - **SI DISPONIBLE**
- **Total : ~700 MB** (ou ~500 MB sans OpenVoice)

#### **ESPAGNOL** :
- Chatterbox Multilingual : ~1.2 GB
- **Total : ~1.2 GB**
- ✅ **Partagé entre toutes les 23 langues** (pas de duplication)

### Performance

| Métrique | **Lingala (VITS)** | **Espagnol (Chatterbox)** |
|----------|-------------------|---------------------------|
| **Latence première synthèse** | ~3.5-5.5s | ~2-3s |
| **Latence synthèses suivantes** | ~3.5-5.5s | ~1.5-2s ✅ |
| **Qualité clonage** | ⚠️ Variable (dépend OpenVoice) | ✅ Excellente |
| **Stabilité voix** | ⚠️ Moyenne | ✅ Très stable |
| **Compatibilité Python** | ❌ 3.9-3.10 (OpenVoice) | ✅ 3.11+ |
| **Streaming** | ❌ Non supporté | ✅ Sub-200ms |

---

## 🎯 Recommandations

### Pour le développement actuel (Python 3.11)

#### **Lingala** :
```python
# ⚠️ MODE ACTUEL : Sans clonage vocal (OpenVoice incompatible Python 3.11)
# Pipeline : VITS seul → Voix synthétique par défaut

# Configuration
TTS_MODEL=vits
ENABLE_OPENVOICE=false  # Automatiquement désactivé (Python 3.11)

# Résultat :
# ✅ Synthèse Lingala fonctionnelle
# ❌ Pas de clonage vocal
# → Voix neutre par défaut
```

#### **Espagnol (et 22 autres langues)** :
```python
# ✅ MODE OPTIMAL : Clonage vocal natif

# Configuration
TTS_MODEL=chatterbox
ENABLE_VOICE_CLONING=true

# Résultat :
# ✅ Synthèse multilingue (23 langues)
# ✅ Clonage vocal de haute qualité
# ✅ Performance optimale
# ✅ Compatible Python 3.11+
```

### Pour améliorer le Lingala (solutions futures)

#### **Option 1** : Conteneur Python 3.9 dédié pour OpenVoice
```yaml
# docker-compose.yml
services:
  translator-openvoice:
    image: python:3.9-slim
    # Service séparé pour OpenVoice uniquement
    # Communication via API ou queue avec le service principal
```

#### **Option 2** : Migrer vers Chatterbox avec modèle Lingala custom
```python
# Si Chatterbox peut être fine-tuné pour le Lingala
# → Pipeline unifié pour toutes les langues
# → Meilleure maintenance
```

#### **Option 3** : Utiliser Qwen3-TTS pour le Lingala
```python
# Qwen3-TTS supporte le clonage vocal natif
# Compatible Python 3.11+
# Mais ne supporte que 10 langues (Lingala non inclus par défaut)
# → Nécessiterait fine-tuning
```

---

## 📋 Résumé exécutif

### État actuel

| Langue | Backend | Clonage vocal | Qualité | Statut |
|--------|---------|---------------|---------|--------|
| **Lingala** | VITS (ESPnet2) | ❌ Non (OpenVoice manquant) | ⚠️ Moyenne | Mode dégradé |
| **Espagnol** | Chatterbox | ✅ Oui (natif) | ✅ Excellente | Optimal |
| **22 autres langues** | Chatterbox | ✅ Oui (natif) | ✅ Excellente | Optimal |

### Actions recommandées

1. ✅ **Court terme** : Documenter la limitation Lingala pour les utilisateurs
2. 🔄 **Moyen terme** : Implémenter service OpenVoice séparé (Python 3.9)
3. 🎯 **Long terme** : Migrer vers solution unifiée (Qwen3-TTS ou Chatterbox custom)

