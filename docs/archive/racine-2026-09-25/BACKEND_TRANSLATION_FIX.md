# Fix Backend - Traductions Audio Multilingues

## Problème

### Erreur observée
```
Cannot read properties of undefined (reading 'segments')
at MeeshySocketIOManager._broadcastTranslationEvent (line 1658)
```

### Logs d'erreur
```
🔊 Langue: undefined
❌ [SocketIOManager] Erreur envoi traduction: Cannot read properties of undefined
```

### Cause racine

**Incompatibilité de format entre émetteur et récepteur**

1. **MessageTranslationService** émet `audioTranslationReady` avec :
```typescript
{
  taskId: string,
  messageId: string,
  attachmentId: string,
  transcription: any,
  translatedAudios: Array<{        // ← ARRAY
    targetLanguage: string,
    url: string,
    path: string,
    segments: any[]
  }>,
  processingTimeMs: number
}
```

2. **MeeshySocketIOManager** attendait :
```typescript
{
  taskId: string,
  messageId: string,
  attachmentId: string,
  language: string,              // ← MANQUANT
  translatedAudio: any,          // ← SINGULAR, MANQUANT
  phase?: string
}
```

**Résultat** : `data.language` = `undefined`, `data.translatedAudio` = `undefined`
→ Crash en essayant d'accéder à `data.translatedAudio.segments`

---

## Solution implémentée

### 1. `_handleAudioTranslationReady` - Support format array

**services/gateway/src/socketio/MeeshySocketIOManager.ts:1735**

```typescript
private async _handleAudioTranslationReady(data: {
  taskId: string;
  messageId: string;
  attachmentId: string;
  transcription?: any;
  translatedAudios: Array<{
    targetLanguage: string;
    url: string;
    path: string;
    segments?: any[];
    duration?: number;
  }>;
  processingTimeMs?: number;
}) {
  // Broadcaster chaque traduction individuellement
  for (const translatedAudio of data.translatedAudios) {
    await this._broadcastTranslationEvent(
      {
        taskId: data.taskId,
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        language: translatedAudio.targetLanguage,
        translatedAudio: translatedAudio,
        transcription: data.transcription
      },
      'audioTranslationReady',
      SERVER_EVENTS.AUDIO_TRANSLATION_READY,
      '🎯'
    );
  }
}
```

**Avantages** :
- ✅ Broadcaster **chaque langue** individuellement
- ✅ Clients reçoivent les traductions au fur et à mesure
- ✅ Logs clairs pour chaque langue

### 2. `_handleAudioTranslationsProgressive` - Support dual format

```typescript
private async _handleAudioTranslationsProgressive(data: any) {
  // Si c'est le nouveau format avec translatedAudios array
  if (data.translatedAudios && Array.isArray(data.translatedAudios)) {
    for (const translatedAudio of data.translatedAudios) {
      await this._broadcastTranslationEvent({
        taskId: data.taskId,
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        language: translatedAudio.targetLanguage,
        translatedAudio: translatedAudio,
        transcription: data.transcription
      }, ...);
    }
  } else {
    // Format ancien (singular) - rétrocompatibilité
    await this._broadcastTranslationEvent(data, ...);
  }
}
```

**Avantages** :
- ✅ Rétrocompatible avec ancien code
- ✅ Support des deux formats
- ✅ Pas de breaking change

### 3. `_broadcastTranslationEvent` - Safe access

**services/gateway/src/socketio/MeeshySocketIOManager.ts:1683**

```typescript
// Vérifier que translatedAudio existe
if (!data.translatedAudio) {
  logger.error(`❌ [SocketIOManager] data.translatedAudio est undefined`);
  return;
}

const translationData = {
  // ...
  language: data.language || data.translatedAudio.targetLanguage,
  translatedAudio: {
    durationMs: data.translatedAudio.durationMs || data.translatedAudio.duration || 0,
    // ...
  }
};
```

