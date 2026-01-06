# Architecture Technique - Traduction Audio Multi-Destinataires

## Statut d'Implementation

| Composant | Statut | Fichier |
|-----------|--------|---------|
| Backend Whisper Service | Implemente | `/web/translator/src/services/audio_transcription_service.py` |
| Backend XTTS Service | Implemente | `/web/translator/src/services/voice_cloning_service.py` |
| Backend Audio API | Implemente | `/web/translator/src/api/audio_api.py` |
| Backend Integration | Implemente | `/web/translator/src/main.py` |
| iOS AudioTranslationService | Implemente | `/ios/Meeshy/Features/VoiceTranslation/Services/AudioTranslationService.swift` |
| iOS AudioCacheService | Implemente | `/ios/Meeshy/Features/VoiceTranslation/Services/AudioCacheService.swift` |
| iOS VoiceProfileService | Implemente | `/ios/Meeshy/Features/VoiceTranslation/Services/VoiceProfileService.swift` |
| iOS Audio Models | Implemente | `/ios/Meeshy/Core/Models/AudioTranslationModels.swift` |
| iOS API Endpoints | Implemente | `/ios/Meeshy/API/Endpoints/AudioEndpoints.swift` |

---

## Systeme Miroir du Texte pour les Messages Audio

```
+-----------------------------------------------------------------------------------+
|                                                                                    |
|                    FLUX AUDIO VS FLUX TEXTE (COMPARAISON)                         |
|                                                                                    |
|   TEXTE (Existant)                        AUDIO (Nouveau)                         |
|   ================                        ===============                         |
|                                                                                    |
|   User A envoie texte FR                  User A envoie audio FR                  |
|         |                                        |                                 |
|         v                                        v                                 |
|   Stockage message                        1. Transcription (Whisper)              |
|   originalLanguage: "fr"                  2. Stockage transcription               |
|         |                                 3. Update Voice Profile                 |
|         v                                        |                                 |
|   User B (EN) demande                     User B (EN) demande                     |
|   traduction                              traduction                              |
|         |                                        |                                 |
|         v                                        v                                 |
|   Traduire FR -> EN                       4. Traduire texte FR -> EN              |
|   (texte)                                 5. Clone voix User A en EN              |
|         |                                 6. Generer audio EN                     |
|         v                                        |                                 |
|   Retourner texte EN                             v                                 |
|                                           Retourner audio EN                      |
|                                           (voix de User A)                        |
|                                                                                    |
+-----------------------------------------------------------------------------------+
```

---

## 1. Architecture Globale du Systeme

