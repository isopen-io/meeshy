# Documentation API ZMQ - Service Translator

**Version:** 2.0
**Date:** 2026-01-19
**Architecture:** ZeroMQ PUSH/PULL + PUB/SUB

---

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Types de messages](#types-de-messages)
3. [Structures de données](#structures-de-données)
4. [Format multipart](#format-multipart)
5. [Codes d'erreur](#codes-derreur)
6. [Architecture système](#architecture-système)
7. [Exemples pratiques](#exemples-pratiques)

---

## 🔍 Vue d'ensemble

### Architecture ZMQ

Le service Translator utilise ZeroMQ avec :
- **PULL socket (port 5555)** : Reçoit les commandes du Gateway
- **PUB socket (port 5558)** : Publie les résultats vers le Gateway

### Services de traitement

| Service | Fichier | Types traités |
|---------|---------|---------------|
| **TranslationHandler** | `zmq_translation_handler.py` | `translation`, `ping` |
| **AudioHandler** | `zmq_audio_handler.py` | `audio_process` |
| **TranscriptionHandler** | `zmq_translation_handler.py` | `transcription_only` |
| **VoiceHandler** | `voice_handler.py` | `voice_*`, `voice_profile_*` |

### Encodage

- **JSON** : UTF-8
- **Audio** : wav, mp3, ogg, webm, m4a, flac, aac
- **Embeddings** : Données sérialisées binaires
- **Base64** : Fallback pour données binaires (legacy)
- **Multipart ZMQ** : Optimisé pour données volumineuses (recommandé)

---

## 📨 Types de Messages

### 1. PING (Health Check)

**Direction** : Client → Translator
**Service** : TranslationHandler
**Usage** : Vérifier la disponibilité du service

#### Request
```json
{
  "type": "ping",
  "timestamp": 1705685291.456
}
```

#### Response
```json
{
  "type": "pong",
  "timestamp": 1705685291.457,
  "translator_status": "alive",
  "translator_port_pub": 5558,
  "translator_port_pull": 5555,
  "audio_pipeline_available": true
}
```

---

### 2. TRANSLATION (Traduction Texte)

**Direction** : Client → Translator
**Service** : TranslationHandler
**Usage** : Traduire du texte dans une ou plusieurs langues

#### Request
```json
{
  "type": "translation",
  "messageId": "msg_123456",
  "conversationId": "conv_789",
  "text": "Bonjour le monde",
  "sourceLanguage": "fr",
  "targetLanguages": ["en", "es", "de"],
  "modelType": "basic"
}
```

**Champs** :
- `type` (string, optionnel) : "translation" (défaut si vide)
- `messageId` (string, **requis**) : ID unique du message
- `conversationId` (string, **requis**) : ID de la conversation
- `text` (string, **requis**) : Texte à traduire
- `sourceLanguage` (string, **requis**) : Code langue source (ISO 639-1)
- `targetLanguages` (array[string], **requis**) : Liste des langues cibles
- `modelType` (string) : "basic" ou "premium" (défaut: "basic")

#### Response Success (une par langue)
```json
{
  "type": "translation_completed",
  "taskId": "task_uuid_12345",
  "result": {
    "messageId": "msg_123456",
    "translatedText": "Hello world",
    "sourceLanguage": "fr",
    "targetLanguage": "en",
    "confidenceScore": 0.98,
    "processingTime": 45.2,
    "modelType": "basic",
    "workerName": "worker_2",
    "translatorModel": "opus-mt-fr-en",
    "workerId": "w_001",
    "poolType": "normal",
    "translationTime": 42.1,
    "queueTime": 3.1,
    "memoryUsage": 256.4,
    "cpuUsage": 15.2
  },
  "targetLanguage": "en",
  "timestamp": 1705685291.501,
  "metadata": {
    "translatorVersion": "2.0.0",
    "modelVersion": "1.0",
    "processingNode": "translator-node-01",
    "sessionId": "session_789",
    "requestId": "req_456",
    "protocol": "ZMQ_PUB_SUB",
    "encoding": "UTF-8"
  }
}
```

#### Response Error
```json
{
  "type": "translation_error",
  "taskId": "task_uuid_12345",
  "messageId": "msg_123456",
  "error": "Translation model not available",
  "conversationId": "conv_789"
}
```

#### Response Skipped (Message trop long)
```json
{
  "type": "translation_skipped",
  "messageId": "msg_123456",
  "reason": "message_too_long",
  "length": 15000,
  "max_length": 10000,
  "conversationId": "conv_789"
}
```

---

### 3. AUDIO_PROCESS (Traitement Audio Complet)

**Direction** : Client → Translator
**Service** : AudioHandler
**Usage** : Transcription + Traduction + Clonage Vocal + TTS

#### Request
```json
{
  "type": "audio_process",
  "messageId": "msg_audio_001",
  "attachmentId": "att_12345",
  "conversationId": "conv_789",
  "senderId": "user_456",

  "audioUrl": "https://cdn.example.com/audio.mp3",
  "audioPath": "/tmp/audio_12345.mp3",
  "audioDurationMs": 5200,
  "audioMimeType": "audio/mp3",

  "mobileTranscription": {
    "text": "Bonjour, comment allez-vous ?",
    "language": "fr",
    "confidence": 0.95,
    "source": "mobile",
    "segments": [
      {
        "text": "Bonjour",
        "startMs": 0,
        "endMs": 800,
        "confidence": 0.98
      }
    ]
  },

  "targetLanguages": ["en", "es"],
  "generateVoiceClone": true,
  "modelType": "medium",

  "existingVoiceProfile": {
    "profileId": "vp_user456_v3",
    "userId": "user_456",
    "qualityScore": 0.92,
    "embedding": "base64_encoded_data..."
  },

  "cloningParams": {
    "exaggeration": 0.5,
    "cfgWeight": 0.7,
    "temperature": 1.0,
    "repetitionPenalty": 1.2,
    "minP": 0.1,
    "topP": 0.9,
    "autoOptimize": true
  },

  "binaryFrames": {
    "audio": 1
  }
}
```

**Champs** :
- `type` (string, **requis**) : "audio_process"
- `messageId` (string, **requis**) : ID unique du message
- `attachmentId` (string, **requis**) : ID de l'attachement audio
- `conversationId` (string, **requis**) : ID de la conversation
- `senderId` (string, **requis**) : ID de l'expéditeur
- **Source audio** (une méthode requise) :
  - `audioUrl` (string) : URL de l'audio
  - `audioPath` (string) : Chemin local
  - `audioBase64` (string) : Audio encodé en base64 (legacy)
  - `binaryFrames.audio` (int) : Index du frame binaire (multipart, recommandé)
- `audioDurationMs` (int) : Durée de l'audio en millisecondes
- `audioMimeType` (string) : Type MIME de l'audio
- `mobileTranscription` (object, optionnel) : Transcription depuis le mobile
- `targetLanguages` (array[string]) : Langues de traduction
- `generateVoiceClone` (bool) : Activer le clonage vocal
- `modelType` (string) : Modèle Whisper ("tiny", "base", "small", "medium", "large")
- `existingVoiceProfile` (object, optionnel) : Profil vocal existant
- `cloningParams` (object, optionnel) : Paramètres de clonage vocal
- `useOriginalVoice` (bool, optionnel) : Pour messages transférés
- `originalSenderId` (string, optionnel) : ID expéditeur original

#### Response Success (Multipart)

**Frame 0 - Metadata JSON** :
```json
{
  "type": "audio_process_completed",
  "taskId": "task_audio_001",
  "messageId": "msg_audio_001",
  "attachmentId": "att_12345",

  "transcription": {
    "text": "Bonjour, comment allez-vous ?",
    "language": "fr",
    "confidence": 0.96,
    "source": "whisper_boost",
    "segments": [
      {
        "text": "Bonjour",
        "startMs": 0,
        "endMs": 800,
        "confidence": 0.98
      },
      {
        "text": "comment allez-vous",
        "startMs": 850,
        "endMs": 2100,
        "confidence": 0.94
      }
    ]
  },

  "translatedAudios": [
    {
      "targetLanguage": "en",
      "translatedText": "Hello, how are you?",
      "audioPath": "/tmp/translated_en_12345.mp3",
      "durationMs": 2800,
      "voiceCloned": true,
      "voiceQuality": 0.89,
      "audioMimeType": "audio/mp3"
    },
    {
      "targetLanguage": "es",
      "translatedText": "Hola, ¿cómo estás?",
      "audioPath": "/tmp/translated_es_12345.mp3",
      "durationMs": 3100,
      "voiceCloned": true,
      "voiceQuality": 0.87,
      "audioMimeType": "audio/mp3"
    }
  ],

  "voiceModelUserId": "user_456",
  "voiceModelQuality": 0.92,

  "newVoiceProfile": {
    "userId": "user_456",
    "profileId": "vp_user456_v4",
    "qualityScore": 0.93,
    "audioCount": 12,
    "totalDurationMs": 58400,
    "version": 4,
    "fingerprint": "vfp_sha256_abc123...",
    "voiceCharacteristics": {
      "pitch": 220.5,
      "energy": 0.68,
      "spectral_centroid": 1850.2
    }
  },

  "processingTimeMs": 3245,
  "timestamp": 1705685295.501,

  "binaryFrames": {
    "audio_en": {
      "index": 1,
      "size": 45120,
      "mimeType": "audio/mp3"
    },
    "audio_es": {
      "index": 2,
      "size": 48960,
      "mimeType": "audio/mp3"
    },
    "embedding": {
      "index": 3,
      "size": 2048
    }
  }
}
```

**Frame 1** : Audio traduit EN (bytes bruts MP3)
**Frame 2** : Audio traduit ES (bytes bruts MP3)
**Frame 3** : Embedding vocal (bytes bruts sérialisés)

#### Response Error
```json
{
  "type": "audio_process_error",
  "taskId": "task_audio_001",
  "messageId": "msg_audio_001",
  "attachmentId": "att_12345",
  "error": "Audio transcription failed",
  "errorCode": "pipeline_unavailable",
  "timestamp": 1705685295.501
}
```

---

### 4. TRANSCRIPTION_ONLY (Transcription Sans Traduction)

**Direction** : Client → Translator
**Service** : TranscriptionHandler
**Usage** : Obtenir uniquement la transcription d'un audio

#### Request (3 modes supportés)

**Mode 1 - Chemin fichier** :
```json
{
  "type": "transcription_only",
  "taskId": "task_transcribe_001",
  "messageId": "msg_001",
  "attachmentId": "att_001",
  "audioPath": "/tmp/audio.mp3",
  "audioUrl": "https://cdn.example.com/audio.mp3",
  "mobileTranscription": {
    "text": "Existing transcription",
    "language": "fr",
    "confidence": 0.90
  }
}
```

**Mode 2 - Base64 (legacy)** :
```json
{
  "type": "transcription_only",
  "taskId": "task_transcribe_002",
  "messageId": "msg_002",
  "audioData": "base64_encoded_audio_data...",
  "audioFormat": "mp3"
}
```

**Mode 3 - Multipart binaire (RECOMMANDÉ)** :
```json
{
  "type": "transcription_only",
  "taskId": "task_transcribe_003",
  "messageId": "msg_003",
  "audioFormat": "mp3",
  "binaryFrames": {
    "audio": 1
  }
}
```

**Champs** :
- `type` (string, **requis**) : "transcription_only"
- `taskId` (string, **requis**) : ID unique de la tâche
- `messageId` (string, **requis**) : ID du message
- `attachmentId` (string, optionnel) : ID de l'attachement
- **Source audio** (une méthode requise) :
  - `audioPath` + `audioUrl`
  - `audioData` + `audioFormat`
  - `binaryFrames.audio`
- `mobileTranscription` (object, optionnel) : Transcription mobile existante

#### Response Success
```json
{
  "type": "transcription_completed",
  "taskId": "task_transcribe_001",
  "messageId": "msg_001",
  "attachmentId": "att_001",

  "transcription": {
    "text": "Bonjour tout le monde",
    "language": "fr",
    "confidence": 0.97,
    "durationMs": 2400,
    "source": "whisper_boost",
    "model": "medium",
    "segments": [
      {
        "text": "Bonjour",
        "startMs": 0,
        "endMs": 600,
        "confidence": 0.99
      },
      {
        "text": "tout le monde",
        "startMs": 650,
        "endMs": 2400,
        "confidence": 0.95
      }
    ]
  },

  "processingTimeMs": 845,
  "timestamp": 1705685296.123
}
```

#### Response Error
```json
{
  "type": "transcription_error",
  "taskId": "task_transcribe_001",
  "messageId": "msg_001",
  "attachmentId": "att_001",
  "error": "Failed to load audio file",
  "errorCode": "transcription_failed",
  "timestamp": 1705685296.123
}
```

---

### 5. VOICE_API (API Vocale Complète)

**Direction** : Client → Translator
**Service** : VoiceHandler + VoiceAPIHandler
**Usage** : Traductions vocales, gestion jobs asynchrones, statistiques

#### Types supportés
```
voice_translate           # Traduction vocale synchrone
voice_translate_async     # Traduction vocale asynchrone
voice_analyze             # Analyse vocale
voice_compare             # Comparaison de voix
voice_profile_get         # Récupérer profil vocal
voice_profile_create      # Créer profil
voice_profile_update      # Mettre à jour profil
voice_profile_delete      # Supprimer profil
voice_profile_list        # Lister profils utilisateur
voice_job_status          # Statut d'un job async
voice_job_cancel          # Annuler un job
voice_feedback            # Envoyer feedback
voice_history             # Historique traductions
voice_stats               # Statistiques utilisateur
voice_admin_metrics       # Métriques admin
voice_health              # Health check
voice_languages           # Langues supportées
```

#### Request Example (voice_translate)
```json
{
  "type": "voice_translate",
  "taskId": "task_voice_001",
  "userId": "user_123",
  "audioData": "base64_encoded_audio...",
  "audioFormat": "mp3",
  "sourceLanguage": "fr",
  "targetLanguages": ["en", "es"],
  "voiceProfile": {
    "profileId": "vp_user123_v2",
    "embedding": "base64_data..."
  },
  "options": {
    "preserveProsody": true,
    "useVoiceCloning": true,
    "quality": "balanced"
  }
}
```

#### Response
```json
{
  "type": "voice_translate_response",
  "taskId": "task_voice_001",
  "status": "success",
  "processingTimeMs": 2145,
  "result": {
    "translations": [
      {
        "targetLanguage": "en",
        "translatedText": "Hello, how are you?",
        "audioData": "base64_or_frame_ref",
        "audioFormat": "mp3",
        "duration": 2500
      },
      {
        "targetLanguage": "es",
        "translatedText": "Hola, ¿cómo estás?",
        "audioData": "base64_or_frame_ref",
        "audioFormat": "mp3",
        "duration": 2800
      }
    ]
  },
  "metadata": {
    "model": "openvoice_v2",
    "voiceQuality": 0.91
  }
}
```

---

### 6. VOICE_PROFILE (Gestion Profils Vocaux)

**Direction** : Client → Translator
**Service** : VoiceHandler + VoiceProfileHandler
**Usage** : Créer, analyser, vérifier, comparer des profils vocaux

#### 6.1 VOICE_PROFILE_ANALYZE (Créer/Mettre à jour)

**Request** :
```json
{
  "type": "voice_profile_analyze",
  "request_id": "req_vpa_001",
  "user_id": "user_123",
  "audio_data": "base64_encoded_audio...",
  "audio_format": "wav",
  "is_update": false,
  "preview_languages": ["en", "fr", "es", "de", "pt"]
}
```

**Champs** :
- `type` (string, **requis**) : "voice_profile_analyze"
- `request_id` (string, **requis**) : UUID unique
- `user_id` (string, **requis**) : ID utilisateur
- `audio_data` (string, **requis**) : Audio base64
- `audio_format` (string, **requis**) : Format audio
- `is_update` (bool) : true si mise à jour d'un profil existant
- `existing_fingerprint` (object, optionnel) : Si is_update=true
- `preview_languages` (array[string], optionnel) : Langues pour previews

**Response** :
```json
{
  "type": "voice_profile_analyze_result",
  "success": true,
  "user_id": "user_123",
  "request_id": "req_vpa_001",

  "profile_id": "vp_user123_v1",
  "quality_score": 0.89,
  "audio_duration_ms": 4200,

  "voice_characteristics": {
    "pitch": 185.5,
    "energy": 0.72,
    "spectral_centroid": 1920.3,
    "spectral_rolloff": 3840.6,
    "zero_crossing_rate": 0.15
  },

  "fingerprint": {
    "id": "vfp_abc123",
    "vector": [0.123, -0.456, 0.789],
    "hash": "sha256:abc123..."
  },
  "fingerprint_id": "vfp_abc123",
  "signature_short": "VP:abc123:8900",

  "embedding_data": "base64_encoded_embedding...",
  "embedding_dimension": 256,

  "voice_previews": [
    {
      "language": "en",
      "original_text": "Hello, this is a voice preview",
      "translated_text": "Hello, this is a voice preview",
      "audio_base64": "base64_preview_audio...",
      "audio_format": "mp3",
      "duration_ms": 3500,
      "generated_at": "2026-01-19T14:30:00Z"
    }
  ]
}
```

**Champs Response** :
- `profile_id` (string) : ID du profil vocal (format: vp_userid_vN)
- `quality_score` (float) : Score qualité 0.0-1.0
- `voice_characteristics` (object) : Caractéristiques vocales extraites
- `fingerprint` (object) : Empreinte vocale unique
- `embedding_data` (string) : Embedding base64 pour stockage Gateway
- `embedding_dimension` (int) : Dimension du vecteur (256)
- `voice_previews` (array) : Previews audio dans différentes langues

#### 6.2 VOICE_PROFILE_VERIFY (Vérifier Authenticité)

**Request** :
```json
{
  "type": "voice_profile_verify",
  "request_id": "req_vpv_001",
  "user_id": "user_123",
  "audio_data": "base64_audio_to_verify...",
  "audio_format": "mp3",
  "existing_fingerprint": {
    "id": "vfp_abc123",
    "vector": [0.123, -0.456],
    "hash": "sha256:abc123..."
  }
}
```

**Response** :
```json
{
  "type": "voice_profile_verify_result",
  "success": true,
  "user_id": "user_123",
  "request_id": "req_vpv_001",
  "is_match": true,
  "similarity_score": 0.92,
  "threshold": 0.80,
  "error": null
}
```

**Champs Response** :
- `is_match` (bool) : true si similarity_score >= threshold (0.80)
- `similarity_score` (float) : Score de similarité 0.0-1.0
- `threshold` (float) : Seuil utilisé (UPDATE_SIMILARITY_THRESHOLD = 0.80)

#### 6.3 VOICE_PROFILE_COMPARE (Comparer Deux Voix)

**Request** :
```json
{
  "type": "voice_profile_compare",
  "request_id": "req_vpc_001",
  "user_id": "user_123",
  "audio_data_1": "base64_first_audio...",
  "audio_format_1": "wav",
  "audio_data_2": "base64_second_audio...",
  "audio_format_2": "mp3"
}
```

**Response** :
```json
{
  "type": "voice_profile_compare_result",
  "success": true,
  "user_id": "user_123",
  "request_id": "req_vpc_001",
  "similarity_score": 0.87,
  "match": true,
  "error": null
}
```

---

### 7. VOICE_TRANSLATION_COMPLETED (Callback Asynchrone)

**Direction** : Translator → Client
**Service** : VoiceHandler (callback depuis TranslationPipeline)
**Usage** : Notification de fin de traitement asynchrone

#### Response Success
```json
{
  "type": "voice_translation_completed",
  "jobId": "job_async_123",
  "status": "completed",
  "userId": "user_456",
  "result": {
    "translations": [],
    "transcription": {},
    "voiceProfile": {}
  },
  "timestamp": 1705685298.456
}
```

#### Response Error
```json
{
  "type": "voice_translation_failed",
  "jobId": "job_async_123",
  "status": "failed",
  "userId": "user_456",
  "error": "Translation pipeline timeout",
  "errorCode": "TIMEOUT",
  "timestamp": 1705685298.456
}
```

---

## 📦 Format Multipart ZMQ

### Avantages
- **33% économie bande passante** (pas de base64)
- **Pas de décodage CPU**
- **Support fichiers volumineux**

### Structure

```
┌────────────────────────────────────────┐
│ Frame 0: JSON Metadata (UTF-8)         │
├────────────────────────────────────────┤
│ {                                      │
│   "type": "audio_process",             │
│   "binaryFrames": {                    │
│     "audio": 1,                        │
│     "embedding": 2                     │
│   },                                   │
│   ...autres champs                     │
│ }                                      │
├────────────────────────────────────────┤
│ Frame 1: Audio binaire (bytes bruts)   │
├────────────────────────────────────────┤
│ Frame 2: Embedding binaire             │
└────────────────────────────────────────┘
```

### Injection automatique

Le serveur ZMQ injecte automatiquement les données binaires :

```python
# Si binaryFrames.audio = 1
request_data['_audioBinary'] = frames[1]

# Si binaryFrames.embedding = 2
request_data['_embeddingBinary'] = frames[2]
```

### Exemple Code Python

**Envoi** :
```python
import zmq
import json

context = zmq.Context()
socket = context.socket(zmq.PUSH)
socket.connect("tcp://localhost:5555")

# Préparer metadata
metadata = {
    "type": "transcription_only",
    "messageId": "msg_001",
    "audioFormat": "mp3",
    "binaryFrames": {"audio": 1}
}

# Lire audio
with open("audio.mp3", "rb") as f:
    audio_bytes = f.read()

# Envoyer multipart
socket.send_multipart([
    json.dumps(metadata).encode('utf-8'),  # Frame 0
    audio_bytes                             # Frame 1
])
```

**Réception** :
```python
context = zmq.Context()
socket = context.socket(zmq.SUB)
socket.connect("tcp://localhost:5558")
socket.setsockopt_string(zmq.SUBSCRIBE, "")

while True:
    frames = socket.recv_multipart()

    # Frame 0: metadata JSON
    metadata = json.loads(frames[0].decode('utf-8'))

    # Frames suivants: données binaires
    if 'binaryFrames' in metadata:
        for key, info in metadata['binaryFrames'].items():
            frame_idx = info['index']
            binary_data = frames[frame_idx]
            # Traiter binary_data...
```

---

## ⚠️ Codes d'Erreur

| Code | Type Message | Signification |
|------|--------------|---------------|
| `pipeline_unavailable` | audio_process_error | Pipeline audio non initialisé |
| `processing_failed` | audio_process_error | Erreur traitement général |
| `transcription_failed` | transcription_error | Échec transcription Whisper |
| `translation_error` | translation_error | Échec traduction texte |
| `message_too_long` | translation_skipped | Message dépasse limite (10000 chars) |
| `INTERNAL_ERROR` | *_error | Erreur interne serveur |
| `TIMEOUT` | voice_translation_failed | Timeout traitement asynchrone |
| `INVALID_REQUEST` | *_error | Requête mal formée |
| `MISSING_AUDIO` | audio_process_error | Source audio manquante |
| `VOICE_PROFILE_NOT_FOUND` | voice_profile_error | Profil vocal inexistant |

---

## 🏗️ Architecture Système

```
┌─────────────────────────────────────────────────────────────┐
│                         Gateway                              │
│                      (Node.js/Fastify)                       │
└────┬─────────────────────────────────────────────────┬──────┘
     │ PUSH (5555)                        SUB (5558)   │
     │                                                  │
     ▼                                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   ZMQTranslationServer                       │
│                  (Python asyncio + ZMQ)                      │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   _handle_translation_request_multipart()             │  │
│  │   (Request Router avec support multipart)             │  │
│  └───────┬────────┬─────────┬────────────┬───────────────┘  │
│          │        │         │            │                   │
│  ┌───────▼────┐ ┌▼──────┐ ┌▼────────┐  ┌▼──────────────┐   │
│  │Translation │ │ Audio  │ │Transcr. │  │ Voice         │   │
│  │Handler     │ │Handler │ │Handler  │  │Handler        │   │
│  │            │ │        │ │         │  │  ├─VoiceAPI   │   │
│  │• ping      │ │• audio_│ │• transc.│  │  └─VoiceProf. │   │
│  │• translat. │ │  process│ │  _only  │  │               │   │
│  └────────────┘ └────────┘ └─────────┘  └───────────────┘   │
│                                                               │
│  PUB Socket (5558) ───────────────────────────────────────►  │
└───────────────────────────────────────────────────────────────┘
```

### Flux de traitement

1. **Gateway** envoie requête → **PUSH 5555**
2. **ZMQTranslationServer.PULL** reçoit
3. **Router** parse multipart + route vers handler
4. **Handler** traite (transcription, traduction, TTS, etc.)
5. **Handler** publie résultat → **PUB 5558**
6. **Gateway.SUB** reçoit et route vers client WebSocket

---

## 💡 Exemples Pratiques

### Exemple 1 : Traduction Texte Simple

**Request** :
```json
{
  "type": "translation",
  "messageId": "msg_001",
  "conversationId": "conv_123",
  "text": "Comment vas-tu ?",
  "sourceLanguage": "fr",
  "targetLanguages": ["en", "es"]
}
```

**Response (EN)** :
```json
{
  "type": "translation_completed",
  "taskId": "task_uuid_001",
  "result": {
    "messageId": "msg_001",
    "translatedText": "How are you?",
    "sourceLanguage": "fr",
    "targetLanguage": "en",
    "confidenceScore": 0.97,
    "processingTime": 38.5
  },
  "targetLanguage": "en",
  "timestamp": 1705685291.501
}
```

---

### Exemple 2 : Audio Process avec Clonage Vocal

**Request (Multipart)** :
```
Frame 0 (JSON):
{
  "type": "audio_process",
  "messageId": "msg_audio_123",
  "attachmentId": "att_456",
  "conversationId": "conv_789",
  "senderId": "user_101",
  "audioDurationMs": 3500,
  "audioMimeType": "audio/mp3",
  "targetLanguages": ["en"],
  "generateVoiceClone": true,
  "binaryFrames": {"audio": 1}
}

Frame 1 (Binary):
<Audio MP3 bytes...>
```

**Response (Multipart)** :
```
Frame 0 (JSON):
{
  "type": "audio_process_completed",
  "taskId": "task_audio_001",
  "messageId": "msg_audio_123",
  "transcription": {
    "text": "Bonjour, voici mon message vocal",
    "language": "fr",
    "confidence": 0.96
  },
  "translatedAudios": [
    {
      "targetLanguage": "en",
      "translatedText": "Hello, here is my voice message",
      "durationMs": 3200,
      "voiceCloned": true,
      "voiceQuality": 0.88
    }
  ],
  "newVoiceProfile": {
    "profileId": "vp_user101_v1",
    "qualityScore": 0.88
  },
  "binaryFrames": {
    "audio_en": {"index": 1, "size": 51200},
    "embedding": {"index": 2, "size": 2048}
  }
}

Frame 1 (Binary):
<Audio traduit EN en MP3 bytes...>

Frame 2 (Binary):
<Embedding vocal bytes...>
```

---

## 📊 Performances Typiques

| Opération | Latence Moyenne | Notes |
|-----------|-----------------|-------|
| **ping** | < 5ms | Health check |
| **translation** (texte) | 45-150ms | Par langue cible |
| **transcription_only** | 500-2000ms | Dépend durée audio (ratio ~0.2x) |
| **audio_process** complet | 2-8s | Transcription + N traductions + TTS |
| **voice_profile_analyze** | 1-3s | Avec 5 previews langues |
| **voice_profile_verify** | 200-800ms | Comparaison embeddings |

### Configuration Performance

- **Workers translation** : 3 (pool normal) + 2 (pool any)
- **Queue sizes** : 10000 (normal) + 10000 (any)
- **Timeout inactivité** : Configurable (défaut: aucun)
- **Max message size** : Illimité (ZMQ), mais translation texte limitée à 10000 chars

---

## 🔒 Sécurité et Bonnes Pratiques

### Validation Input
- Toujours valider `messageId`, `userId`, `taskId`
- Limiter taille audio (recommandé: < 10MB)
- Vérifier formats audio supportés
- Sanitizer chemins fichiers (pas de path traversal)

### Gestion Erreurs
- Toujours inclure `error` et `errorCode` dans responses erreur
- Logger tous les échecs avec context complet
- Implémenter retry logic côté client pour erreurs transitoires

### Performance
- **Préférer multipart binaire** au lieu de base64 (33% économie)
- Réutiliser profils vocaux existants
- Batch translations multiples langues dans une seule requête
- Utiliser `mobileTranscription` quand disponible pour éviter re-transcription

### Monitoring
- Tracer latences par type de message
- Monitorer queue depths (PULL socket)
- Alerter sur taux erreurs > 5%
- Dashboard CPU/RAM workers

---

## 📚 Références

- **ZeroMQ Guide** : https://zguide.zeromq.org/
- **Code Source** :
  - `zmq_server_core.py` : Serveur principal
  - `zmq_audio_handler.py` : Handler audio
  - `zmq_translation_handler.py` : Handler traduction/transcription
  - `voice_handler.py` : Handler voice API
  - `voice_profile_handler.py` : Handler profils vocaux

---

**Dernière mise à jour** : 2026-01-19
**Version API** : 2.0
