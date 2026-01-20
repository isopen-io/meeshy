# Bugs trouvés et fixés - Traductions audio

## Problème initial

Le frontend ne recevait/n'affichait pas les traductions audio en temps réel malgré que :
- ✅ Le backend traite correctement les jobs
- ✅ L'événement Socket.IO est émis
- ✅ 1 client est connecté dans la room

## Bugs identifiés et corrigés

### 1. ❌ **Erreur au démarrage du serveur**

**Erreur** :
```
TypeError: (0, import_logger_enhanced.createLogger) is not a function
```

**Cause** : `MultiLevelCache.ts` utilisait un import incorrect du logger.

**Fix** (`services/gateway/src/services/MultiLevelCache.ts:14-16`) :
```typescript
// ❌ AVANT (cassé)
import { createLogger } from '../utils/logger-enhanced';
const logger = createLogger('MultiLevelCache');

// ✅ APRÈS (fixé)
import { enhancedLogger } from '../utils/logger-enhanced';
const logger = enhancedLogger.child({ module: 'MultiLevelCache' });
```

---

### 2. ❌ **Traductions audio non sauvegardées en base**

**Cause** : `_handleVoiceTranslationCompleted()` émettait l'événement Socket.IO mais ne sauvegardait **rien** en base de données.

**Impact** : Frontend recevait les traductions en temps réel, mais un refresh = données perdues.

**Fix** (`services/gateway/src/services/message-translation/MessageTranslationService.ts:1126-1234`) :

Ajout de la sauvegarde complète :
```typescript
// 1. Vérifier l'attachment
const attachment = await this.prisma.messageAttachment.findUnique({...});

// 2. Sauvegarder transcription → MessageAudioTranscription
await this.prisma.messageAudioTranscription.upsert({...});

// 3. Sauvegarder les fichiers audio localement
if (translation.audioBase64) {
  const audioBuffer = Buffer.from(translation.audioBase64, 'base64');
  await fs.writeFile(localAudioPath, audioBuffer);
}

// 4. Sauvegarder en base → MessageTranslatedAudio
const savedAudio = await this.prisma.messageTranslatedAudio.upsert({...});

// 5. Ajouter l'ID dans les données envoyées
savedTranslatedAudios.push({
  id: savedAudio.id, // ← Nouveau !
  targetLanguage: translation.targetLanguage,
  ...
});

// 6. Émettre événement Socket.IO
this.emit('audioTranslationReady', {...});
```

**Résultat** : Les traductions audio sont maintenant **persistées** en base.

---

### 3. ❌ **Champ `id` manquant dans les données envoyées**

**Cause** : Le type `TranslatedAudioData` requiert un champ `id: string` obligatoire, mais le backend ne l'envoyait pas.

**Fix** :
- Dans `_handleVoiceTranslationCompleted` (ligne 1224)
- Dans `_handleAudioProcessCompleted` (ligne 826)

```typescript
// ❌ AVANT
savedTranslatedAudios.push({
  targetLanguage: translation.targetLanguage,
  translatedText: translation.translatedText,
  audioUrl: localAudioUrl,
  ...
});

// ✅ APRÈS
const savedAudio = await this.prisma.messageTranslatedAudio.upsert({...});

savedTranslatedAudios.push({
  id: savedAudio.id, // ← ID récupéré depuis la base
  targetLanguage: translation.targetLanguage,
  translatedText: translation.translatedText,
  audioUrl: localAudioUrl,
  ...
});
```

**Résultat** : Les données envoyées sont maintenant conformes au type `TranslatedAudioData`.

---

### 4. ❌ **Hook frontend utilise mauvais nom de champ**

**Cause** : Le hook `use-audio-translation.ts` cherchait `t.language` alors que le type utilise `t.targetLanguage`.

**Fix** (`apps/web/hooks/use-audio-translation.ts:121`) :
```typescript
// ❌ AVANT (ne trouvait jamais l'audio traduit)
const translatedAudio = translatedAudios.find(t => t.language === selectedLanguage);

// ✅ APRÈS (trouve correctement)
const translatedAudio = translatedAudios.find(t => t.targetLanguage === selectedLanguage);
```