```
+-----------------------------------------------------------------------------------+
|                                                                                    |
|                         AUDIO MESSAGE TRANSLATION FLOW                             |
|                                                                                    |
|   +-------------------------------------------------------------------------------+
|   |                              SENDER (User A)                                   |
|   |                                                                                |
|   |   [Record Audio] --> [Upload Audio] --> [Send Message]                        |
|   |        |                    |                  |                               |
|   |   audio.m4a           attachment_id      message_id                           |
|   |   (original)                                                                   |
|   +-------------------------------------------------------------------------------+
|                                      |
|                                      v
|   +-------------------------------------------------------------------------------+
|   |                           BACKEND PROCESSING                                   |
|   |                       (Translator Microservice)                                |
|   |                                                                                |
|   |   +-----------------------------------------------------------------------+   |
|   |   |                     STEP 1: TRANSCRIPTION                              |   |
|   |   |                     audio_transcription_service.py                     |   |
|   |   |                                                                        |   |
|   |   |   Audio --> [Whisper/faster-whisper] --> Transcription                |   |
|   |   |                              |                                         |   |
|   |   |                              +-- text: "Bonjour, comment ca va?"       |   |
|   |   |                              +-- language: "fr"                        |   |
|   |   |                              +-- confidence: 0.95                      |   |
|   |   |                                                                        |   |
|   |   +-----------------------------------------------------------------------+   |
|   |                                      |
|   |                                      v
|   |   +-----------------------------------------------------------------------+   |
|   |   |                  STEP 2: VOICE PROFILE UPDATE                          |   |
|   |   |                     voice_cloning_service.py                           |   |
|   |   |                                                                        |   |
|   |   |   Audio --> [XTTS Encoder] --> Speaker Embedding (512-dim)            |   |
|   |   |                                      |                                 |   |
|   |   |                                      v                                 |   |
|   |   |   +--------------------------------------------------------------+    |   |
|   |   |   |              VOICE PROFILE REFINEMENT                         |    |   |
|   |   |   |                                                               |    |   |
|   |   |   |   IF first_audio:                                            |    |   |
|   |   |   |       voice_profile = new_embedding                          |    |   |
|   |   |   |   ELSE:                                                      |    |   |
|   |   |   |       voice_profile = 0.85 * existing + 0.15 * new           |    |   |
|   |   |   |                                                               |    |   |
|   |   |   |   Update metrics:                                            |    |   |
|   |   |   |   - total_audio_seconds += duration                          |    |   |
|   |   |   |   - sample_count += 1                                        |    |   |
|   |   |   |   - quality_score = calculate_quality()                      |    |   |
|   |   |   |                                                               |    |   |
|   |   |   +--------------------------------------------------------------+    |   |
|   |   |                                                                        |   |
|   |   +-----------------------------------------------------------------------+   |
|   |                                      |
|   |                                      v
|   |   +-----------------------------------------------------------------------+   |
|   |   |                  STEP 3: TTS WITH VOICE CLONING                        |   |
|   |   |                     voice_cloning_service.py                           |   |
|   |   |                                                                        |   |
|   |   |   1. Check cache: audio:{msg_id}:{target_lang}                        |   |
|   |   |      +-- HIT? Return cached audio URL                                 |   |
|   |   |                                                                        |   |
|   |   |   2. Translate text (via translation_ml_service)                      |   |
|   |   |      "Bonjour..." --> "Hello, how are you?"                           |   |
|   |   |                                                                        |   |
|   |   |   3. Get sender voice profile embedding                               |   |
|   |   |                                                                        |   |
|   |   |   4. Generate cloned audio:                                           |   |
|   |   |      XTTS-v2(                                                         |   |
|   |   |        text: "Hello, how are you?",                                   |   |
|   |   |        speaker_embedding: user_A_profile,                             |   |
|   |   |        language: "en"                                                 |   |
|   |   |      ) --> audio_en.wav                                               |   |
|   |   |                                                                        |   |
|   |   +-----------------------------------------------------------------------+   |
|   |                                                                                |
|   +-------------------------------------------------------------------------------+
|
+-----------------------------------------------------------------------------------+
```

---

## 2. Backend Implementation

### 2.1 Services Crees

#### Audio Transcription Service

Fichier: `audio_transcription_service.py`

- Utilise Whisper (faster-whisper ou standard)
- Auto-detection du device (CUDA, MPS, CPU)
- Cache integre pour eviter re-transcription
- Support des formats: WAV, MP3, M4A, OGG, FLAC

Methodes principales:
- `transcribe(audio_path, language, word_timestamps)` - Transcrit audio en texte
- `detect_language(audio_path)` - Detecte la langue
- `transcribe_bytes(audio_data, filename)` - Transcrit depuis bytes

#### Voice Cloning Service

Fichier: `voice_cloning_service.py`

- Utilise XTTS-v2 pour clonage vocal
- Gestion des profils vocaux (creation, amelioration, stockage)
- Stockage securise des embeddings (JSON + numpy binaire)

Langues supportees: en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh, ja, ko, hu

Methodes principales:
- `register_voice(user_id, audio_path, language)` - Cree/ameliore profil
- `synthesize(text, language, user_id, reference_audio)` - Genere audio
- `get_profile(user_id)` - Recupere profil
- `delete_profile(user_id)` - Supprime profil

Formule d'amelioration: `new = 0.85 * old + 0.15 * new_sample`

### 2.2 API Endpoints

