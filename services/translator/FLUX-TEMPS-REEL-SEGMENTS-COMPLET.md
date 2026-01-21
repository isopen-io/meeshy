# Flux Temps Réel Complet - Segments Audio

## 📊 Vue d'ensemble

Le système envoie maintenant les données de segments en **temps réel progressif** à chaque étape:

1. **Phase 1 (Transcription)**: Dès que la transcription originale est terminée
2. **Phase 2 (Traductions)**: Dès que chaque traduction est terminée (une par une)
3. **Phase 3 (Finale)**: Envoi récapitulatif de toutes les traductions (legacy)

## 🔄 Architecture du Flux

```
┌─────────────────────────────────────────────────────────────────┐
│                      TRANSLATOR (Python)                         │
├─────────────────────────────────────────────────────────────────┤
│ 1. Transcription originale terminée                             │
│    ↓                                                             │
│    on_transcription_ready(transcription_data)                   │
│    ↓                                                             │
│    _publish_transcription_result()                              │
│    ↓                                                             │
│    ZMQ PUB: type='transcription_ready'                          │
│    ✅ Segments avec TOUS les champs:                            │
│       - text, startMs, endMs                                    │
│       - speakerId, voiceSimilarityScore                         │
│       - confidence, language                                    │
├─────────────────────────────────────────────────────────────────┤
│ 2. Chaque traduction terminée (progressif)                      │
│    ↓                                                             │
│    on_translation_ready(translation_data)  ← NOUVEAU!           │
│    ↓                                                             │
│    _publish_translation_ready()  ← NOUVEAU!                     │
│    ↓                                                             │
│    ZMQ PUB: type='translation_ready'                            │
│    ✅ Segments traduits avec TOUS les champs:                   │
│       - text (traduit), startMs, endMs                          │
│       - speakerId (mappé), voiceSimilarityScore (hérité)        │
│       - confidence (Whisper re-transcription), language         │
├─────────────────────────────────────────────────────────────────┤
│ 3. Toutes les traductions terminées (legacy)                    │
│    ↓                                                             │
│    _publish_audio_result()                                      │
│    ↓                                                             │
│    ZMQ PUB: type='audio_process_completed'                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    GATEWAY - ZMQ Handler                         │
├─────────────────────────────────────────────────────────────────┤
│ ZmqMessageHandler.ts                                            │
│                                                                  │
│ routeEvent():                                                    │
│   case 'transcription_ready':                                   │
│     → handleTranscriptionReady()                                │
│     → emit('transcriptionReady', data)                          │
│                                                                  │
│   case 'translation_ready':  ← NOUVEAU!                         │
│     → handleTranslationReady()  ← NOUVEAU!                      │
│     → emit('translationReady', data)  ← NOUVEAU!                │
│                                                                  │
│   case 'audio_process_completed':                               │
│     → handleAudioProcessCompleted()                             │
│     → emit('audioProcessCompleted', data)                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              GATEWAY - MessageTranslationService                 │
├─────────────────────────────────────────────────────────────────┤
│ MessageTranslationService.ts                                    │
│                                                                  │
│ initialize():                                                    │
│   zmqClient.on('transcriptionReady', _handleTranscriptionReady) │
│   zmqClient.on('translationReady', _handleTranslationReady) ← NOUVEAU! │
│   zmqClient.on('audioProcessCompleted', _handleAudioProcessCompleted) │
│                                                                  │
│ _handleTranscriptionReady():                                    │
│   1. Sauvegarder transcription en BDD (MessageAttachment)       │
│   2. emit('transcriptionReady', data) vers Socket.IO            │
│      ✅ Segments complets inclus                                │
│                                                                  │
│ _handleTranslationReady():  ← NOUVEAU!                          │
│   1. Sauvegarder traduction en BDD (MessageAttachment.translations) │
│   2. emit('translationReady', data) vers Socket.IO              │
│      ✅ Segments traduits complets inclus                       │
│                                                                  │
│ _handleAudioProcessCompleted():                                 │
│   1. Sauvegarder toutes les traductions en BDD                  │
│   2. emit('audioTranslationReady', data) vers Socket.IO         │
│      ✅ Toutes les traductions avec segments complets           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│               GATEWAY - MeeshySocketIOManager                    │
├─────────────────────────────────────────────────────────────────┤
│ MeeshySocketIOManager.ts                                        │
│                                                                  │
│ initialize():                                                    │
│   translationService.on('transcriptionReady', _handleTranscriptionReady) │
│   translationService.on('translationReady', _handleTranslationReady) ← NOUVEAU! │
│   translationService.on('audioTranslationReady', _handleAudioTranslationReady) │
│                                                                  │
│ _handleTranscriptionReady():                                    │
│   io.to(roomName).emit(SERVER_EVENTS.TRANSCRIPTION_READY, data)│
│   ✅ Segments complets envoyés au frontend                      │
│                                                                  │
│ _handleTranslationReady():  ← NOUVEAU!                          │
│   io.to(roomName).emit(SERVER_EVENTS.TRANSLATION_READY, data)  │
│   ✅ Segments traduits complets envoyés au frontend             │
│                                                                  │
│ _handleAudioTranslationReady():                                 │
│   io.to(roomName).emit(SERVER_EVENTS.AUDIO_TRANSLATION_READY, data) │
│   ✅ Toutes les traductions avec segments complets              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (WebSocket)                         │
├─────────────────────────────────────────────────────────────────┤
│ Le frontend reçoit 3 événements progressifs:                   │
│                                                                  │
│ 1. 'transcription_ready' (Phase 1)                              │
│    → Afficher la transcription immédiatement                    │
│    → Segments disponibles pour lecture suivie                   │
│                                                                  │
│ 2. 'translation_ready' (Phase 2 - progressive) ← NOUVEAU!       │
│    → Afficher chaque traduction dès qu'elle arrive              │
│    → Segments traduits disponibles immédiatement                │
│                                                                  │
│ 3. 'audio_translation_ready' (Phase 3 - legacy)                 │
│    → Confirmation que toutes les traductions sont prêtes        │
└─────────────────────────────────────────────────────────────────┘
```

