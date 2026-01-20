# Guide de Correction - Transcription Audio Non Persistée

## 🎯 Problème

La transcription audio fonctionne en temps réel via WebSocket, mais n'est pas affichée après rechargement de la page.

**Symptômes:**
- ✅ Transcription s'affiche après demande (via WebSocket)
- ❌ Transcription disparaît après rechargement de page
- ❌ Message "Timeout - la transcription prend trop de temps"
- ❌ `transcription: undefined` dans les logs

---

## 🔍 Cause Racine

Deux problèmes identifiés:

1. **Frontend:** Le transformateur ne mappe pas les champs `transcription` et `translationsJson`
2. **Backend:** L'include Prisma ne récupère peut-être pas la relation `transcription`

---

## 🛠️ Correction Étape par Étape

### Étape 1: Corriger le Transformateur Frontend (CRITIQUE)

**Fichier:** `/Users/smpceo/Documents/v2_meeshy/apps/web/services/conversations/transformers.service.ts`

**Ligne:** ~223-261 (fonction `transformAttachments`)

**Code actuel:**
```typescript
private transformAttachments(attachments: any[], messageId: string, senderId: string): Attachment[] | undefined {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return undefined;
  }

  return attachments.map((att: any): Attachment => ({
    id: String(att.id || ''),
    messageId,
    fileName: String(att.fileName || ''),
    originalName: String(att.originalName || att.fileName || ''),
    fileUrl: String(att.fileUrl || ''),
    mimeType: String(att.mimeType || ''),
    fileSize: Number(att.fileSize) || 0,
    thumbnailUrl: att.thumbnailUrl ? String(att.thumbnailUrl) : undefined,
    width: att.width ? Number(att.width) : undefined,
    height: att.height ? Number(att.height) : undefined,
    duration: att.duration ? Number(att.duration) : undefined,
    bitrate: att.bitrate ? Number(att.bitrate) : undefined,
    sampleRate: att.sampleRate ? Number(att.sampleRate) : undefined,
    codec: att.codec ? String(att.codec) : undefined,
    channels: att.channels ? Number(att.channels) : undefined,
    fps: att.fps ? Number(att.fps) : undefined,
    videoCodec: att.videoCodec ? String(att.videoCodec) : undefined,
    pageCount: att.pageCount ? Number(att.pageCount) : undefined,
    lineCount: att.lineCount ? Number(att.lineCount) : undefined,
    metadata: att.metadata || undefined,
    uploadedBy: String(att.uploadedBy || senderId),
    isAnonymous: Boolean(att.isAnonymous),
    createdAt: String(att.createdAt || new Date().toISOString()),
    isForwarded: Boolean(att.isForwarded),
    isViewOnce: Boolean(att.isViewOnce),
    viewOnceCount: Number(att.viewOnceCount) || 0,
    isBlurred: Boolean(att.isBlurred),
    viewedCount: Number(att.viewedCount) || 0,
    downloadedCount: Number(att.downloadedCount) || 0,
    consumedCount: Number(att.consumedCount) || 0,
    isEncrypted: Boolean(att.isEncrypted),
    // ❌ MANQUANT: transcription, transcriptionText, translationsJson
  }));
}
```

