# Diagnostic: Traductions Non Affichées dans le Frontend

## Contexte

Le Gateway détecte correctement que l'audio a été traduit :
```
[GATEWAY] 💓 Boucle d'écoute active (heartbeat 4550)
[AttachmentTranslateService] 🎤 Audio 696e9198066d60252d4ef4eb
   📝 Transcription: ✅ Existe (fr)
   ✅ Déjà traduit: [en]
   ⚡ Cache HIT - Toutes les langues déjà traduites
```

Mais le frontend n'affiche rien.

## Vérifications Effectuées

### ✅ 1. Base de Données MongoDB

**Script:** `check-translation-696e9198.js`

**Résultat:** Les traductions sont bien présentes en BD :

```json
{
  "en": {
    "type": "audio",
    "transcription": "Now, I propose that we all go to a new event...",
    "path": "/Users/smpceo/Documents/v2_meeshy/services/gateway/uploads/attachments/translated/696e9198066d60252d4ef4eb_en.mp3",
    "url": "/api/v1/attachments/file/translated/696e9198066d60252d4ef4eb_en.mp3",
    "durationMs": 9320,
    "format": "mp3",
    "cloned": false,
    "quality": 0.95,
    "voiceModelId": "696947ea46d132d2c65153ba",
    "ttsModel": "xtts",
    "createdAt": "2026-01-20T10:13:25.144Z",
    "updatedAt": "2026-01-20T10:13:25.144Z"
  }
}
```

**Note:** `deletedAt` est `null`, donc la traduction n'est PAS supprimée.

### ✅ 2. Gateway API Code

**Fichier:** `services/gateway/src/routes/conversations/messages.ts`

- **Ligne 388:** `translations: true` - Le champ JSON est bien sélectionné
- **Ligne 607:** `attachments: message.attachments` - Passé directement sans transformation

**Conclusion:** Le Gateway devrait retourner les translations dans la réponse.

### ✅ 3. Types Shared

**Fichier:** `packages/shared/types/attachment.ts` ligne 233

```typescript
readonly translations?: AttachmentTranslations;
```

Le type est bien défini et exporté.

### ✅ 4. Frontend - AudioAttachment Component

**Fichier:** `apps/web/components/attachments/AudioAttachment.tsx` lignes 58-71

```typescript
const initialTranslations = useMemo(() => {
  if (attachment.translations && Object.keys(attachment.translations).length > 0) {
    if (process.env.NODE_ENV === 'development') {
      console.log('🎵 [AudioAttachment] Traductions audio:', {
        languages: Object.keys(attachment.translations),
        details: attachment.translations
      });
    }
    return attachment.translations;
  }
  return undefined;
}, [attachment.translations]);
```

**Code:** Le composant vérifie bien `attachment.translations` et devrait logger dans la console en développement.

## Points à Vérifier

### 1. Console du Navigateur (Développement)

**Action:** Ouvrir la console du navigateur (F12 → Console) et chercher :

```
🎵 [AudioAttachment] Traductions audio:
```

**Si le log apparaît:**
- ✅ Les traductions arrivent bien au frontend
- Le problème est dans l'affichage (SimpleAudioPlayer ou useAudioTranslation)

**Si le log N'apparaît PAS:**
- ❌ Les traductions ne sont pas reçues
- Vérifier la réponse de l'API dans l'onglet Network

### 2. Network Tab (DevTools)

**Action:** Ouvrir DevTools → Network → Filtrer "messages"

**Vérifier:**
1. Requête: `GET /api/v1/conversations/696e4fb1acd8e6ae9461ad73/messages`
2. Réponse JSON → `data[].attachments[].translations`

**Si translations est `null` ou `undefined`:**
- Le problème est dans le Gateway (sérialisation Prisma)
- Vérifier les logs du Gateway

**Si translations est `{}`:**
- Le problème est que les traductions sont vides
- Vérifier pourquoi la BD a perdu les données

**Si translations contient bien `{en: {...}}`:**
- Le problème est dans le transformer frontend
- Vérifier `transformers.service.ts`

### 3. Transformer Frontend

**Fichier:** `apps/web/services/conversations/transformers.service.ts` lignes 267-269

```typescript
transcription: att.transcription as AttachmentTranscription | undefined,
translations: att.translations as AttachmentTranslations | undefined,
```

**Vérification:** S'assurer qu'il n'y a pas de transformation qui supprime les données.

### 4. SimpleAudioPlayer & useAudioTranslation