Fichier: `audio_api.py`

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/v1/audio/transcriptions` | POST | Transcription audio (multipart) |
| `/v1/audio/transcriptions/base64` | POST | Transcription audio (base64) |
| `/v1/audio/detect-language` | POST | Detection de langue |
| `/v1/audio/tts` | POST | Synthese vocale avec clonage |
| `/v1/audio/voice-profile` | POST | Creer/ameliorer profil vocal |
| `/v1/audio/voice-profile/{user_id}` | GET | Obtenir profil vocal |
| `/v1/audio/voice-profile/{user_id}` | DELETE | Supprimer profil vocal |
| `/v1/audio/voice-profile/{user_id}/samples` | POST | Ajouter echantillon |
| `/v1/audio/voice-profile/{user_id}/settings` | PUT | Modifier parametres |
| `/v1/audio/translate` | POST | Pipeline complet (transcribe+translate+TTS) |
| `/v1/audio/stats` | GET | Statistiques des services |
| `/v1/audio/languages` | GET | Langues supportees |

### 2.3 Configuration

Variables d'environnement:
- `ENABLE_AUDIO_SERVICES=true` - Activer les services audio
- `WHISPER_MODEL=base` - Modele Whisper (tiny, base, small, medium, large)
- `WHISPER_COMPUTE_TYPE=float16` - Type de calcul
- `XTTS_MODELS_PATH=./models/xtts` - Chemin des modeles XTTS
- `XTTS_USE_DEEPSPEED=false` - Acceleration DeepSpeed

### 2.4 Demarrage

```bash
cd /Users/smpceo/Documents/Services/Meeshy/web/translator

# Installer les dependances audio
pip install faster-whisper TTS soundfile librosa scipy

# Demarrer le serveur
ENABLE_AUDIO_SERVICES=true python src/main.py
```

---

## 3. iOS Implementation

### 3.1 Services iOS

#### AudioTranslationService

```swift
@MainActor
final class AudioTranslationService: ObservableObject {
    static let shared = AudioTranslationService()

    func sendAudioMessage(audioURL: URL, to conversationId: String) async throws -> SendAudioMessageResponse
    func getAudioTranslation(messageId: String, targetLanguage: String) async throws -> AudioTranslation
    func batchTranslate(messageIds: [String], targetLanguage: String) async throws -> [String: AudioTranslation]
    func prefetchTranslations(messageIds: [String], targetLanguage: String) async
}
```

#### VoiceProfileService

```swift
@MainActor
final class VoiceProfileService: ObservableObject {
    static let shared = VoiceProfileService()

    func loadProfile() async throws
    func createProfile(audioURL: URL, language: String) async throws -> VoiceProfile
    func addSample(audioURL: URL, language: String) async throws -> AddVoiceSampleResponse
    func updateSettings(isActive: Bool?, preferredLanguages: [String]?) async throws
    func deleteProfile() async throws

    var profileQualityLevel: ProfileQualityLevel { .none | .basic | .good | .excellent }
    var isVoiceCloningEnabled: Bool
}
```

#### AudioCacheService

```swift
actor AudioCacheService {
    static let shared = AudioCacheService()

    // TTLs
    private let transcriptionTTL: TimeInterval = 7 * 24 * 3600      // 7 jours
    private let translationTTL: TimeInterval = 7 * 24 * 3600        // 7 jours
    private let audioTTL: TimeInterval = 24 * 3600                   // 24 heures
    private let voiceTTL: TimeInterval = 30 * 24 * 3600             // 30 jours

    func cacheTranscription(_ transcription: AudioTranscription, for messageId: String)
    func getCachedTranscription(messageId: String) -> AudioTranscription?
    func cacheAudioTranslation(_ translation: AudioTranslation, messageId: String)
    func getCachedAudioTranslation(messageId: String, targetLanguage: String) -> AudioTranslation?
    func cacheVoiceProfile(_ profile: VoiceProfile)
    func getCachedVoiceProfile(userId: String) -> VoiceProfile?
}
```

### 3.2 Modeles de Donnees

```swift
struct AudioTranscription: Codable, Hashable, Sendable {
    let text: String
    let language: String
    let confidence: Double
    let model: String
    let durationSeconds: Double
    let processingTimeMs: Int
    let wordTimestamps: [WordTimestamp]?
}