**Code corrigé:**
```typescript
private transformAttachments(attachments: any[], messageId: string, senderId: string): Attachment[] | undefined {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return undefined;
  }

  return attachments.map((att: any): Attachment => ({
    id: String(att.id || ''),
    messageId,
    fileName: String(att.fileName || ''),
    originalName: String(att.originalName || att.fileName || ''),
    fileUrl: String(att.fileUrl || ''),
    mimeType: String(att.mimeType || ''),
    fileSize: Number(att.fileSize) || 0,
    thumbnailUrl: att.thumbnailUrl ? String(att.thumbnailUrl) : undefined,
    width: att.width ? Number(att.width) : undefined,
    height: att.height ? Number(att.height) : undefined,
    duration: att.duration ? Number(att.duration) : undefined,
    bitrate: att.bitrate ? Number(att.bitrate) : undefined,
    sampleRate: att.sampleRate ? Number(att.sampleRate) : undefined,
    codec: att.codec ? String(att.codec) : undefined,
    channels: att.channels ? Number(att.channels) : undefined,
    fps: att.fps ? Number(att.fps) : undefined,
    videoCodec: att.videoCodec ? String(att.videoCodec) : undefined,
    pageCount: att.pageCount ? Number(att.pageCount) : undefined,
    lineCount: att.lineCount ? Number(att.lineCount) : undefined,
    metadata: att.metadata || undefined,
    uploadedBy: String(att.uploadedBy || senderId),
    isAnonymous: Boolean(att.isAnonymous),
    createdAt: String(att.createdAt || new Date().toISOString()),
    isForwarded: Boolean(att.isForwarded),
    isViewOnce: Boolean(att.isViewOnce),
    viewOnceCount: Number(att.viewOnceCount) || 0,
    isBlurred: Boolean(att.isBlurred),
    viewedCount: Number(att.viewedCount) || 0,
    downloadedCount: Number(att.downloadedCount) || 0,
    consumedCount: Number(att.consumedCount) || 0,
    isEncrypted: Boolean(att.isEncrypted),

    // ✅ CORRECTION: Ajouter les champs de transcription/traduction
    transcription: att.transcription || undefined,
    transcriptionText: att.transcriptionText ? String(att.transcriptionText) : undefined,
    translationsJson: att.translationsJson || undefined,

    // Autres champs optionnels existants
    serverCopyUrl: att.serverCopyUrl ? String(att.serverCopyUrl) : undefined,
    filePath: att.filePath ? String(att.filePath) : undefined,
    thumbnailPath: att.thumbnailPath ? String(att.thumbnailPath) : undefined,
    title: att.title ? String(att.title) : undefined,
    alt: att.alt ? String(att.alt) : undefined,
    caption: att.caption ? String(att.caption) : undefined,
    forwardedFromAttachmentId: att.forwardedFromAttachmentId ? String(att.forwardedFromAttachmentId) : undefined,
    maxViewOnceCount: att.maxViewOnceCount ? Number(att.maxViewOnceCount) : undefined,
    scanStatus: att.scanStatus as any,
    scanCompletedAt: att.scanCompletedAt ? new Date(att.scanCompletedAt) : undefined,
    moderationStatus: att.moderationStatus as any,
    moderationReason: att.moderationReason ? String(att.moderationReason) : undefined,
    deliveredToAllAt: att.deliveredToAllAt ? new Date(att.deliveredToAllAt) : undefined,
    viewedByAllAt: att.viewedByAllAt ? new Date(att.viewedByAllAt) : undefined,
    downloadedByAllAt: att.downloadedByAllAt ? new Date(att.downloadedByAllAt) : undefined,
    listenedByAllAt: att.listenedByAllAt ? new Date(att.listenedByAllAt) : undefined,
    watchedByAllAt: att.watchedByAllAt ? new Date(att.watchedByAllAt) : undefined,
    encryptionIv: att.encryptionIv ? String(att.encryptionIv) : undefined,
    encryptionAuthTag: att.encryptionAuthTag ? String(att.encryptionAuthTag) : undefined,
    encryptionHmac: att.encryptionHmac ? String(att.encryptionHmac) : undefined,
    originalFileHash: att.originalFileHash ? String(att.originalFileHash) : undefined,
    encryptedFileHash: att.encryptedFileHash ? String(att.encryptedFileHash) : undefined,
    originalFileSize: att.originalFileSize ? Number(att.originalFileSize) : undefined,
    serverKeyId: att.serverKeyId ? String(att.serverKeyId) : undefined,
    thumbnailEncryptionIv: att.thumbnailEncryptionIv ? String(att.thumbnailEncryptionIv) : undefined,
    thumbnailEncryptionAuthTag: att.thumbnailEncryptionAuthTag ? String(att.thumbnailEncryptionAuthTag) : undefined,
  }));
}
```

**Changements:**
- ✅ Ajout de `transcription: att.transcription || undefined`
- ✅ Ajout de `transcriptionText: att.transcriptionText ? String(att.transcriptionText) : undefined`
- ✅ Ajout de `translationsJson: att.translationsJson || undefined`

---

### Étape 2: Vérifier l'Include Prisma dans la Gateway

**Fichier à localiser:**
Chercher dans le projet gateway:
```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway
grep -r "findMany.*include.*attachments" src/routes/
```