## 📋 Structure Complète des Segments

### Segments Originaux (Transcription)

```typescript
{
  text: string;                      // Texte du segment
  startMs: number;                   // Début en millisecondes
  endMs: number;                     // Fin en millisecondes
  speakerId: string | null;          // ID du speaker (ex: "SPEAKER_00")
  voiceSimilarityScore: number | null; // Score de similarité vocale (0-1)
  confidence: number;                // Niveau de confiance Whisper (0-1)
  language: string;                  // Langue du segment
}
```

### Segments Traduits (Re-transcription)

```typescript
{
  text: string;                      // Texte traduit du segment
  startMs: number;                   // Début en millisecondes (timestamp exact)
  endMs: number;                     // Fin en millisecondes (timestamp exact)
  speakerId: string;                 // ID du speaker mappé depuis l'original
  voiceSimilarityScore: number | null; // Score hérité du speaker original
  confidence: number;                // Niveau de confiance Whisper
  language: string;                  // Langue cible
}
```

## ✅ Garanties du Système

### 1. Tous les événements incluent les segments complets

- ✅ `transcription_ready`: Segments originaux avec tous les champs
- ✅ `translation_ready`: Segments traduits avec tous les champs (par langue)
- ✅ `audio_process_completed`: Toutes les traductions avec segments complets

### 2. Structure cohérente à chaque étape

- ✅ Même format de segments partout (original → traductions → frontend)
- ✅ Les 7 champs présents à chaque niveau
- ✅ Pas de perte de données entre les couches

### 3. Envoi progressif en temps réel

- ✅ Transcription envoyée dès qu'elle est prête (~2-5s après début)
- ✅ Chaque traduction envoyée dès qu'elle est prête (~5-10s par langue)
- ✅ Pas d'attente de la fin complète

## 🚀 Modifications Effectuées

### 1. Translator (Python)

**Fichier**: `services/translator/src/services/zmq_audio_handler.py`

