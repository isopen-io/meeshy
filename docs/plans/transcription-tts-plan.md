# Plan d'Implémentation : Transcription & TTS pour Meeshy Translator

## Vue d'ensemble

Ce plan détaille l'intégration des fonctionnalités de **transcription (Speech-to-Text)** et **TTS (Text-to-Speech)** dans le service `translator` existant de Meeshy.

### Architecture Cible

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Frontend (apps/web)                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  AudioRecorderCard.tsx  →  Message Audio  →  API Gateway             │   │
│  │  SimpleAudioPlayer.tsx  ←  Audio TTS      ←  WebSocket Events        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↕ REST/WebSocket/ZMQ
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Gateway (services/gateway)                           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Nouvelles Routes:                                                    │   │
│  │    POST /api/audio/transcribe    → Transcription audio               │   │
│  │    POST /api/audio/tts           → Text-to-Speech                    │   │
│  │    POST /api/messages/:id/transcribe → Transcrire message existant   │   │
│  │    POST /api/messages/:id/tts    → Générer audio pour message        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↕ ZMQ
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Translator (services/translator)                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Services Existants:                                                  │   │
│  │    - TranslationMLService (traduction)                               │   │
│  │    - ZMQTranslationServer                                            │   │
│  │    - TextSegmenter                                                   │   │
│  │                                                                       │   │
│  │  NOUVEAUX Services:                                                   │   │
│  │    - TranscriptionService (Whisper/faster-whisper)                   │   │
│  │    - TTSService (Coqui TTS / XTTS / gTTS)                           │   │
│  │    - VoiceCloneService (OpenVoice - optionnel Phase 2)              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 : Transcription (Speech-to-Text)

### 1.1 Nouveau Service de Transcription

**Fichier**: `services/translator/src/services/transcription_service.py`

```python
# Architecture proposée
class TranscriptionService:
    """
    Service de transcription audio unifié - Singleton
    Utilise faster-whisper pour transcription optimisée CPU/GPU
    """

    def __init__(self):
        self.model = None  # Whisper model
        self.device = "cpu" or "cuda"

    async def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,  # Auto-détection si None
        return_timestamps: bool = False
    ) -> TranscriptionResult:
        """
        Transcrit un fichier audio en texte

        Returns:
            TranscriptionResult:
                - text: str (texte transcrit)
                - language: str (langue détectée)
                - confidence: float (0-1)
                - segments: List[Segment] (si timestamps)
                - duration_ms: int
        """
```

### 1.2 Modèles Pydantic

**Fichier**: `services/translator/src/schemas/transcription_schemas.py`

```python
class TranscriptionRequest(BaseModel):
    """Requête de transcription"""
    audio_url: Optional[str] = None  # URL du fichier audio
    language: Optional[str] = None   # Langue source (auto si None)
    return_timestamps: bool = False  # Retourner segments avec timestamps

class TranscriptionResponse(BaseModel):
    """Réponse de transcription"""
    text: str
    language: str
    confidence: float
    duration_ms: int
    segments: Optional[List[TranscriptionSegment]] = None
    model_used: str
    processing_time_ms: int

class TranscriptionSegment(BaseModel):
    """Segment de transcription avec timestamps"""
    text: str
    start_ms: int
    end_ms: int
    confidence: float
```

### 1.3 Routes API FastAPI

**Fichier**: `services/translator/src/api/transcription_api.py`

```python
# Routes à ajouter
@router.post("/v1/audio/transcriptions")
async def transcribe_audio(
    file: UploadFile = File(...),
    model: str = Form("large-v3"),
    language: str = Form(None),
    return_timestamps: bool = Form(False)
) -> TranscriptionResponse:
    """
    Compatible OpenAI Whisper API format
    POST /v1/audio/transcriptions
    """

@router.post("/transcribe")
async def transcribe_simple(
    request: TranscriptionRequest
) -> TranscriptionResponse:
    """
    Endpoint simplifié pour transcription
    """
```

### 1.4 Intégration ZMQ

**Modification**: `services/translator/src/services/zmq_server.py`

