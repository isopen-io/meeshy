# 📋 Plan de Normalisation API Schema & Frontend V2

## 🎯 Objectif

Normaliser toutes les structures de données API et frontend pour respecter la nouvelle architecture V2 avec champs JSON intégrés (`transcription` et `translations`).

---

## 📊 État Actuel

### Fichiers Identifiés

1. **API Schema** : `/packages/shared/types/api-schemas.ts`
   - Lignes 348-368 : Schema `transcription` (ancien format)
   - Lignes 369-390 : Schema `translationsJson` (format partiellement V2)

2. **Frontend Transformer** : `/apps/web/services/conversations/transformers.service.ts`
   - Lignes 263-285 : `transformAttachments()` utilise ancien format `translatedAudios`

3. **Backend Services** : Déjà adaptés ✅
   - AttachmentService.ts
   - MessageTranslationService.ts
   - AudioTranslateService.ts
   - AttachmentTranslateService.ts

---

## 🔧 Changements à Effectuer

### 1. Mettre à Jour API Schema (`api-schemas.ts`)

#### A. Schema `transcription` (lignes 348-368)

**Avant** (ancien format avec noms legacy) :
```typescript
transcription: {
  type: 'object',
  nullable: true,
  description: 'Objet de transcription complet avec métadonnées',
  properties: {
    type: { type: 'string', enum: ['audio', 'video', 'document', 'image'] },
    transcribedText: { type: 'string' },          // ❌ Ancien nom
    audioDurationMs: { type: 'number' },          // ❌ Ancien nom spécifique audio
    // ...
  }
}
```

**Après** (V2 format avec noms normalisés) :
```typescript
transcription: {
  type: 'object',
  nullable: true,
  description: 'Transcription JSON intégrée (AttachmentTranscription V2)',
  properties: {
    text: { type: 'string', description: 'Texte transcrit' },
    language: { type: 'string', description: 'Langue détectée (ISO 639-1)' },
    confidence: { type: 'number', description: 'Score de confiance (0-1)' },
    source: {
      type: 'string',
      enum: ['mobile', 'whisper', 'voice_api'],
      description: 'Source de transcription'
    },
    model: { type: 'string', nullable: true, description: 'Modèle utilisé' },
    segments: {
      type: 'array',
      nullable: true,
      description: 'Segments avec timestamps',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          start: { type: 'number', description: 'Start time (ms)' },
          end: { type: 'number', description: 'End time (ms)' },
          speaker_id: { type: 'string', nullable: true },
          confidence: { type: 'number', nullable: true }
        }
      }
    },
    speakerCount: { type: 'number', nullable: true, description: 'Nombre de locuteurs' },
    primarySpeakerId: { type: 'string', nullable: true, description: 'ID locuteur principal' },
    durationMs: { type: 'number', description: 'Durée en millisecondes' },
    voiceQualityAnalysis: { type: 'object', nullable: true, description: 'Analyse qualité vocale' }
  }
}
```

#### B. Schema `translationsJson` (lignes 369-390)

**Avant** (format partiel) :
```typescript
translationsJson: {
  type: 'object',
  nullable: true,
  description: 'Traductions disponibles (clé = langue cible)',
  additionalProperties: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['audio', 'text', 'document'] },
      translatedText: { type: 'string' },           // ❌ Ancien nom
      audioUrl: { type: 'string' },                 // ❌ Manque path
      // ...
    }
  }
}
```

**Après** (V2 complet) :
```typescript
translationsJson: {
  type: 'object',
  nullable: true,
  description: 'Traductions JSON intégrées (AttachmentTranslations V2) - Map: langue → traduction',
  additionalProperties: {
    type: 'object',
    required: ['type', 'transcription', 'createdAt'],
    properties: {
      type: {
        type: 'string',
        enum: ['audio', 'video', 'text'],
        description: 'Type de traduction'
      },
      transcription: { type: 'string', description: 'Texte traduit' },
      path: { type: 'string', nullable: true, description: 'Chemin fichier local' },
      url: { type: 'string', nullable: true, description: 'URL accessible' },
      durationMs: { type: 'number', nullable: true, description: 'Durée (ms)' },
      format: { type: 'string', nullable: true, description: 'Format fichier (mp3, mp4...)' },
      cloned: { type: 'boolean', nullable: true, description: 'Clonage vocal activé' },
      quality: { type: 'number', nullable: true, description: 'Qualité (0-1)' },
      voiceModelId: { type: 'string', nullable: true, description: 'ID modèle vocal' },
      ttsModel: { type: 'string', nullable: true, description: 'Modèle TTS (xtts, openvoice)' },
      createdAt: { type: 'string', format: 'date-time', description: 'Date création' },
      updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Date modification' },
      deletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Date suppression (soft delete)' }
    }
  }
}
```