#### Ajouté:
```python
# Callback pour publier chaque traduction dès qu'elle est prête
async def on_translation_ready(translation_data: dict):
    await self._publish_translation_ready(task_id, translation_data)

# Passer le callback au pipeline
result = await pipeline.process_audio_message(
    # ... params existants
    on_translation_ready=on_translation_ready  # ← NOUVEAU
)

# Nouvelle méthode pour publier les traductions individuelles
async def _publish_translation_ready(self, task_id: str, translation_data: dict):
    """
    Publie une traduction individuelle dès qu'elle est prête.
    Type ZMQ: 'translation_ready'
    Inclut: segments complets avec tous les champs
    """
    # ... implémentation complète (lignes 638-743)
```

### 2. Gateway - ZMQ Handler (TypeScript)

**Fichier**: `services/gateway/src/services/zmq-translation/ZmqMessageHandler.ts`

#### Ajouté:
```typescript
// Type pour l'événement
export interface TranslationReadyEvent {
  type: 'translation_ready';
  taskId: string;
  messageId: string;
  attachmentId: string;
  language: string;
  translatedAudio: {
    targetLanguage: string;
    translatedText: string;
    audioUrl: string;
    audioPath: string;
    durationMs: number;
    voiceCloned: boolean;
    voiceQuality: number;
    audioMimeType: string;
    segments?: TranscriptionSegment[];  // ← Segments complets
  };
  timestamp: number;
}

// Routing de l'événement
case 'translation_ready':
  this.handleTranslationReady(event as unknown as TranslationReadyEvent);
  break;

// Handler
private handleTranslationReady(event: TranslationReadyEvent): void {
  console.log(`[GATEWAY] 🌍 Translation READY (progressive): ${event.messageId}`);
  console.log(`[GATEWAY]    🔊 Langue: ${event.language}`);
  console.log(`[GATEWAY]    📝 Segments: ${event.translatedAudio.segments?.length || 0}`);

  this.emit('translationReady', {
    taskId: event.taskId,
    messageId: event.messageId,
    attachmentId: event.attachmentId,
    language: event.language,
    translatedAudio: event.translatedAudio
  });
}
```

### 3. Gateway - MessageTranslationService (TypeScript)

**Fichier**: `services/gateway/src/services/message-translation/MessageTranslationService.ts`

#### Ajouté:
```typescript
// Listener
this.zmqClient.on('translationReady', this._handleTranslationReady.bind(this));

// Handler
private async _handleTranslationReady(data: {
  taskId: string;
  messageId: string;
  attachmentId: string;
  language: string;
  translatedAudio: { /* ... */ };
}) {
  // 1. Sauvegarder la traduction en BDD
  const existingTranslations = (attachment.translations as AttachmentTranslations) || {};
  existingTranslations[data.language] = {
    type: 'audio',
    transcription: data.translatedAudio.translatedText,
    // ... autres champs
    segments: data.translatedAudio.segments as any,  // ← Segments complets
  };

  await this.prisma.messageAttachment.update({
    where: { id: data.attachmentId },
    data: { translations: existingTranslations as any }
  });

  // 2. Émettre vers Socket.IO
  this.emit('translationReady', {
    taskId: data.taskId,
    messageId: data.messageId,
    attachmentId: data.attachmentId,
    language: data.language,
    translatedAudio: translationSocketIO,  // ← Avec segments complets
    phase: 'translation'
  });
}
```

### 4. Gateway - Socket.IO Manager (TypeScript)

**Fichier**: `services/gateway/src/socketio/MeeshySocketIOManager.ts`

#### Ajouté:
```typescript
// Listener
this.translationService.on('translationReady', this._handleTranslationReady.bind(this));

// Handler
private async _handleTranslationReady(data: {
  taskId: string;
  messageId: string;
  attachmentId: string;
  language: string;
  translatedAudio: any;
  phase?: string;
}) {
  // Préparer les données
  const translationData = {
    messageId: data.messageId,
    attachmentId: data.attachmentId,
    conversationId: normalizedId,
    language: data.language,
    translatedAudio: data.translatedAudio,  // ← Avec segments complets
    phase: data.phase || 'translation'
  };

  // Diffuser dans la room de conversation
  this.io.to(roomName).emit(SERVER_EVENTS.TRANSLATION_READY, translationData);
}
```

## 📊 Timeline Typique

