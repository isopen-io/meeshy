# Fix: Upload d'Attachments sur /conversations

**Date**: 2025-10-16  
**Statut**: ✅ Résolu

## 🐛 Problèmes Identifiés

### 1. Erreur "Failed to send message with attachments via Socket.IO"

**Symptôme**:
- L'upload de fichiers semblait réussir
- Le message était envoyé et affiché correctement  
- Mais un toast d'erreur s'affichait quand même

**Cause Racine**:
- Dans `frontend/hooks/use-messaging.ts`, l'appel à `socketMessaging.sendMessageWithAttachments()` incluait `conversationId` comme premier paramètre
- Or le hook `useSocketIOMessaging` retourne une version wrappée qui NE prend PAS `conversationId` (il l'ajoute lui-même)
- Les paramètres étaient décalés, causant un échec silencieux

**Solution**:
```typescript
// ❌ AVANT (incorrect - 5 paramètres)
const success = await socketMessaging.sendMessageWithAttachments(
  conversationId,  // ← Ce paramètre ne devrait PAS être là
  content, 
  attachmentIds, 
  sourceLanguage, 
  replyToId
);

// ✅ APRÈS (correct - 4 paramètres)
const success = await socketMessaging.sendMessageWithAttachments(
  content,        // conversationId est géré par le hook
  attachmentIds, 
  sourceLanguage, 
  replyToId
);
```

### 2. Erreur "logger.socketio.debug is not a function"

**Symptôme**:
```
Unhandled Promise Rejection: TypeError: undefined is not an object 
(evaluating '_utils_logger__WEBPACK_IMPORTED_MODULE_3__.logger.socketio.debug')
```

**Cause Racine**:
- Le logger dans `frontend/utils/logger.ts` ne possède PAS de propriété `socketio`
- Le code dans `frontend/services/meeshy-socketio.service.ts` utilisait `logger.socketio.debug()`

**Solution**:
```typescript
// ❌ AVANT (incorrect)
logger.socketio.debug('MeeshySocketIOService: Message...', { ... });
logger.socketio.warn('MeeshySocketIOService: Erreur...', { ... });

// ✅ APRÈS (correct)
logger.debug('[SOCKETIO]', 'Message...', { ... });
logger.warn('[SOCKETIO]', 'Erreur...', { ... });
```

### 3. Erreur "Property 'replyTo' does not exist on type 'SocketIOMessage'"

**Cause Racine**:
- Le code tentait d'accéder à `socketMessage.replyTo` alors que seul `replyToId` existe dans le type
- Le backend envoie l'ID, pas l'objet complet

**Solution**:
```typescript
// ❌ AVANT (incorrect)
if (socketMessage.replyTo) {
  console.log(`Message réponse: ${socketMessage.replyTo.id}`);
  replyTo = this.convertSocketMessageToMessage(socketMessage.replyTo);
}

// ✅ APRÈS (correct)
// Le backend envoie replyToId, pas replyTo complet
if (socketMessage.replyToId && this.getMessageByIdCallback) {
  replyTo = this.getMessageByIdCallback(socketMessage.replyToId);
  if (replyTo) {
    console.log(`Message réponse reconstitué: ${socketMessage.replyToId}`);
  }
}
```

### 4. Erreur CORP pour les Thumbnails d'Images

**Symptôme**:
```
Cancelled load to http://localhost:3000/api/attachments/file/.../thumb.png 
because it violates the resource's Cross-Origin-Resource-Policy response header.
```

**Cause**:
- Le backend ne définit pas le header `Cross-Origin-Resource-Policy` pour les thumbnails
- Les navigateurs bloquent le chargement

**Solution** (Backend - à implémenter):
```typescript
// Dans gateway/src/routes/attachments.ts
fastify.get('/attachments/file/:path*', {
  preHandler: authMiddleware
}, async (request, reply) => {
  // ...
  reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
  // ou
  reply.header('Cross-Origin-Resource-Policy', 'same-site');
  return reply.sendFile(filename);
});
```

## 📝 Fichiers Modifiés

| Fichier | Changement |
|---------|-----------|
| `frontend/hooks/use-messaging.ts` | ✅ Retiré `conversationId` de l'appel à `sendMessageWithAttachments` |
| `frontend/services/meeshy-socketio.service.ts` | ✅ Remplacé `logger.socketio.*` par `logger.*` |
| `frontend/services/meeshy-socketio.service.ts` | ✅ Corrigé `socketMessage.replyTo` → `socketMessage.replyToId` |
| `frontend/services/meeshy-socketio.service.ts` | ✅ Retiré la propriété `attachments` non existante |

## 🧪 Tests à Effectuer

### Upload de Fichiers sur /conversations

1. Se connecter en tant qu'utilisateur authentifié
2. Aller sur `/conversations/[id]`
3. Cliquer sur l'icône 📎 (trombone)
4. Sélectionner un fichier (image, document, etc.)
5. **Vérifier** :
   - ✅ Upload réussi (pas d'erreur)
   - ✅ Fichier affiché dans le carrousel
   - ✅ Message envoyé avec le fichier
   - ✅ Aucun toast d'erreur
   - ✅ Fichier visible dans le message reçu

### Upload sur /chat (Anonyme)

1. Aller sur `/join/[linkId]`
2. Rejoindre en tant qu'anonyme
3. Être redirigé vers `/chat/[linkId]`
4. Répéter les tests ci-dessus

### Upload sur / (Page Principale)

1. Se connecter
2. Aller sur la page principale `/`
3. Répéter les tests ci-dessus

## ✅ Problème CORP Résolu

Le backend a été mis à jour pour ajouter les headers CORS/CORP appropriés.

**Fichier modifié**: `gateway/src/routes/attachments.ts`

**Headers ajoutés sur toutes les routes de fichiers**:
```typescript
// Headers CORS/CORP pour permettre le chargement cross-origin
reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
reply.header('Access-Control-Allow-Origin', '*');
reply.header('Cache-Control', 'public, max-age=31536000, immutable');
```

**Routes mises à jour**:
- ✅ `GET /attachments/:attachmentId` - Fichiers originaux
- ✅ `GET /attachments/:attachmentId/thumbnail` - Miniatures
- ✅ `GET /attachments/file/*` - Fichiers par chemin

## ✅ Architecture Vérifiée

L'architecture d'upload est maintenant cohérente :

```
MessageComposer (composant UI)
  ↓ utilise
AttachmentService (upload vers API)
  ↓ utilise
createAuthHeaders() (gestion auth unifiée)
  ↓ envoie vers
Gateway API (/api/attachments/upload)
  ↓ retourne IDs
  
MessageComposer passe les IDs au parent
  ↓
Parent appelle sendMessageWithAttachments
  ↓
useMessaging.sendMessageWithAttachments(content, ids, lang, replyId)
  ↓
useSocketIOMessaging.sendMessageWithAttachments(content, ids, lang, replyId)
  ↓ ajoute conversationId
MeeshySocketIOService.sendMessageWithAttachments(conversationId, content, ids, lang, replyId)
  ↓ émet événement WebSocket
Backend reçoit et traite le message
```

## 📚 Documentation Associée

- `frontend/components/README-COMPOSANTS-REUSABLES.md` - Architecture des composants réutilisables
- `frontend/utils/token-utils.ts` - Gestion unifiée des tokens
- `gateway/src/middleware/auth.ts` - Authentification unifiée backend

---

**Testé sur**: /conversations  
**Prochaine étape**: Implémenter le fix CORP pour les thumbnails dans le backend

