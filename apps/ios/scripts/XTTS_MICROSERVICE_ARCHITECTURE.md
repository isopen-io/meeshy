# XTTS Voice Translation Microservice Architecture

## Overview

Complete architecture for voice cloning and translation microservice using XTTS-v2.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MEESHY VOICE TRANSLATION                             │
│                              MICROSERVICE                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   iOS App   │───▶│   Gateway   │───▶│ Translator  │───▶│    XTTS     │
│   (Client)  │◀───│   Service   │◀───│  Service    │◀───│   Worker    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                             │
                         ┌───────────────────┼───────────────────┐
                         ▼                   ▼                   ▼
                   ┌──────────┐        ┌──────────┐        ┌──────────┐
                   │ Whisper  │        │ DeepL/   │        │  Redis   │
                   │  (STT)   │        │ Google   │        │  Cache   │
                   └──────────┘        └──────────┘        └──────────┘
```

---

## Complete Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VOICE TRANSLATION PIPELINE                            │
└─────────────────────────────────────────────────────────────────────────────┘

  USER SPEAKS              TRANSCRIBE              TRANSLATE
  ┌─────────┐              ┌─────────┐             ┌─────────┐
  │  🎤     │   Audio      │ Whisper │   Text     │ DeepL/  │
  │ Record  │────────────▶ │  STT    │──────────▶ │ Google  │
  │ Voice   │   WAV/MP3    │         │   "Hello"  │Translate│
  └─────────┘              └─────────┘             └─────────┘
       │                                                │
       │ Voice Reference                                │ Translated Text
       │ (Speaker Embedding)                            │ "Bonjour"
       │                                                │
       ▼                                                ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                      XTTS-v2 VOICE CLONING                   │
  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
  │  │  Speaker    │    │    Text     │    │   Audio     │      │
  │  │  Embedding  │ +  │  "Bonjour"  │ =  │  Output     │      │
  │  │  (Your ID)  │    │  (French)   │    │  (Your Voice)│     │
  │  └─────────────┘    └─────────────┘    └─────────────┘      │
  └─────────────────────────────────────────────────────────────┘
                                │
                                ▼
                          ┌─────────┐
                          │  🔊     │
                          │ Cloned  │
                          │ Audio   │
                          └─────────┘
```

---

## Service Architecture

### 1. API Gateway (gateway/)

```
gateway/
├── src/
│   ├── routes/
│   │   └── voice-translation.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── rate-limit.ts
│   │   └── upload.ts
│   └── index.ts
├── Dockerfile
└── package.json
```

### 2. Translator Service (translator/)

```
translator/
├── src/
│   ├── api/
│   │   ├── routes.py
│   │   └── schemas.py
│   ├── services/
│   │   ├── transcription.py      # Whisper STT
│   │   ├── translation.py        # DeepL/Google
│   │   ├── voice_cloning.py      # XTTS-v2
│   │   └── audio_processing.py   # FFmpeg utilities
│   ├── workers/
│   │   └── xtts_worker.py        # GPU worker
│   ├── models/
│   │   └── xtts_model.py         # Model loader
│   └── main.py
├── Dockerfile
├── requirements.txt
└── docker-compose.yml
```

---

## API Endpoints

### POST /api/v1/voice/translate

Translate voice to another language with voice cloning.

**Request:**
```json
{
  "audio": "base64_encoded_audio_data",
  "audio_format": "wav",
  "source_language": "fr",        // optional, auto-detect if not provided
  "target_language": "en",
  "voice_profile_id": "user_123", // optional, for cached voice profiles
  "options": {
    "quality": "high",            // "fast" | "balanced" | "high"
    "preserve_emotion": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "job_abc123",
    "status": "completed",
    "original_text": "Bonjour, comment allez-vous?",
    "translated_text": "Hello, how are you?",
    "source_language": "fr",
    "target_language": "en",
    "audio_url": "https://cdn.meeshy.com/audio/job_abc123.wav",
    "audio_base64": "base64_encoded_audio",
    "duration_seconds": 2.5,
    "voice_similarity": 0.87,
    "processing_time_ms": 3500
  }
}
```

### POST /api/v1/voice/profile

Create/update voice profile for faster cloning.

**Request:**
```json
{
  "user_id": "user_123",
  "reference_audio": "base64_encoded_audio",
  "audio_format": "wav"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "profile_id": "profile_xyz",
    "voice_characteristics": {
      "pitch_hz": 120.5,
      "voice_type": "male_medium",
      "brightness": 1450.2
    },
    "embedding_cached": true
  }
}
```