```
Temps    | Phase                              | Événement envoyé
---------|------------------------------------|--------------------------
T+0s     | Début du traitement                | -
T+2-5s   | Transcription terminée             | transcription_ready ✅
T+5-10s  | Traduction FR terminée             | translation_ready (FR) ✅
T+10-15s | Traduction EN terminée             | translation_ready (EN) ✅
T+15-20s | Traduction ES terminée             | translation_ready (ES) ✅
T+20s    | Toutes traductions terminées       | audio_process_completed ✅
```

## 🎯 Avantages

### 1. Réactivité Frontend
- L'utilisateur voit la transcription en ~2-5s (au lieu d'attendre 20s)
- Chaque traduction apparaît dès qu'elle est prête
- Expérience utilisateur fluide et progressive

### 2. Segments Complets Partout
- Lecture suivie (karaoke) disponible immédiatement
- Diarisation (speakers) préservée à chaque étape
- Scores de similarité vocale maintenus

### 3. Flexibilité
- Le frontend peut choisir d'utiliser les événements progressifs ou l'événement final
- Compatibilité backward avec l'ancien système (audio_process_completed)

## 🔍 Vérification du Flux

Pour vérifier que tout fonctionne correctement, surveillez les logs:

### Translator
```
✅ [TRANSLATOR] Transcription ready publié: msg=xxx, lang=fr, segments=150
✅ [TRANSLATOR] Translation ready (multipart) publié: fr, 524,288 bytes
✅ [TRANSLATOR] Translation ready (multipart) publié: en, 498,432 bytes
```

### Gateway ZMQ Handler
```
[GATEWAY] 📤 Transcription READY (avant traduction): xxx
[GATEWAY]    📝 Segments: 150 segments
[GATEWAY] 🌍 Translation READY (progressive): xxx
[GATEWAY]    🔊 Langue: fr
[GATEWAY]    📝 Segments: 145
```

### Gateway MessageTranslationService
```
🎯 [TranslationService] Transcription READY: xxx | Segments: 150
✅ [Phase 1] Transcription sauvegardée | 150 segments
🌍 [TranslationService] Translation READY (progressive): xxx | Lang: fr | Segments: 145
✅ [Phase 2 Progressive] Traduction fr sauvegardée | Segments: 145
```

### Gateway Socket.IO
```
📝 [SocketIOManager] Transcription ready pour message xxx
📡 [SocketIOManager] Émission événement 'transcription_ready' vers room 'conversation_yyy' (2 clients)
🌍 [SocketIOManager] Translation ready pour message xxx
📡 [SocketIOManager] Émission événement 'translation_ready' vers room 'conversation_yyy' (2 clients)
```

## 📝 Notes Importantes

1. **Segments Fins vs Tours de Parole**:
   - Original: 100-200 segments fins (niveau mot/phrase)
   - Traduit: 100-200 segments fins (re-transcription Whisper)
   - Tours utilisés uniquement en interne pour TTS, pas exposés au frontend

2. **Re-transcription Sans Diarisation**:
   - Économie de 50% de temps vs diarisation complète
   - Mapping temporel des speakers préserve la cohérence
   - Pas de dérive des speakers entre langues

3. **Backward Compatibility**:
   - L'événement `audio_process_completed` est toujours envoyé
   - Le frontend peut ignorer les événements progressifs s'il ne les supporte pas
   - Les anciens clients continueront de fonctionner

4. **Structure BDD**:
   - `MessageAttachment.transcription`: JSON avec segments originaux
   - `MessageAttachment.translations`: JSON map avec segments traduits par langue
   - Pas de changement de schéma requis

## 🚦 État du Système

✅ Translator: Callbacks et publication ZMQ progressive
✅ Gateway ZMQ Handler: Routing des événements progressifs
✅ Gateway MessageTranslationService: Sauvegarde BDD et émission Socket.IO
✅ Gateway Socket.IO: Diffusion aux clients connectés
✅ Structure segments: Complète à chaque étape
✅ Backward compatibility: Maintenue

## 📚 Références

- `STRUCTURE_SEGMENTS_COMPLETE.md`: Documentation détaillée des segments
- `retranscription_service.py`: Service de re-transcription légère
- `multi_speaker_processor.py`: Traitement multi-speaker avec callbacks