**Fichier:** `apps/web/hooks/use-audio-translation.ts` lignes 58-82

```typescript
const initialTranslatedAudios = useMemo(() => {
  if (!initialTranslations || Object.keys(initialTranslations).length === 0) {
    return [];
  }

  return Object.entries(initialTranslations).map(...)
}, [initialTranslations, attachmentId]);
```

**Vérification:**
- Si `initialTranslations` est `undefined`, l'array sera vide
- Vérifier que les traductions sont bien converties en array

## Prochaines Étapes

### Étape 1: Diagnostic Console Navigateur

```bash
# Lancer le frontend en mode développement
cd apps/web
npm run dev
```

1. Ouvrir http://localhost:3000
2. Naviguer vers la conversation `696e4fb1acd8e6ae9461ad73`
3. Ouvrir DevTools (F12) → Console
4. Chercher le message avec l'audio
5. Vérifier si le log `🎵 [AudioAttachment] Traductions audio:` apparaît

### Étape 2: Si le log N'apparaît PAS

**Vérifier la réponse API:**

1. DevTools → Network → Filtrer "messages"
2. Cliquer sur la requête `GET /api/v1/conversations/.../messages`
3. Onglet "Response" ou "Preview"
4. Naviguer vers `data[].attachments[].translations`
5. Vérifier si c'est `null`, `{}`, ou `{en: {...}}`

### Étape 3: Si translations est `null` dans l'API

**Vérifier les logs du Gateway:**

```bash
cd services/gateway
npm run dev
```

Dans les logs, chercher:
- Warnings Prisma sur le champ `translations`
- Erreurs de sérialisation JSON

**Tester manuellement la requête Prisma:**

```typescript
// Dans le Gateway, ajouter un log temporaire
console.log('📎 Attachment depuis Prisma:', JSON.stringify(message.attachments[0], null, 2));
```

### Étape 4: Si translations est `{}` dans l'API

**Possible cause:** Les données ont été supprimées de la BD

**Vérifier en MongoDB:**

```bash
node check-translation-696e9198.js
```

Si les traductions ont disparu, il faut retraduire l'audio.

### Étape 5: Si translations est bien `{en: {...}}` dans l'API

**Le problème est dans le frontend**

**Ajouter des logs dans le transformer:**

```typescript
// apps/web/services/conversations/transformers.service.ts
console.log('🔍 [Transformer] Attachment avant:', att);
console.log('🔍 [Transformer] Translations:', att.translations);
```

**Ajouter des logs dans useAudioTranslation:**

```typescript
// apps/web/hooks/use-audio-translation.ts
console.log('🎧 [useAudioTranslation] initialTranslations:', initialTranslations);
console.log('🎧 [useAudioTranslation] initialTranslatedAudios:', initialTranslatedAudios);
```

## Scripts de Test Disponibles

1. **check-translation-696e9198.js** - Vérifier en MongoDB
2. **check-segments.js** - Vérifier les segments (problème résolu séparément)
3. **test-api-translations.sh** - Tester l'API Gateway (nécessite Gateway en cours d'exécution)

## Résumé

| Composant | Status | Vérification |
|-----------|--------|--------------|
| MongoDB | ✅ OK | Traductions présentes avec deletedAt=null |
| Gateway Select | ✅ OK | `translations: true` dans Prisma select |
| Gateway Mapping | ✅ OK | Pass-through direct sans transformation |
| Types Shared | ✅ OK | `AttachmentTranslations` bien défini |
| Frontend Component | ✅ OK | Code vérifie `attachment.translations` |
| API Response | ❓ À vérifier | Via DevTools Network |
| Console Logs | ❓ À vérifier | Chercher logs AudioAttachment |

## Hypothèses

### Hypothèse 1: L'API retourne `null`
**Cause possible:** Prisma ne sérialise pas correctement le champ JSON `translations`
**Solution:** Vérifier les logs Gateway, ajouter log avant le `return`

### Hypothèse 2: L'API retourne `{}`
**Cause possible:** Les données ont été supprimées de la BD après le premier log
**Solution:** Revérifier MongoDB, retraduire si nécessaire

### Hypothèse 3: L'API retourne bien les données
**Cause possible:** Le transformer ou le hook frontend ne les traite pas
**Solution:** Ajouter des logs dans transformer et useAudioTranslation

### Hypothèse 4: Les données arrivent mais ne s'affichent pas
**Cause possible:** SimpleAudioPlayer ne gère pas l'affichage
**Solution:** Vérifier le rendu du composant avec React DevTools