### GET /api/v1/voice/translate/{job_id}

Get translation job status (for async processing).

---

## Data Models

### VoiceTranslationRequest

```python
from pydantic import BaseModel
from typing import Optional
from enum import Enum

class QualityLevel(str, Enum):
    FAST = "fast"           # ~2s processing
    BALANCED = "balanced"   # ~4s processing
    HIGH = "high"           # ~8s processing

class VoiceTranslationRequest(BaseModel):
    audio: str                              # Base64 encoded
    audio_format: str = "wav"               # wav, mp3, m4a
    source_language: Optional[str] = None   # Auto-detect if None
    target_language: str
    voice_profile_id: Optional[str] = None
    quality: QualityLevel = QualityLevel.BALANCED
    preserve_emotion: bool = True

class VoiceTranslationResponse(BaseModel):
    job_id: str
    status: str
    original_text: str
    translated_text: str
    source_language: str
    target_language: str
    audio_url: Optional[str]
    audio_base64: Optional[str]
    duration_seconds: float
    voice_similarity: float
    processing_time_ms: int
```

---

## Core Services Implementation

### 1. Transcription Service (Whisper)

```python
# translator/src/services/transcription.py

import whisper
import torch
from typing import Optional, Dict

class TranscriptionService:
    def __init__(self, model_size: str = "base"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = whisper.load_model(model_size, device=self.device)

    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None
    ) -> Dict:
        """Transcribe audio to text."""
        options = {}
        if language:
            options["language"] = language

        result = self.model.transcribe(audio_path, **options)

        return {
            "text": result["text"].strip(),
            "language": result.get("language", "en"),
            "segments": result.get("segments", []),
            "confidence": self._calculate_confidence(result)
        }

    def _calculate_confidence(self, result) -> float:
        """Calculate average confidence from segments."""
        segments = result.get("segments", [])
        if not segments:
            return 0.0

        avg_prob = sum(
            s.get("avg_logprob", -1) for s in segments
        ) / len(segments)

        # Convert log probability to confidence (0-1)
        return min(1.0, max(0.0, 1.0 + avg_prob / 2))
```

### 2. Translation Service

```python
# translator/src/services/translation.py

from typing import Optional
import httpx
from deep_translator import GoogleTranslator

class TranslationService:
    def __init__(self, deepl_api_key: Optional[str] = None):
        self.deepl_key = deepl_api_key
        self.google_translator = GoogleTranslator

    async def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        use_deepl: bool = True
    ) -> str:
        """Translate text to target language."""

        if source_lang == target_lang:
            return text

        # Try DeepL first (better quality)
        if use_deepl and self.deepl_key:
            try:
                return await self._translate_deepl(
                    text, source_lang, target_lang
                )
            except Exception:
                pass

        # Fallback to Google Translate
        return self._translate_google(text, source_lang, target_lang)

    async def _translate_deepl(
        self, text: str, source: str, target: str
    ) -> str:
        """Translate using DeepL API."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api-free.deepl.com/v2/translate",
                data={
                    "auth_key": self.deepl_key,
                    "text": text,
                    "source_lang": source.upper(),
                    "target_lang": target.upper()
                }
            )
            result = response.json()
            return result["translations"][0]["text"]

    def _translate_google(
        self, text: str, source: str, target: str
    ) -> str:
        """Translate using Google Translate."""
        translator = self.google_translator(source=source, target=target)
        return translator.translate(text)
```

### 3. XTTS Voice Cloning Service