**Résultat** : Le hook peut maintenant trouver les traductions audio et mettre à jour l'interface.

---

## Résumé des changements

### Backend (`services/gateway/`)

| Fichier | Ligne | Changement |
|---------|-------|-----------|
| `services/MultiLevelCache.ts` | 14-16 | Fix import logger |
| `services/message-translation/MessageTranslationService.ts` | 1126-1234 | Ajout sauvegarde complète en base |
| `services/message-translation/MessageTranslationService.ts` | 1224 | Ajout champ `id` (voice translation) |
| `services/message-translation/MessageTranslationService.ts` | 826 | Ajout champ `id` (audio process) |

### Frontend (`apps/web/`)

| Fichier | Ligne | Changement |
|---------|-------|-----------|
| `hooks/use-audio-translation.ts` | 121 | Fix `t.language` → `t.targetLanguage` |

---

## Flux complet (après les fix)

```
1. Frontend → POST /api/attachments/:id/translate
   ↓
2. AttachmentTranslateService.translateAudio()
   ↓
3. audioTranslateService.translateAsync() → ZMQ: voice_translate_async
   ↓
4. jobMappingCache.saveJobMapping(jobId, {messageId, attachmentId, conversationId})
   - Cache multi-niveau : Mémoire 30min + Redis 1h (optionnel)

5. Backend Translator → traite le job → ZMQ: voice_translation_completed
   ↓
6. MessageTranslationService._handleVoiceTranslationCompleted()
   ↓
7. jobMappingCache.getAndDeleteJobMapping(jobId) → récupère métadonnées
   ↓
8. ✅ Vérifier attachment existe
   ↓
9. ✅ Sauvegarder transcription → MessageAudioTranscription (BASE)
   ↓
10. ✅ Sauvegarder fichiers audio → uploads/attachments/translated/
   ↓
11. ✅ Sauvegarder traductions → MessageTranslatedAudio (BASE)
    - Récupérer ID de l'entrée créée
   ↓
12. ✅ Émettre audioTranslationReady → Socket.IO
    - Données incluent id, targetLanguage (pas language)
    - Room: conversation_{conversationId}
   ↓
13. Frontend : Hook use-audio-translation
    - Écoute l'événement audio:translation-ready
    - Filtre par attachmentId
    - Met à jour transcription + translatedAudios
    - Trouve audio traduit via targetLanguage ✅
   ↓
14. ✅ Interface mise à jour avec transcription + audios traduits
```

---

## Tests à effectuer

### Test 1 : Traduction audio complète
1. Envoyer un message vocal dans une conversation
2. Cliquer sur "Traduire" dans le player audio
3. ✅ Vérifier que la transcription s'affiche
4. ✅ Vérifier que les audios traduits apparaissent
5. ✅ Vérifier que les sélecteurs de langue fonctionnent
6. ✅ Refresh la page → traductions toujours présentes (persistées)

### Test 2 : Cache multi-niveau
1. Tester AVEC Redis configuré
   - Les jobs doivent être sauvegardés dans Redis
   - Logs : `✅ [JobMapping] Valeur trouvée et supprimée dans Redis`
2. Tester SANS Redis (commenter REDIS_URL dans .env)
   - Les jobs doivent être sauvegardés en mémoire seulement
   - Logs : `✅ [JobMapping] Valeur trouvée et supprimée en mémoire`
   - Le flux doit fonctionner identiquement

### Test 3 : Événements Socket.IO
1. Ouvrir console développeur frontend
2. Filtrer sur "audio:translation-ready"
3. Envoyer une traduction
4. ✅ Vérifier que l'événement est reçu
5. ✅ Vérifier que data.translatedAudios[0].targetLanguage existe
6. ✅ Vérifier que data.translatedAudios[0].id existe

---

## Prochaines étapes

1. ✅ Relancer le backend
2. ✅ Relancer le frontend
3. ✅ Tester une traduction audio complète
4. ✅ Vérifier les logs backend + frontend
5. ✅ Confirmer que l'interface s'affiche correctement

Si le problème persiste, vérifier :
- Console navigateur pour erreurs JS
- Logs frontend `[TranslationService] Audio translation ready`
- État du hook `use-audio-translation` (React DevTools)