#### C. Ajouter Schema `translatedAudios` (pour rétrocompatibilité Socket.IO)

```typescript
translatedAudios: {
  type: 'array',
  nullable: true,
  description: 'Traductions converties en format Socket.IO (SocketIOTranslatedAudio) - Rétrocompatibilité',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'ID composite: attachmentId_langue' },
      targetLanguage: { type: 'string', description: 'Langue cible (ISO 639-1)' },
      translatedText: { type: 'string', description: 'Texte traduit' },
      audioUrl: { type: 'string', description: 'URL audio' },
      durationMs: { type: 'number', description: 'Durée (ms)' },
      voiceCloned: { type: 'boolean', description: 'Clonage vocal' },
      voiceQuality: { type: 'number', description: 'Qualité (0-1)' },
      audioPath: { type: 'string', nullable: true },
      format: { type: 'string', nullable: true },
      ttsModel: { type: 'string', nullable: true },
      voiceModelId: { type: 'string', nullable: true }
    }
  }
}
```

---

### 2. Mettre à Jour Frontend Transformer (`transformers.service.ts`)

**Fichier** : `/apps/web/services/conversations/transformers.service.ts`
**Méthode** : `transformAttachments()` (lignes 224-288)

**Changements** :

```typescript
private transformAttachments(attachments: any[], messageId: string, senderId: string): Attachment[] | undefined {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return undefined;
  }

  return attachments.map((att: any): Attachment => {
    return {
      id: String(att.id || ''),
      messageId,
      fileName: String(att.fileName || ''),
      // ... autres champs ...

      // ✅ V2: Mapper transcription JSON
      transcription: att.transcription as AttachmentTranscription | undefined,

      // ✅ V2: Mapper translations JSON
      translationsJson: att.translationsJson as AttachmentTranslations | undefined,

      // ✅ V2: Mapper translatedAudios (format Socket.IO converti)
      translatedAudios: Array.isArray(att.translatedAudios)
        ? att.translatedAudios.map((ta: any): SocketIOTranslatedAudio => ({
            id: String(ta.id || ''),
            targetLanguage: String(ta.targetLanguage || ''),
            translatedText: String(ta.translatedText || ''),
            audioUrl: String(ta.audioUrl || ''),
            durationMs: Number(ta.durationMs) || 0,
            voiceCloned: Boolean(ta.voiceCloned),
            voiceQuality: Number(ta.voiceQuality) || 0,
            audioPath: ta.audioPath ? String(ta.audioPath) : undefined,
            format: ta.format ? String(ta.format) : undefined,
            ttsModel: ta.ttsModel ? String(ta.ttsModel) : undefined,
            voiceModelId: ta.voiceModelId ? String(ta.voiceModelId) : undefined,
          }))
        : undefined,

      // ❌ DEPRECATED: Supprimer transcriptionText (remplacé par transcription.text)
      // transcriptionText: att.transcriptionText ? String(att.transcriptionText) : undefined,
    };
  });
}
```

**Imports à ajouter** :
```typescript
import type {
  AttachmentTranscription,
  AttachmentTranslations,
  SocketIOTranslatedAudio,
} from '@meeshy/shared/types/attachment-audio';
```

---

### 3. Mettre à Jour Types Frontend

**Fichier** : Vérifier `/apps/web/types` ou créer si nécessaire

#### Types à aligner avec backend V2

```typescript
// Utiliser les types partagés du backend
import type {
  AttachmentTranscription,
  AttachmentTranslations,
  AttachmentTranslation,
  SocketIOTranslatedAudio,
  TranscriptionSegment,
} from '@meeshy/shared/types/attachment-audio';

// Type Attachment frontend doit correspondre
export interface Attachment {
  id: string;
  messageId: string;
  fileName: string;
  // ... autres champs ...

  // V2: Champs JSON
  transcription?: AttachmentTranscription;
  translationsJson?: AttachmentTranslations;

  // V2: Format Socket.IO (converti depuis translationsJson)
  translatedAudios?: SocketIOTranslatedAudio[];

  // DEPRECATED: Ne plus utiliser
  // transcriptionText?: string;
}
```