Ajouter un nouveau type de message ZMQ:
- Type: `TRANSCRIBE`
- Payload: `{ audio_url, language, return_timestamps }`
- Response: `TranscriptionResult`

### 1.5 Dépendances Python

**À ajouter dans `requirements.txt`**:
```
faster-whisper==1.0.0        # Whisper optimisé (CPU/GPU)
# OU
openai-whisper==20231117     # Whisper original
pydub==0.25.1                # Manipulation audio
ffmpeg-python==0.2.0         # FFmpeg bindings
```

---

## Phase 2 : Text-to-Speech (TTS)

### 2.1 Nouveau Service TTS

**Fichier**: `services/translator/src/services/tts_service.py`

```python
class TTSService:
    """
    Service TTS unifié - Singleton
    Support pour multiple backends: gTTS, Coqui TTS, XTTS
    """

    def __init__(self):
        self.default_backend = "coqui"  # ou "gtts", "xtts"
        self.models = {}

    async def synthesize(
        self,
        text: str,
        language: str = "en",
        voice: Optional[str] = None,  # Voix spécifique
        speed: float = 1.0,
        backend: Optional[str] = None
    ) -> TTSResult:
        """
        Synthétise du texte en audio

        Returns:
            TTSResult:
                - audio_path: str (chemin fichier généré)
                - audio_url: str (URL accessible)
                - duration_ms: int
                - format: str ("mp3", "wav", "ogg")
        """
```

### 2.2 Modèles Pydantic

**Fichier**: `services/translator/src/schemas/tts_schemas.py`

```python
class TTSRequest(BaseModel):
    """Requête TTS"""
    text: str = Field(..., min_length=1, max_length=5000)
    language: str = Field(default="en")
    voice: Optional[str] = None
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    format: str = Field(default="mp3")  # mp3, wav, ogg

class TTSResponse(BaseModel):
    """Réponse TTS"""
    audio_url: str
    duration_ms: int
    format: str
    language: str
    voice: str
    text_length: int
    processing_time_ms: int
```

### 2.3 Routes API FastAPI

**Fichier**: `services/translator/src/api/tts_api.py`

```python
@router.post("/v1/tts")
async def text_to_speech(
    text: str = Form(...),
    language: str = Form("en"),
    voice: str = Form(None),
    speed: float = Form(1.0),
    format: str = Form("mp3")
) -> StreamingResponse:
    """
    Synthèse vocale - retourne un fichier audio
    """

@router.get("/v1/voices")
async def list_voices(
    language: Optional[str] = None
) -> VoicesResponse:
    """
    Liste les voix disponibles
    """
```

### 2.4 Dépendances Python

**À ajouter dans `requirements.txt`**:
```
TTS==0.22.0                  # Coqui TTS (qualité)
gTTS==2.5.0                  # Google TTS (fallback rapide)
scipy==1.11.4                # Audio processing
```

---

## Phase 3 : Intégration Base de Données

### 3.1 Nouveaux Modèles Prisma

**À ajouter dans `packages/shared/prisma/schema.prisma`**:

```prisma
/// Transcription d'un message audio
model MessageAudioTranscription {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  messageId         String   @db.ObjectId
  attachmentId      String   @db.ObjectId

  /// Texte transcrit
  transcribedText   String

  /// Langue détectée
  language          String

  /// Score de confiance (0-1)
  confidence        Float

  /// Segments avec timestamps (JSON)
  segments          Json?    // [{ text, start_ms, end_ms, confidence }]

  /// Modèle utilisé
  model             String   // "whisper-large-v3", etc.

  /// Durée audio en millisecondes
  audioDurationMs   Int

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  message           Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@unique([messageId, attachmentId])
  @@index([messageId])
  @@map("message_audio_transcriptions")
}

/// Audio généré par TTS pour un message
model MessageTTSAudio {
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  messageId         String   @db.ObjectId

  /// Texte source
  sourceText        String

  /// Langue du texte
  language          String

  /// Voix utilisée
  voice             String

  /// Chemin du fichier audio généré
  audioPath         String

  /// URL accessible
  audioUrl          String

  /// Durée en millisecondes
  durationMs        Int

  /// Format audio
  format            String   // "mp3", "wav", "ogg"

  /// Modèle TTS utilisé
  model             String   // "coqui", "gtts", "xtts"

  createdAt         DateTime @default(now())

  message           Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([messageId])
  @@map("message_tts_audios")
}
```

