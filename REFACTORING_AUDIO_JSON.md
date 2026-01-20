# Refactoring : Audio Transcription & Translations → JSON intégré

## 📋 Résumé

Refactoring architectural majeur pour optimiser le stockage des transcriptions et traductions audio dans MongoDB.

**Avant** : 3 collections séparées (inefficace)
**Après** : 1 collection avec champs JSON (optimal)

---

## 🎯 Motivation

### Problèmes de l'architecture précédente

1. **Performance médiocre** : 3+ requêtes pour récupérer un attachment complet
2. **Code complexe** : Upserts avec clés composites (`attachmentId_targetLanguage`)
3. **Anti-pattern MongoDB** : Collections séparées pour 4-10 éléments par document
4. **Maintenance difficile** : 3 models Prisma à synchroniser

### Avantages de la nouvelle architecture

✅ **1 seule requête** pour tout récupérer
✅ **Atomicité** garantie (tout dans un document)
✅ **Code simplifié** (simple JSON update)
✅ **Performance optimale** (1 round-trip DB au lieu de 3+)

---

## 🔧 Changements effectués

### 1. Schema Prisma

#### ✅ Ajouté dans `MessageAttachment`

```prisma
model MessageAttachment {
  // ... champs existants

  /// Transcription du contenu audio/vidéo original
  transcription Json?

  /// Traductions (audio/vidéo/texte) - map: langue -> données
  translations Json?

  /// Métadonnées génériques extensibles
  metadata Json?
}
```

#### ❌ Supprimé

```prisma
// ❌ Collections supprimées
model MessageAudioTranscription { ... }
model MessageTranslatedAudio { ... }

// ❌ Relations supprimées du model Message
audioTranscriptions MessageAudioTranscription[]
translatedAudios    MessageTranslatedAudio[]

// ❌ Relations supprimées du model MessageAttachment
transcription    MessageAudioTranscription?
translatedAudios MessageTranslatedAudio[]

// ❌ Anciens champs hybrid mode
serverCopyUrl String?
transcriptionText String?
translationsJson Json?
```

---

## 📦 Structure des données

### `transcription` (Json)

```typescript
{
  text: string;                    // Texte transcrit
  language: string;                // Code ISO 639-1 (fr, en, es...)
  confidence: number;              // Score de confiance (0-1)
  source: "mobile" | "whisper" | "voice_api";
  model?: string;                  // Ex: "whisper-large-v3"
  segments?: Array<{               // Segments avec timestamps
    text: string;
    start: number;                 // Millisecondes
    end: number;
    speaker_id?: string;
    confidence?: number;
  }>;
  speakerCount?: number;           // Nombre de locuteurs
  primarySpeakerId?: string;       // ID du locuteur principal
  durationMs: number;              // Durée audio

  // Métadonnées avancées (optionnel)
  speakerAnalysis?: object;        // Analyse des locuteurs
  senderVoiceIdentified?: boolean;
  senderSpeakerId?: string;
  voiceQualityAnalysis?: object;
}
```

### `translations` (Json)

```typescript
{
  "en": {
    type: "audio" | "video" | "text";
    transcription: string;         // Texte traduit
    path?: string;                 // Chemin fichier local
    url?: string;                  // URL accessible
    durationMs?: number;           // Durée audio/vidéo
    format?: string;               // Format (mp3, mp4, etc.)
    cloned?: boolean;              // Clonage vocal activé
    quality?: number;              // Qualité (0-1)
    voiceModelId?: string;         // ID modèle vocal
    ttsModel?: string;             // Modèle TTS (xtts, openvoice)
    createdAt: Date;               // Date de création
    updatedAt?: Date;              // Dernière modification
    deletedAt?: Date;              // Soft delete
  },
  "fr": { /* ... */ },
  "es": { /* ... */ }
}
```

---

## 📊 Exemple de document MongoDB complet

```json
{
  "_id": "att_67890abcdef",
  "messageId": "msg_12345",
  "fileName": "audio_1737287400.mp3",
  "fileUrl": "/api/attachments/audio_1737287400.mp3",
  "duration": 5000,

  "transcription": {
    "text": "Bonjour, comment allez-vous aujourd'hui ?",
    "language": "fr",
    "confidence": 0.95,
    "source": "whisper",
    "model": "whisper-large-v3",
    "segments": [
      {
        "text": "Bonjour,",
        "start": 0,
        "end": 800,
        "speaker_id": "SPEAKER_00",
        "confidence": 0.97
      },
      {
        "text": "comment allez-vous aujourd'hui ?",
        "start": 850,
        "end": 3200,
        "speaker_id": "SPEAKER_00",
        "confidence": 0.93
      }
    ],
    "speakerCount": 1,
    "primarySpeakerId": "SPEAKER_00",
    "durationMs": 5000
  },

  "translations": {
    "en": {
      "type": "audio",
      "transcription": "Hello, how are you today?",
      "path": "/uploads/attachments/translated/att_67890abcdef_en.mp3",
      "url": "/api/v1/attachments/file/translated/att_67890abcdef_en.mp3",
      "durationMs": 2500,
      "format": "mp3",
      "cloned": true,
      "quality": 0.95,
      "voiceModelId": "user_123",
      "ttsModel": "xtts",
      "createdAt": "2026-01-19T10:30:15Z"
    },
    "es": {
      "type": "audio",
      "transcription": "Hola, ¿cómo estás hoy?",
      "path": "/uploads/attachments/translated/att_67890abcdef_es.mp3",
      "url": "/api/v1/attachments/file/translated/att_67890abcdef_es.mp3",
      "durationMs": 2600,
      "format": "mp3",
      "cloned": true,
      "quality": 0.93,
      "voiceModelId": "user_123",
      "ttsModel": "xtts",
      "createdAt": "2026-01-19T10:30:20Z"
    }
  },

  "metadata": {
    "audio": {
      "waveformPeaks": [0.2, 0.5, 0.8, 0.4],
      "noiseLevel": 0.15
    }
  },

  "createdAt": "2026-01-19T10:00:00Z"
}
```