```python
# translator/src/services/voice_cloning.py

import os
import torch
import numpy as np
import librosa
import soundfile as sf
from typing import Optional, Dict, Tuple
from TTS.api import TTS

# Accept license
os.environ["COQUI_TOS_AGREED"] = "1"

class XTTSVoiceCloningService:
    """XTTS-v2 voice cloning service."""

    SUPPORTED_LANGUAGES = [
        "en", "fr", "es", "de", "it", "pt", "pl", "tr",
        "ru", "nl", "cs", "ar", "zh", "ja", "ko", "hu"
    ]

    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = None
        self._loaded = False

    def load_model(self):
        """Load XTTS-v2 model."""
        if self._loaded:
            return

        print(f"Loading XTTS-v2 on {self.device}...")
        self.model = TTS(
            "tts_models/multilingual/multi-dataset/xtts_v2",
            progress_bar=False
        )

        if self.device == "cuda":
            self.model.to(self.device)

        self._loaded = True
        print("XTTS-v2 loaded!")

    def clone_voice(
        self,
        reference_audio_path: str,
        text: str,
        target_language: str,
        output_path: str
    ) -> Dict:
        """
        Clone voice speaking text in target language.

        Args:
            reference_audio_path: Path to reference voice audio (min 6s recommended)
            text: Text to speak in target language
            target_language: Target language code (en, fr, es, etc.)
            output_path: Path to save cloned audio

        Returns:
            Dict with output info and metrics
        """
        self.load_model()

        if target_language not in self.SUPPORTED_LANGUAGES:
            raise ValueError(f"Language {target_language} not supported")

        # Generate cloned audio
        self.model.tts_to_file(
            text=text,
            speaker_wav=reference_audio_path,
            language=target_language,
            file_path=output_path
        )

        # Analyze output
        output_audio, sr = sf.read(output_path)
        duration = len(output_audio) / sr

        # Calculate voice similarity
        similarity = self._calculate_similarity(
            reference_audio_path, output_path
        )

        return {
            "output_path": output_path,
            "duration_seconds": duration,
            "voice_similarity": similarity,
            "target_language": target_language
        }

    def _calculate_similarity(
        self,
        reference_path: str,
        cloned_path: str
    ) -> float:
        """Calculate voice similarity between reference and cloned."""

        # Load audio
        ref_audio, _ = librosa.load(reference_path, sr=22050)
        clone_audio, _ = librosa.load(cloned_path, sr=22050)

        # Pitch analysis
        ref_f0, _, _ = librosa.pyin(ref_audio, fmin=50, fmax=500)
        clone_f0, _, _ = librosa.pyin(clone_audio, fmin=50, fmax=500)

        ref_f0_valid = ref_f0[~np.isnan(ref_f0)]
        clone_f0_valid = clone_f0[~np.isnan(clone_f0)]

        if len(ref_f0_valid) > 0 and len(clone_f0_valid) > 0:
            ref_pitch = np.mean(ref_f0_valid)
            clone_pitch = np.mean(clone_f0_valid)
            pitch_sim = max(0, 1 - abs(ref_pitch - clone_pitch) / ref_pitch)
        else:
            pitch_sim = 0.5

        # Spectral centroid (timbre)
        ref_cent = np.mean(librosa.feature.spectral_centroid(y=ref_audio))
        clone_cent = np.mean(librosa.feature.spectral_centroid(y=clone_audio))
        timbre_sim = max(0, 1 - abs(ref_cent - clone_cent) / max(ref_cent, 1))

        # Combined similarity
        return (pitch_sim + timbre_sim) / 2

    def extract_voice_profile(
        self,
        audio_path: str
    ) -> Dict:
        """Extract voice profile for caching."""

        audio, sr = librosa.load(audio_path, sr=22050)

        # Pitch
        f0, _, _ = librosa.pyin(audio, fmin=50, fmax=500)
        f0_valid = f0[~np.isnan(f0)]
        pitch_mean = float(np.mean(f0_valid)) if len(f0_valid) > 0 else 0

        # Classify voice type
        if pitch_mean > 200:
            voice_type = "high"  # child/female
        elif pitch_mean > 150:
            voice_type = "medium_high"  # female/tenor
        elif pitch_mean > 100:
            voice_type = "medium"  # male
        else:
            voice_type = "low"  # bass

        # Brightness
        centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)
        brightness = float(np.mean(centroid))

        return {
            "pitch_hz": pitch_mean,
            "voice_type": voice_type,
            "brightness": brightness,
            "duration": len(audio) / sr
        }
```

### 4. Main Pipeline Service