**Protections ajoutées** :
- ✅ Vérification que `translatedAudio` existe
- ✅ Safe access avec `?.` pour segments
- ✅ Fallbacks pour propriétés optionnelles
- ✅ Logs explicites en cas d'erreur

---

## Flux corrigé

### Étape 1 : Translator termine les traductions
```
Translator → MessageTranslationService
  emit('audioTranslationReady', {
    translatedAudios: [
      { targetLanguage: 'fr', url: '...', segments: [...] },
      { targetLanguage: 'en', url: '...', segments: [...] },
      { targetLanguage: 'es', url: '...', segments: [...] }
    ]
  })
```

### Étape 2 : Gateway reçoit et broadcaster
```
MeeshySocketIOManager._handleAudioTranslationReady
  ↓
  Pour chaque langue dans translatedAudios:
    _broadcastTranslationEvent({
      language: 'fr',
      translatedAudio: { url, segments, ... }
    })
    → Broadcaster à tous les clients de la conversation
```

### Étape 3 : Clients reçoivent
```
Socket.IO événement 'audioTranslationReady'
  → Notification push frontend
  → Mise à jour UI avec audio traduit
  → Segments disponibles pour lecteur audio
```

---

## Tests

### Test 1 : Envoyer un audio dans une conversation

1. **Envoyer un message audio** dans une conversation multi-langues
2. **Vérifier les logs gateway** :
```
✅ Translation ready pour message XXX, attachment YYY
   🔊 Langue: fr
   📝 Segments: 5
   📢 Diffusion traduction fr vers room conversation_xxx (3 clients)
   ✅ Traduction fr diffusée vers 3 client(s)

   🔊 Langue: en
   📝 Segments: 5
   📢 Diffusion traduction en vers room conversation_xxx (3 clients)
   ✅ Traduction en diffusée vers 3 client(s)
```

3. **Vérifier côté client** :
   - Notification reçue pour chaque langue
   - Audio traduit disponible
   - Segments affichés dans le lecteur

### Test 2 : Vérifier qu'il n'y a plus d'erreur

**Avant le fix** :
```
❌ [SocketIOManager] Erreur envoi traduction:
   TypeError: Cannot read properties of undefined (reading 'segments')
```

**Après le fix** :
```
✅ [SocketIOManager] ======== ÉVÉNEMENT TRADUCTION DIFFUSÉ ========
✅ [SocketIOManager] Traduction fr diffusée vers 3 client(s)
```

---

## Compatibilité

### Format NOUVEAU (préféré)
```typescript
{
  translatedAudios: [
    { targetLanguage: 'fr', url: '...', segments: [...] },
    { targetLanguage: 'en', url: '...', segments: [...] }
  ]
}
```

### Format ANCIEN (supporté)
```typescript
{
  language: 'fr',
  translatedAudio: { url: '...', segments: [...] }
}
```

→ **Aucun breaking change** : le code supporte les deux formats

---

## Fichiers modifiés

1. **services/gateway/src/socketio/MeeshySocketIOManager.ts**
   - `_handleAudioTranslationReady()` : Support format array
   - `_handleAudioTranslationsProgressive()` : Support dual format
   - `_handleAudioTranslationsCompleted()` : Support dual format
   - `_broadcastTranslationEvent()` : Safe access + validation

## Déploiement

1. **Redémarrer le service gateway** :
   ```bash
   cd services/gateway
   npm run dev
   ```

2. **Vérifier les logs** pour confirmer que les traductions sont diffusées correctement

3. **Tester avec un message audio** dans une conversation multi-langues

---

## Impact

- ✅ **Traductions multilingues fonctionnent** correctement
- ✅ **Notifications push** envoyées pour chaque langue
- ✅ **Segments audio** disponibles pour tous les clients
- ✅ **Logs clairs** pour debug
- ✅ **Rétrocompatible** avec ancien code
- ✅ **Pas de breaking change**