---

### 4. Vérifier Routes API Backend

**Routes à vérifier** :
- `/api/conversations/:id/messages` (GET) - Liste des messages avec attachments
- `/api/messages/:id` (GET) - Message unique avec attachments
- `/api/attachments/:id` (GET) - Attachment unique
- `/api/attachments/:id/transcribe` (POST) - Transcription
- `/api/attachments/:id/translate` (POST) - Traduction

**Vérification nécessaire** :
1. Les routes renvoient bien les champs JSON `transcription` et `translations`
2. Les routes utilisent `toSocketIOAudios()` pour générer `translatedAudios`
3. Les routes n'incluent plus les anciennes relations

---

### 5. Adapter Hooks React

**Fichiers à adapter** :
- `/apps/web/hooks/use-audio-translation.ts`
- `/apps/web/hooks/use-transcription.ts`
- Tous hooks consommant des attachments

**Changements** :

```typescript
// Avant
const translatedAudio = attachment.translatedAudios?.find(
  ta => ta.targetLanguage === targetLang
);

// Après V2
import { getTranslation } from '@meeshy/shared/types/attachment-audio';

const translation = getTranslation(attachment.translationsJson, targetLang);
const socketIOFormat = attachment.translatedAudios?.find(
  ta => ta.targetLanguage === targetLang
); // Pour compatibilité UI
```

---

## ✅ Checklist de Migration

### Backend API

- [ ] Mettre à jour `messageAttachmentSchema.transcription` dans api-schemas.ts
- [ ] Mettre à jour `messageAttachmentSchema.translationsJson` dans api-schemas.ts
- [ ] Ajouter `messageAttachmentSchema.translatedAudios` dans api-schemas.ts
- [ ] Vérifier routes API `/conversations/:id/messages`
- [ ] Vérifier routes API `/messages/:id`
- [ ] Vérifier routes API `/attachments/:id`

### Frontend

- [ ] Mettre à jour imports dans `transformers.service.ts`
- [ ] Adapter `transformAttachments()` pour V2
- [ ] Créer/mettre à jour types frontend Attachment
- [ ] Adapter hooks React (`use-audio-translation`, `use-transcription`)
- [ ] Tester affichage transcriptions dans UI
- [ ] Tester affichage traductions dans UI

### Tests

- [ ] Test end-to-end : Envoyer message audio
- [ ] Test end-to-end : Transcription audio
- [ ] Test end-to-end : Traduction audio
- [ ] Test WebSocket events
- [ ] Test rétrocompatibilité Socket.IO format

---

## 🚀 Ordre d'Exécution Recommandé

1. **Phase 1 : API Schema** (30min)
   - Mettre à jour `api-schemas.ts`
   - Documenter les changements

2. **Phase 2 : Frontend Transformer** (30min)
   - Adapter `transformers.service.ts`
   - Ajouter imports nécessaires

3. **Phase 3 : Types Frontend** (20min)
   - Créer/mettre à jour types Attachment
   - Aligner avec types backend

4. **Phase 4 : Hooks React** (40min)
   - Adapter hooks consommant attachments
   - Utiliser helpers V2 (`getTranslation`, etc.)

5. **Phase 5 : Tests** (1h)
   - Tests end-to-end complets
   - Vérification UI

**Temps total estimé** : ~3h

---

## 📊 Impact

### Compatibilité

- ✅ Rétrocompatibilité Socket.IO via `translatedAudios` (converti depuis JSON)
- ✅ Migration transparente pour frontend (types alignés)
- ⚠️ BREAKING: Hooks utilisant directement `transcriptionText` doivent migrer vers `transcription.text`

### Performance

- ✅ Pas d'impact (données déjà en JSON côté backend)
- ✅ Pas de requêtes supplémentaires
- ✅ Transformation légère en mémoire

---

## 📝 Notes

- **Priorité HAUTE** : Phase 1 & 2 (API Schema + Transformer)
- **Priorité MOYENNE** : Phase 3 & 4 (Types + Hooks)
- **Priorité BASSE** : Phase 5 (Tests peuvent être progressifs)

**Alignement V2** : Cette normalisation prépare le terrain pour Stories, Video, Calls groupe avec transcription/traduction live.