```python
# translator/src/services/voice_translation_pipeline.py

import os
import uuid
import tempfile
import base64
from typing import Optional, Dict
from .transcription import TranscriptionService
from .translation import TranslationService
from .voice_cloning import XTTSVoiceCloningService

class VoiceTranslationPipeline:
    """Complete voice translation pipeline."""

    def __init__(
        self,
        whisper_model: str = "base",
        deepl_api_key: Optional[str] = None
    ):
        self.transcription = TranscriptionService(whisper_model)
        self.translation = TranslationService(deepl_api_key)
        self.voice_cloning = XTTSVoiceCloningService()

    async def translate_voice(
        self,
        audio_data: bytes,
        target_language: str,
        source_language: Optional[str] = None,
        audio_format: str = "wav"
    ) -> Dict:
        """
        Complete pipeline: Audio -> Transcribe -> Translate -> Clone

        Args:
            audio_data: Raw audio bytes
            target_language: Target language code
            source_language: Source language (auto-detect if None)
            audio_format: Input audio format

        Returns:
            Dict with all results and cloned audio
        """
        job_id = str(uuid.uuid4())[:8]

        with tempfile.TemporaryDirectory() as temp_dir:
            # Save input audio
            input_path = os.path.join(temp_dir, f"input.{audio_format}")
            with open(input_path, "wb") as f:
                f.write(audio_data)

            # Step 1: Transcribe
            transcription = self.transcription.transcribe(
                input_path,
                language=source_language
            )

            original_text = transcription["text"]
            detected_language = transcription["language"]

            if not original_text:
                raise ValueError("No speech detected in audio")

            # Step 2: Translate
            translated_text = await self.translation.translate(
                original_text,
                detected_language,
                target_language
            )

            # Step 3: Clone voice
            output_path = os.path.join(temp_dir, f"output_{target_language}.wav")

            clone_result = self.voice_cloning.clone_voice(
                reference_audio_path=input_path,
                text=translated_text,
                target_language=target_language,
                output_path=output_path
            )

            # Read output audio
            with open(output_path, "rb") as f:
                output_audio = f.read()

            return {
                "job_id": job_id,
                "status": "completed",
                "original_text": original_text,
                "translated_text": translated_text,
                "source_language": detected_language,
                "target_language": target_language,
                "audio_base64": base64.b64encode(output_audio).decode(),
                "duration_seconds": clone_result["duration_seconds"],
                "voice_similarity": clone_result["voice_similarity"]
            }
```

---

## Docker Configuration

### Dockerfile

```dockerfile
# translator/Dockerfile

FROM pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Accept XTTS license
ENV COQUI_TOS_AGREED=1

# Pre-download models (optional, for faster startup)
RUN python -c "import whisper; whisper.load_model('base')"
RUN python -c "from TTS.api import TTS; TTS('tts_models/multilingual/multi-dataset/xtts_v2')"

# Copy application
COPY src/ ./src/

# Run
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### requirements.txt

```txt
# translator/requirements.txt

# API
fastapi==0.104.1
uvicorn==0.24.0
python-multipart==0.0.6
httpx==0.25.2
pydantic==2.5.2

# Audio Processing
librosa==0.10.1
soundfile==0.12.1
numpy==1.24.0

# Speech-to-Text
openai-whisper==20231117

# Text-to-Speech with Voice Cloning
TTS==0.22.0

# Translation
deep-translator==1.11.4

# Utilities
redis==5.0.1
python-dotenv==1.0.0
```

### docker-compose.yml

```yaml
# translator/docker-compose.yml

version: '3.8'

services:
  translator:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DEEPL_API_KEY=${DEEPL_API_KEY}
      - REDIS_URL=redis://redis:6379
      - CUDA_VISIBLE_DEVICES=0
    volumes:
      - ./models:/app/models
      - ./cache:/app/cache
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

---

## FastAPI Application