### 3.2 Mise à jour du Message Model

```prisma
model Message {
  // ... champs existants ...

  // Nouvelles relations
  audioTranscription  MessageAudioTranscription?
  ttsAudios           MessageTTSAudio[]
}
```

---

## Phase 4 : Intégration Gateway

### 4.1 Nouvelles Routes Gateway

**Fichier**: `services/gateway/src/routes/audio-routes.ts`

```typescript
// Routes à implémenter
fastify.post('/api/audio/transcribe', transcribeAudioHandler);
fastify.post('/api/audio/tts', textToSpeechHandler);
fastify.post('/api/messages/:messageId/transcribe', transcribeMessageHandler);
fastify.post('/api/messages/:messageId/tts', generateTTSHandler);
fastify.get('/api/messages/:messageId/transcription', getTranscriptionHandler);
```

### 4.2 Nouveaux Événements Socket.IO

**Fichier**: `services/gateway/src/socketio/MeeshySocketIOManager.ts`

```typescript
// Nouveaux événements à émettre
socket.emit('transcription:progress', { messageId, progress });
socket.emit('transcription:complete', { messageId, transcription });
socket.emit('tts:complete', { messageId, audioUrl });
```

---

## Phase 5 : Structure des Fichiers

### 5.1 Nouveaux Fichiers Translator

```
services/translator/
├── src/
│   ├── api/
│   │   ├── transcription_api.py      # NOUVEAU
│   │   └── tts_api.py                # NOUVEAU
│   ├── services/
│   │   ├── transcription_service.py  # NOUVEAU
│   │   ├── tts_service.py            # NOUVEAU
│   │   └── audio_utils.py            # NOUVEAU (utilitaires audio)
│   ├── schemas/
│   │   ├── transcription_schemas.py  # NOUVEAU
│   │   └── tts_schemas.py            # NOUVEAU
│   └── config/
│       └── audio_settings.py         # NOUVEAU (config audio)
```

### 5.2 Nouveaux Fichiers Gateway

```
services/gateway/src/
├── routes/
│   └── audio-routes.ts               # NOUVEAU
├── handlers/
│   └── audio-handlers.ts             # NOUVEAU
└── schemas/
    └── audio-schemas.ts              # NOUVEAU
```

---

## Phase 6 : Configuration & Environnement

### 6.1 Variables d'Environnement

**À ajouter dans `.env`**:

```bash
# Transcription (Whisper)
WHISPER_MODEL=large-v3          # tiny, base, small, medium, large, large-v3
WHISPER_DEVICE=cpu              # cpu, cuda
WHISPER_COMPUTE_TYPE=float16    # float16, float32, int8

# TTS
TTS_BACKEND=coqui               # coqui, gtts, xtts
TTS_MODEL=tts_models/multilingual/multi-dataset/xtts_v2
TTS_DEVICE=cpu                  # cpu, cuda

# Audio Processing
AUDIO_UPLOAD_DIR=/app/uploads/audio
AUDIO_OUTPUT_DIR=/app/outputs/audio
AUDIO_MAX_SIZE_MB=50
AUDIO_SUPPORTED_FORMATS=mp3,wav,ogg,m4a,webm,flac
```

### 6.2 Configuration Settings

**Fichier**: `services/translator/src/config/audio_settings.py`

```python
class AudioSettings(BaseSettings):
    # Whisper
    whisper_model: str = "large-v3"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "float16"

    # TTS
    tts_backend: str = "coqui"
    tts_model: str = "tts_models/multilingual/multi-dataset/xtts_v2"
    tts_device: str = "cpu"

    # Audio Processing
    audio_upload_dir: Path = Path("/app/uploads/audio")
    audio_output_dir: Path = Path("/app/outputs/audio")
    audio_max_size_mb: int = 50
    audio_supported_formats: List[str] = ["mp3", "wav", "ogg", "m4a", "webm", "flac"]

    class Config:
        env_prefix = ""
```