**Fichier probable:** `src/routes/conversations.routes.ts` ou similaire

**Code à rechercher:**
```typescript
// Route GET /conversations/:id/messages
const messages = await prisma.message.findMany({
  where: { conversationId },
  include: {
    sender: true,
    attachments: true,  // ❌ Incomplet
    // ...
  }
});
```

**Code corrigé:**
```typescript
// Route GET /conversations/:id/messages
const messages = await prisma.message.findMany({
  where: { conversationId },
  include: {
    sender: true,
    attachments: {
      include: {
        transcription: true,  // ✅ Ajouter ceci pour inclure MessageAudioTranscription
      }
    },
    translations: true,
    replyTo: {
      include: {
        sender: true,
      }
    }
  },
  orderBy: { createdAt: 'desc' },
  take: limit,
  skip: offset,
});
```

**Changement:**
```diff
  include: {
    sender: true,
-   attachments: true,
+   attachments: {
+     include: {
+       transcription: true,
+     }
+   },
    translations: true,
  }
```

---

### Étape 3: Tester les Corrections

#### 3.1 Test Frontend (après modification du transformateur)

1. **Compiler le code:**
   ```bash
   cd /Users/smpceo/Documents/v2_meeshy/apps/web
   npm run build  # ou yarn build
   ```

2. **Redémarrer le serveur de dev:**
   ```bash
   npm run dev
   ```

3. **Tester dans le navigateur:**
   - Ouvrir la console du navigateur (F12)
   - Recharger une conversation avec un message audio ayant une transcription
   - Chercher les logs `[AudioAttachment]`
   - Vérifier que `hasTranscription: true` et `transcription` contient des données

#### 3.2 Test Backend (après modification Prisma)

1. **Vérifier la réponse API:**
   ```bash
   # Dans un terminal
   curl http://localhost:3000/api/conversations/CONVERSATION_ID/messages \
     -H "Authorization: Bearer YOUR_TOKEN" \
     | jq '.data[0].attachments[0].transcription'
   ```

   **Résultat attendu:**
   ```json
   {
     "type": "audio",
     "transcribedText": "Transcription du message audio...",
     "language": "fr",
     "confidence": 0.95,
     "model": "whisper-1"
   }
   ```

   **Résultat INCORRECT:**
   ```json
   null
   ```

2. **Logs de la gateway:**
   Chercher dans les logs:
   ```
   [Conversations] Fetching messages with transcriptions
   ```

#### 3.3 Test End-to-End

1. **Envoyer un message audio:**
   - Créer/ouvrir une conversation
   - Envoyer un message vocal

2. **Demander la transcription:**
   - Cliquer sur le bouton de transcription
   - Attendre que la transcription s'affiche (via WebSocket)

3. **Vérifier la persistance:**
   - Recharger la page (F5)
   - La transcription devrait s'afficher IMMÉDIATEMENT
   - Pas de message "Timeout"
   - Logs montrent `initialTranscription` défini

**Checklist de validation:**
- [ ] Transcription affichée après WebSocket
- [ ] Transcription toujours affichée après rechargement
- [ ] Pas de message d'erreur dans la console
- [ ] Logs montrent `attachment.transcription` défini
- [ ] Panel de transcription se développe/réduit correctement

---

### Étape 4: Ajouter des Logs de Debugging (Optionnel mais Recommandé)

**Dans le transformateur** (`transformers.service.ts`):

```typescript
private transformAttachments(attachments: any[], messageId: string, senderId: string): Attachment[] | undefined {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return undefined;
  }

  return attachments.map((att: any): Attachment => {
    // ✅ LOG DE DEBUG
    if (att.transcription) {
      console.log('📦 [Transformers] Attachment with transcription:', {
        attachmentId: att.id,
        hasTranscription: !!att.transcription,
        transcriptionType: att.transcription?.type,
        transcriptionText: att.transcription?.transcribedText?.substring(0, 50) + '...',
      });
    }

    return {
      // ... tous les champs
      transcription: att.transcription || undefined,
      transcriptionText: att.transcriptionText ? String(att.transcriptionText) : undefined,
      translationsJson: att.translationsJson || undefined,
    };
  });
}
```

**Dans AudioAttachment** (`AudioAttachment.tsx`) - déjà présent:

```typescript
console.log('🎵 [AudioAttachment] Rendu avec attachment:', {
  attachmentId: attachment.id,
  messageId: messageId || attachment.messageId,
  hasTranscription: !!attachment.transcription,
  transcription: attachment.transcription,
  hasTranslationsJson: !!attachment.translationsJson,
  translationsJsonKeys: attachment.translationsJson ? Object.keys(attachment.translationsJson) : [],
  translationsJson: attachment.translationsJson,
});
```

---

## 🧪 Validation Finale

### Scénario de Test Complet

1. **Préparation:**
   - [ ] Backend gateway en cours d'exécution
   - [ ] Frontend web en mode dev
   - [ ] Console du navigateur ouverte (F12)
   - [ ] Base de données avec au moins un message audio transcrit

2. **Test WebSocket (déjà fonctionnel):**
   - [ ] Envoyer un message audio
   - [ ] Demander la transcription
   - [ ] Vérifier que l'événement WebSocket est reçu
   - [ ] Vérifier que la transcription s'affiche
   - [ ] Logs montrent `[TranslationService] Audio translation ready`

3. **Test HTTP (à corriger):**
   - [ ] Recharger la page (F5)
   - [ ] Vérifier que la requête GET /messages inclut les transcriptions
   - [ ] Logs backend montrent `include: { transcription: true }`
   - [ ] Réponse API contient `attachment.transcription`
   - [ ] Logs frontend montrent `[Transformers] Attachment with transcription`
   - [ ] Logs frontend montrent `[AudioAttachment] hasTranscription: true`
   - [ ] La transcription s'affiche immédiatement

4. **Test de Régression:**
   - [ ] Messages sans transcription s'affichent normalement
   - [ ] Les traductions audio fonctionnent toujours
   - [ ] Aucune erreur TypeScript
   - [ ] Aucune erreur dans les logs

---

## 📝 Checklist de Déploiement

### Avant le déploiement:
- [ ] Tests locaux passent
- [ ] Pas de régression sur les messages sans transcription
- [ ] Logs de debug retirés ou mis en mode production
- [ ] Build frontend réussit sans erreurs
- [ ] Build backend réussit sans erreurs
- [ ] Tests E2E passent

### Après le déploiement:
- [ ] Monitorer les logs de production
- [ ] Vérifier que les transcriptions existantes s'affichent
- [ ] Vérifier que les nouvelles transcriptions fonctionnent
- [ ] Temps de chargement des messages acceptable
- [ ] Pas d'augmentation des erreurs 500

---

## 🚨 Rollback Plan

Si les corrections causent des problèmes:

1. **Frontend uniquement:**
   ```bash
   cd /Users/smpceo/Documents/v2_meeshy/apps/web
   git revert HEAD  # Revenir au commit précédent
   npm run build
   ```

2. **Backend uniquement:**
   ```bash
   cd /Users/smpceo/Documents/v2_meeshy/services/gateway
   git revert HEAD
   npm run build
   pm2 restart gateway  # ou équivalent
   ```

3. **Vérifications post-rollback:**
   - [ ] Application fonctionne normalement
   - [ ] Pas d'erreurs critiques
   - [ ] Communiquer le rollback à l'équipe

---

## 📊 Métriques de Succès

### Avant correction:
- ❌ Transcription persistée: 0%
- ❌ Utilisateurs doivent re-demander après rechargement
- ❌ UX dégradée

### Après correction:
- ✅ Transcription persistée: 100%
- ✅ Chargement instantané après rechargement
- ✅ UX optimale

---

## 💡 Améliorations Futures (Optionnel)

1. **Cache côté client:**
   - Utiliser React Query cache pour éviter requêtes multiples
   - Invalider le cache uniquement quand nécessaire

2. **Polling de fallback:**
   - Si WebSocket échoue, faire du polling toutes les 5s
   - Limiter à 12 tentatives (60 secondes total)

3. **Indicateur de progression:**
   - Afficher la progression de la transcription (si disponible)
   - Temps estimé restant

4. **Optimistic updates:**
   - Ajouter la transcription au cache immédiatement après requête
   - Mettre à jour avec les données réelles après WebSocket

---

**Guide créé le:** 2026-01-18
**Version:** 1.0
**Prochaine révision:** Après application des corrections