```python
# translator/src/main.py

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import base64
import time

from .services.voice_translation_pipeline import VoiceTranslationPipeline

app = FastAPI(
    title="Meeshy Voice Translation API",
    description="Voice cloning and translation using XTTS-v2",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize pipeline
pipeline = VoiceTranslationPipeline(
    whisper_model="base",
    deepl_api_key=None  # Set from environment
)


class TranslateRequest(BaseModel):
    audio: str  # Base64 encoded
    audio_format: str = "wav"
    source_language: Optional[str] = None
    target_language: str


class TranslateResponse(BaseModel):
    job_id: str
    status: str
    original_text: str
    translated_text: str
    source_language: str
    target_language: str
    audio_base64: str
    duration_seconds: float
    voice_similarity: float
    processing_time_ms: int


@app.post("/api/v1/voice/translate", response_model=TranslateResponse)
async def translate_voice(request: TranslateRequest):
    """Translate voice to another language with voice cloning."""

    start_time = time.time()

    try:
        # Decode audio
        audio_data = base64.b64decode(request.audio)

        # Run pipeline
        result = await pipeline.translate_voice(
            audio_data=audio_data,
            target_language=request.target_language,
            source_language=request.source_language,
            audio_format=request.audio_format
        )

        processing_time = int((time.time() - start_time) * 1000)

        return TranslateResponse(
            **result,
            processing_time_ms=processing_time
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


@app.get("/api/v1/languages")
async def get_supported_languages():
    """Get list of supported languages."""
    return {
        "languages": [
            {"code": "en", "name": "English"},
            {"code": "fr", "name": "French"},
            {"code": "es", "name": "Spanish"},
            {"code": "de", "name": "German"},
            {"code": "it", "name": "Italian"},
            {"code": "pt", "name": "Portuguese"},
            {"code": "pl", "name": "Polish"},
            {"code": "tr", "name": "Turkish"},
            {"code": "ru", "name": "Russian"},
            {"code": "nl", "name": "Dutch"},
            {"code": "cs", "name": "Czech"},
            {"code": "ar", "name": "Arabic"},
            {"code": "zh", "name": "Chinese"},
            {"code": "ja", "name": "Japanese"},
            {"code": "ko", "name": "Korean"},
            {"code": "hu", "name": "Hungarian"}
        ]
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "voice-translation"}
```

---

## iOS Client Integration

```swift
// iOS/Meeshy/Features/VoiceTranslation/Services/VoiceTranslationAPIService.swift

import Foundation

struct VoiceTranslationRequest: Codable {
    let audio: String  // Base64 encoded
    let audioFormat: String
    let sourceLanguage: String?
    let targetLanguage: String

    enum CodingKeys: String, CodingKey {
        case audio
        case audioFormat = "audio_format"
        case sourceLanguage = "source_language"
        case targetLanguage = "target_language"
    }
}

struct VoiceTranslationResponse: Codable {
    let jobId: String
    let status: String
    let originalText: String
    let translatedText: String
    let sourceLanguage: String
    let targetLanguage: String
    let audioBase64: String
    let durationSeconds: Double
    let voiceSimilarity: Double
    let processingTimeMs: Int

    enum CodingKeys: String, CodingKey {
        case jobId = "job_id"
        case status
        case originalText = "original_text"
        case translatedText = "translated_text"
        case sourceLanguage = "source_language"
        case targetLanguage = "target_language"
        case audioBase64 = "audio_base64"
        case durationSeconds = "duration_seconds"
        case voiceSimilarity = "voice_similarity"
        case processingTimeMs = "processing_time_ms"
    }
}

class VoiceTranslationAPIService {
    static let shared = VoiceTranslationAPIService()

    private let baseURL = "https://api.meeshy.com"

    func translateVoice(
        audioData: Data,
        targetLanguage: String,
        sourceLanguage: String? = nil
    ) async throws -> VoiceTranslationResponse {

        let url = URL(string: "\(baseURL)/api/v1/voice/translate")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = VoiceTranslationRequest(
            audio: audioData.base64EncodedString(),
            audioFormat: "wav",
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage
        )

        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw VoiceTranslationError.serverError
        }

        return try JSONDecoder().decode(VoiceTranslationResponse.self, from: data)
    }
}

enum VoiceTranslationError: Error {
    case serverError
    case invalidResponse
    case noSpeechDetected
}
```

---

## Performance Metrics

| Component | CPU Time | GPU Time | Notes |
|-----------|----------|----------|-------|
| Whisper (base) | ~3s | ~0.5s | Per 10s audio |
| Translation | ~0.2s | - | API call |
| XTTS-v2 | ~8s | ~2s | Per 5s output |
| **Total** | **~11s** | **~3s** | End-to-end |

---

## Scaling Considerations

1. **GPU Workers**: Scale XTTS workers horizontally with GPU instances
2. **Model Caching**: Pre-load models at startup, use Redis for voice profiles
3. **Async Processing**: Queue long translations, return job IDs for polling
4. **CDN**: Store generated audio on CDN for repeated playback

---

## Security

1. **Rate Limiting**: Max 10 requests/minute per user
2. **Audio Validation**: Check file size (<50MB), duration (<5min)
3. **Content Moderation**: Optional transcription filtering
4. **Encryption**: TLS for all API calls, encrypted storage

---

*Architecture Version: 1.0*
*XTTS-v2 Model: tts_models/multilingual/multi-dataset/xtts_v2*
