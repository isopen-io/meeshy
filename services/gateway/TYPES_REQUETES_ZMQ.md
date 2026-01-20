# Types de requêtes ZMQ - Gateway ↔ Translator

## Vue d'ensemble

Le système utilise ZeroMQ avec architecture PUSH/PULL (commandes) et PUB/SUB (résultats).

- **Gateway PUSH → Translator PULL** (port 5555) : envoi des commandes
- **Translator PUB → Gateway SUB** (port 5558) : réception des résultats

---

## 📤 Requêtes Gateway → Translator (PUSH)

### 1. `translation` - Traduction texte
**Fichier source** : `ZmqRequestSender.ts:58-98`

```typescript
{
  type: 'translation',
  taskId: string,
  messageId: string,
  text: string,
  sourceLanguage: string,
  targetLanguages: string[],
  conversationId: string,
  modelType: 'basic' | 'medium' | 'premium',
  timestamp: number
}
```

**Routage Translator** : `ZMQTranslationServer` → `TranslationHandler._handle_translation_request_multipart()`

**Résultats attendus** :
- `translation_completed` (par langue cible)
- `translation_error` (en cas d'échec)

---

### 2. `audio_process` - Traitement audio complet
**Fichier source** : `ZmqRequestSender.ts:108-179`

```typescript
{
  type: 'audio_process',
  messageId: string,
  attachmentId: string,
  conversationId: string,
  senderId: string,
  audioUrl: string,  // Vide si binaire
  audioMimeType: string,
  binaryFrames: {
    audio: 1,  // Index du frame binaire
    audioMimeType: string,
    audioSize: number
  },
  audioDurationMs: number,
  mobileTranscription?: {
    text: string,
    language: string,
    confidence: number,
    source: string
  },
  targetLanguages: string[],
  generateVoiceClone: boolean,
  modelType: string,

  // Voice profile (messages transférés)
  originalSenderId?: string,
  existingVoiceProfile?: object,
  useOriginalVoice?: boolean,
  voiceCloneParams?: object
}
```

**Format multipart** :
- Frame 0 : JSON ci-dessus
- Frame 1 : Audio binaire (Buffer)

**Routage Translator** :
1. `ZMQTranslationServer._handle_translation_request_multipart()`
2. `_inject_binary_frames()` : extrait audio binaire → `request_data._audioBinary`
3. `AudioHandler._handle_audio_process_request()`
4. `audio_fetcher.acquire_audio()` → sauvegarde temporaire
5. `AudioMessagePipeline.process_audio_message(audio_path=local_path, ...)`
6. **`TranslationStage.process_languages(source_audio_path=audio_path)`** ← 🎤 Clonage vocal ici

**Résultats attendus** :
- `audio_process_completed` (avec transcription + traductions)
- `audio_process_error` (en cas d'échec)

---

### 3. `transcription_only` - Transcription seule (sans traduction)
**Fichier source** : `ZmqRequestSender.ts:190-292`

```typescript
{
  type: 'transcription_only',
  taskId: string,
  messageId: string,
  attachmentId: string,
  audioFormat: string,
  mobileTranscription?: {
    text: string,
    language: string,
    confidence: number
  },
  binaryFrames: {
    audio: 1,
    audioMimeType: string,
    audioSize: number
  }
}
```

**Format multipart** : identique à `audio_process`

**Routage Translator** :
1. `ZMQTranslationServer` → `TranscriptionHandler._handle_transcription_only_request()`

**Résultats attendus** :
- `transcription_completed`
- `transcription_error`

---

### 4. `voice_api` - Requêtes Voice API diverses
**Fichier source** : `ZmqRequestSender.ts:303-323`

```typescript
{
  type: 'voice_api',  // Ou sous-types spécifiques
  taskId: string,
  userId?: string,
  // ... dépend du sous-type
}
```

**Sous-types supportés** :
- `voice_translate` / `voice_translate_async`
- `voice_analyze` / `voice_compare`
- `voice_profile_*` (CRUD)
- `voice_feedback` / `voice_history` / `voice_stats`
- `voice_admin_metrics` / `voice_health` / `voice_languages`

**Routage Translator** :
1. `ZMQTranslationServer` → `VoiceHandler._handle_voice_api_request()`

**Résultats attendus** :
- `voice_api_success`
- `voice_api_error`
- `voice_job_progress`

---

### 5. `voice_profile_*` - Gestion des profils vocaux
**Fichier source** : `ZmqRequestSender.ts:333-352`

**Sous-types** :
- `voice_profile_analyze` : analyser audio pour créer/MAJ profil
- `voice_profile_verify` : vérifier audio contre profil existant
- `voice_profile_compare` : comparer deux fingerprints

```typescript
{
  type: 'voice_profile_analyze',
  request_id: string,
  // ... paramètres spécifiques
}
```

**Routage Translator** :
1. `ZMQTranslationServer` → `VoiceHandler._handle_voice_profile_request()`

**Résultats attendus** :
- `voice_profile_analyze_result`
- `voice_profile_verify_result`
- `voice_profile_compare_result`
- `voice_profile_error`

---

### 6. `ping` - Health check
**Fichier source** : `ZmqConnectionManager.ts:149`

```typescript
{
  type: 'ping',
  timestamp: number
}
```

**Résultats attendus** :
- `pong`

---

## 📥 Résultats Translator → Gateway (SUB)

### Résultats traduction texte
- `translation_completed` : succès pour une langue cible
- `translation_error` : échec

### Résultats audio process
- `audio_process_completed` : pipeline complet terminé
- `audio_process_error` : échec

### Résultats transcription
- `transcription_completed` : transcription réussie
- `transcription_error` : échec

### Résultats Voice API
- `voice_api_success` : succès
- `voice_api_error` : échec
- `voice_job_progress` : progression asynchrone

### Résultats Voice Profile
- `voice_profile_analyze_result`
- `voice_profile_verify_result`
- `voice_profile_compare_result`
- `voice_profile_error`

### Résultats Voice Translation (legacy)
- `voice_translation_completed`
- `voice_translation_failed`

---

## 🔍 Vérification du flux audio_process avec clonage

### Chaîne complète (lignes de code)

```
1. Gateway: ZmqRequestSender.sendAudioProcessRequest()
   └─ Charge audio en binaire
   └─ Envoie multipart: [JSON, AudioBuffer]

2. Translator: ZMQTranslationServer._handle_translation_request_multipart()
   └─ Parse type: 'audio_process'
   └─ _inject_binary_frames() → request_data._audioBinary
   └─ Route → AudioHandler._handle_audio_process_request()

3. AudioHandler._handle_audio_process_request()
   └─ audio_fetcher.acquire_audio() → local_audio_path (fichier temp)
   └─ pipeline.process_audio_message(audio_path=local_audio_path, ...)

4. AudioMessagePipeline.process_audio_message()
   └─ transcription_stage.transcribe()
   └─ voice_profile_manager.get_or_create_profile()
   └─ translation_stage.process_languages(source_audio_path=audio_path) ← 🎤

5. TranslationStage.process_languages()
   └─ _process_single_language_async(source_audio_path=audio_path)
   └─ speaker_audio = source_audio_path if exists else voice_model.reference_audio_path
   └─ tts_service.synthesize_with_voice(speaker_audio_path=speaker_audio) ← 🎤 CLONAGE ICI
```

---

## ✅ Test de validation

Exécutez le script de test :

```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
bun run scripts/test-audio-cloning.ts
```

### Logs à surveiller lors d'un upload audio

**Dans le Translator** (tmux attach -t meeshy:translator) :

```
[TRANSLATOR] Audio process request reçu: <messageId>
[TRANSLATOR] Audio acquis via binary: /tmp/audio_<id>.m4a
[TRANSLATION_STAGE] 🎤 Clonage vocal activé: audio_ref=audio_<id>.m4a
[TTS] Synthèse multilingue: en (avec audio de référence: /tmp/audio_<id>.m4a)
[TRANSLATOR] Pipeline terminé: <taskId>, 2 traductions, 8500ms
```

**Si vous voyez plutôt** :
```
⚠️ Pas d'audio de référence disponible pour le clonage vocal → voix générique
```
→ Problème : `source_audio_path` n'est pas passé correctement

---

## 🐛 Problèmes corrigés

### ❌ Avant corrections
1. **Routage cassé** : Text requests routées vers voice_api_handler (AttributeError)
2. **Pas de type explicite** : Requêtes texte sans `type: 'translation'`
3. **Clonage non fonctionnel** : VoiceModel n'avait que embedding_path, pas reference_audio_path

### ✅ Après corrections
1. **Routage fixé** : Type explicite + handlers initialisés + if/elif propre
2. **Clonage fonctionnel** : source_audio_path passé dans toute la chaîne
3. **Consentements GDPR** : Validation avant toute opération audio

---

## 📊 Statistiques disponibles

```typescript
// Gateway
const stats = zmqClient.getStats();
// { translationRequests, audioProcessRequests, transcriptionRequests, ... }

// Translator
GET /health/stats
// { normal_workers, any_workers, total_tasks, ... }
```