---

## Checklist d'Implémentation

### Phase 1 - Transcription (Speech-to-Text)
- [ ] Créer `transcription_service.py` avec TranscriptionService
- [ ] Créer `transcription_schemas.py` avec modèles Pydantic
- [ ] Créer `transcription_api.py` avec routes FastAPI
- [ ] Intégrer dans `main.py` (include router)
- [ ] Ajouter dépendances dans `requirements.txt`
- [ ] Créer `audio_settings.py` pour configuration
- [ ] Ajouter support ZMQ pour transcription
- [ ] Écrire tests unitaires

### Phase 2 - Text-to-Speech (TTS)
- [ ] Créer `tts_service.py` avec TTSService
- [ ] Créer `tts_schemas.py` avec modèles Pydantic
- [ ] Créer `tts_api.py` avec routes FastAPI
- [ ] Intégrer dans `main.py` (include router)
- [ ] Ajouter dépendances dans `requirements.txt`
- [ ] Ajouter support ZMQ pour TTS
- [ ] Écrire tests unitaires

### Phase 3 - Base de Données
- [ ] Ajouter modèles `MessageAudioTranscription` et `MessageTTSAudio` dans schema.prisma
- [ ] Mettre à jour relations Message
- [ ] Générer client Prisma (`pnpm db:generate`)
- [ ] Créer migrations

### Phase 4 - Gateway Integration
- [ ] Créer `audio-routes.ts` avec routes REST
- [ ] Créer `audio-handlers.ts` avec logique
- [ ] Ajouter événements Socket.IO
- [ ] Ajouter ZMQ client pour audio
- [ ] Intégrer dans le serveur principal

### Phase 5 - Docker & Déploiement
- [ ] Mettre à jour `Dockerfile.mongodb` pour dépendances audio
- [ ] Ajouter FFmpeg dans l'image Docker
- [ ] Configurer volumes pour stockage audio
- [ ] Tester en environnement Docker

### Phase 6 - Documentation & Tests
- [ ] Documenter nouvelles routes API
- [ ] Écrire tests d'intégration
- [ ] Tester le pipeline complet
- [ ] Documenter variables d'environnement

---

## Estimation de Complexité

| Composant | Complexité | Priorité |
|-----------|------------|----------|
| TranscriptionService | Moyenne | P1 |
| Routes API Transcription | Basse | P1 |
| TTSService | Moyenne | P2 |
| Routes API TTS | Basse | P2 |
| Modèles Prisma | Basse | P1 |
| Gateway Integration | Moyenne | P2 |
| Docker Updates | Basse | P3 |
| Tests | Moyenne | P2 |

---

## Langues Supportées

### Transcription (Whisper)
- Français (fr), Anglais (en), Espagnol (es), Allemand (de)
- Portugais (pt), Chinois (zh), Japonais (ja), Arabe (ar)
- + 90 autres langues (Whisper large-v3)

### TTS (Coqui XTTS)
- Français (fr), Anglais (en), Espagnol (es), Allemand (de)
- Portugais (pt), Italien (it), Polonais (pl), Turc (tr)
- Russe (ru), Néerlandais (nl), Tchèque (cs), Arabe (ar)
- Chinois (zh), Japonais (ja), Hongrois (hu), Coréen (ko)

---

## Notes Techniques

### Performance
- **Whisper large-v3**: ~10s pour 1 minute d'audio sur CPU, ~2s sur GPU
- **Coqui XTTS**: ~5s pour 100 caractères sur CPU, ~1s sur GPU
- Prévoir mise en cache des résultats de transcription

### Formats Audio Supportés
- Entrée: MP3, WAV, OGG, M4A, WebM, FLAC
- Sortie TTS: MP3 (par défaut), WAV, OGG

### Limites
- Taille max upload: 50 MB
- Durée max transcription: 30 minutes
- Longueur max TTS: 5000 caractères par requête