struct AudioTranslation: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let messageId: String
    let targetLanguage: String
    let translatedText: String
    let audioUrl: String
    let voiceCloned: Bool
    let voiceProfileVersion: Int?
    let similarityScore: Double?
    let durationSeconds: Double
    let processingTimeMs: Int
    let cached: Bool
}

struct VoiceProfile: Codable, Identifiable, Sendable {
    let id: String
    let userId: String
    var embeddingVersion: Int
    var totalAudioSeconds: Double
    var sampleCount: Int
    var qualityScore: Double
    var isActive: Bool
    var preferredLanguages: [String]
}

enum ProfileQualityLevel: Int, Comparable {
    case none = 0       // Pas de profil
    case basic = 1      // < 30s audio
    case good = 2       // 30-60s audio, score >= 0.7
    case excellent = 3  // > 60s audio, score >= 0.85
}
```

---

## 4. Strategie de Cache

### Couches de Cache

| Couche | Cle | TTL | Benefice |
|--------|-----|-----|----------|
| Transcription | `transcription:{hash(audio)}` | 7 jours | Evite re-transcription Whisper |
| Translation | `translation:{hash(text)}:{src}:{tgt}` | 7 jours | Partage entre utilisateurs |
| Audio Genere | `audio:{msg_id}:{lang}` | 24 heures | Sert plusieurs auditeurs |
| Voice Embedding | `voice:{user_id}` | 30 jours | Evite re-extraction embedding |

### Taux de Hit Attendus

- Transcription: 70-80%
- Translation: 60-70%
- Audio Genere: 40-50%
- Voice Embedding: 90-95%

---

## 5. Algorithme d'Amelioration du Profil Vocal

### Formule

```
new_profile = 0.85 * existing_embedding + 0.15 * new_sample_embedding
```

Le facteur 0.85 favorise la stabilite du profil etabli.

### Niveaux de Qualite

| Niveau | Duree Audio | Score | Qualite Clonage |
|--------|-------------|-------|-----------------|
| None | 0s | 0 | Pas de clonage |
| Basic | < 10s | 0.3-0.5 | Reconnaissable |
| Good | 10-30s | 0.5-0.7 | Bonne similarite |
| Very Good | 30-60s | 0.7-0.85 | Haute similarite |
| Excellent | > 60s | 0.85-0.95 | Quasi-identique |

---

## 6. Flux de Donnees Complet

### Phase 1: Envoi du Message

1. User A enregistre audio en francais
2. iOS upload vers backend
3. Backend transcrit avec Whisper
4. Backend met a jour le profil vocal de User A
5. Message stocke avec transcription

### Phase 2: Reception du Message

1. User B (anglais) demande traduction
2. Backend verifie le cache
3. Si cache miss:
   - Traduit le texte FR -> EN
   - Recupere le profil vocal de User A
   - Genere audio avec XTTS-v2 (voix clonee)
   - Cache le resultat
4. Retourne l'audio traduit avec la voix de User A

---

## 7. Dependances

### Backend (Python)

```txt
faster-whisper>=1.0.0
openai-whisper>=20231117
TTS>=0.22.0
soundfile>=0.12.1
librosa>=0.10.2
scipy>=1.14.0
```

### iOS (Swift)

- AVFoundation
- CryptoKit
- Foundation async/await

---

## 8. Test du Systeme

### Demarrer le Backend

```bash
cd /Users/smpceo/Documents/Services/Meeshy/web/translator
ENABLE_AUDIO_SERVICES=true python src/main.py
```

### Tester les Endpoints

```bash
# Transcription
curl -X POST http://localhost:8000/v1/audio/transcriptions \
  -F "file=@test.wav" \
  -F "language=fr"

# TTS avec clonage
curl -X POST http://localhost:8000/v1/audio/tts \
  -F "text=Hello" \
  -F "language=en" \
  -F "user_id=user_123" \
  --output output.wav

# Creer profil vocal
curl -X POST http://localhost:8000/v1/audio/voice-profile \
  -F "user_id=user_123" \
  -F "audio_file=@sample.wav" \
  -F "language=fr"
```

---

*Document Version: 2.0 - Implementation Complete*
*Last Updated: 2026-01-03*