---

## 🚀 Migration

### Script de migration

```bash
# Dry run (aucune modification)
bun run services/gateway/scripts/migrate-audio-to-json.ts --dry-run

# Migration réelle
bun run services/gateway/scripts/migrate-audio-to-json.ts
```

### Ce que fait le script

1. ✅ Lit toutes les `MessageAudioTranscription`
2. ✅ Lit toutes les `MessageTranslatedAudio`
3. ✅ Regroupe par `attachmentId`
4. ✅ Crée les structures JSON `transcription` et `translations`
5. ✅ Met à jour les `MessageAttachment` correspondants
6. ✅ Supprime les anciennes collections (si pas dry-run)

---

## 📝 TODO : Refactoring du code

### Services à modifier

1. **`MessageTranslationService`** ✅ À faire
   - `_handleVoiceTranslationCompleted()` : Utiliser JSON au lieu d'upsert
   - `_handleAudioProcessCompleted()` : Utiliser JSON au lieu d'upsert

2. **Routes API** ✅ À faire
   - `/api/attachments/:id/transcribe`
   - `/api/attachments/:id/translate`
   - Adapter les réponses pour la nouvelle structure

3. **Types TypeScript** ✅ À faire
   - `@meeshy/shared/types/attachment.ts`
   - `@meeshy/shared/types/audio-transcription.ts`
   - `@meeshy/shared/types/translated-audio.ts`

4. **Frontend** ✅ À faire
   - `hooks/use-audio-translation.ts`
   - Adapter pour consommer JSON au lieu de relations Prisma

---

## 📈 Comparaison Avant/Après

| Aspect | Avant (3 collections) | Après (1 collection JSON) |
|--------|----------------------|---------------------------|
| **Requêtes DB** | 3+ (attachment + transcription + N traductions) | **1** |
| **Atomicité** | ❌ Risque d'incohérence | ✅ Tout ou rien |
| **Code** | Upsert complexe avec clés composites | Simple JSON update |
| **Performance** | Lente (3+ round-trips) | **Rapide (1 round-trip)** |
| **Migrations** | Complexes (3 collections) | Simples (1 collection) |
| **Lisibilité** | Relations Prisma complexes | JSON simple et clair |

---

## 🎯 Exemple de code simplifié

### Avant (complexe)

```typescript
// 1. Sauvegarder transcription
await prisma.messageAudioTranscription.upsert({
  where: { attachmentId },
  update: { /* ... */ },
  create: { /* ... */ }
});

// 2. Sauvegarder traductions (boucle)
for (const translation of translations) {
  await prisma.messageTranslatedAudio.upsert({
    where: {
      attachmentId_targetLanguage: {
        attachmentId,
        targetLanguage: translation.targetLanguage
      }
    },
    update: { /* ... */ },
    create: { /* ... */ }
  });
}

// 3. Lire pour renvoyer au frontend
const attachment = await prisma.messageAttachment.findUnique({
  where: { id: attachmentId },
  include: {
    transcription: true,
    translatedAudios: true
  }
});
```

### Après (simple)

```typescript
// Tout dans UN SEUL update
const translationsMap: Record<string, TranslationData> = {};

for (const translation of translations) {
  translationsMap[translation.targetLanguage] = {
    type: 'audio',
    transcription: translation.translatedText,
    path: localAudioPath,
    url: localAudioUrl,
    durationMs: translation.durationMs,
    cloned: translation.voiceCloned,
    quality: translation.voiceQuality,
    voiceModelId: data.userId,
    ttsModel: 'xtts',
    createdAt: new Date()
  };
}

const attachment = await prisma.messageAttachment.update({
  where: { id: attachmentId },
  data: {
    transcription: {
      text: data.transcription.text,
      language: data.transcription.language,
      confidence: data.transcription.confidence,
      source: 'voice_api',
      durationMs: data.transcription.durationMs,
      segments: data.transcription.segments
    },
    translations: translationsMap
  }
});

// Tout est déjà dans attachment - pas de requête supplémentaire !
```

---

## ✅ Checklist de migration

- [x] Modifier schema Prisma
- [x] Supprimer models `MessageAudioTranscription` et `MessageTranslatedAudio`
- [x] Créer script de migration des données
- [ ] Refactoriser `MessageTranslationService`
- [ ] Mettre à jour types TypeScript partagés
- [ ] Adapter routes API
- [ ] Adapter frontend hooks
- [ ] Tester flux complet
- [ ] Exécuter migration en production

---

## 🎉 Résultat final

**Architecture optimale pour MongoDB** :
- ✅ 1 collection au lieu de 3
- ✅ 1 requête au lieu de 3+
- ✅ Code 10x plus simple
- ✅ Performance maximale
- ✅ Maintenance facilitée
