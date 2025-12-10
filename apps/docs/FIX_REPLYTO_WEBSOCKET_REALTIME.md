# Fix: Citations (replyTo) manquantes en temps réel via WebSocket

## Problème

Dans `/chat`, les citations (replyTo) n'apparaissaient pas quand les messages étaient reçus en temps réel via WebSocket. Les citations fonctionnaient uniquement lors du chargement initial des messages via l'API.

## Cause

Le service `meeshy-socketio.service.ts` ne vérifiait **pas** si le backend envoyait déjà l'objet `replyTo` complet dans le payload WebSocket. Il essayait uniquement de le reconstituer depuis la liste locale des messages via un callback.

**Code problématique (lignes 671-684):**
```typescript
// Le backend envoie replyToId, pas replyTo complet ❌ FAUX!
if (socketMessage.replyToId && this.getMessageByIdCallback) {
  // Reconstituer depuis la liste locale
  replyTo = this.getMessageByIdCallback(socketMessage.replyToId);
}
```

**Ce que le backend envoie réellement:**

Le backend (`gateway/src/socketio/MeeshySocketIOManager.ts`, lignes 1697-1721) envoie l'objet `replyTo` **complet** dans le payload :
```typescript
replyTo: (message as any).replyTo ? {
  id: (message as any).replyTo.id,
  conversationId: (message as any).replyTo.conversationId,
  senderId: (message as any).replyTo.senderId || undefined,
  anonymousSenderId: (message as any).replyTo.anonymousSenderId || undefined,
  content: (message as any).replyTo.content,
  originalLanguage: (message as any).replyTo.originalLanguage || 'fr',
  messageType: (message as any).replyTo.messageType || 'text',
  createdAt: (message as any).replyTo.createdAt || new Date(),
  sender: (message as any).replyTo.sender ? { /* ... */ } : undefined,
  anonymousSender: (message as any).replyTo.anonymousSender ? { /* ... */ } : undefined
} : undefined
```

## Solution

Modifier la logique pour **d'abord vérifier** si `socketMessage.replyTo` existe, puis le transformer correctement.

**Fichier:** `frontend/services/meeshy-socketio.service.ts` (lignes 668-792)

### Nouvelle logique en 3 étapes

#### 1. Vérifier si le backend envoie déjà replyTo complet

```typescript
// 1. D'abord vérifier si le backend envoie déjà replyTo complet
if ((socketMessage as any).replyTo) {
  const replyToMsg = (socketMessage as any).replyTo;
  const replyToSender = replyToMsg.sender;
  const replyToAnonymousSender = replyToMsg.anonymousSender;
  
  console.log(`💬 [MESSAGES] ReplyTo reçu depuis le backend:`, {
    id: replyToMsg.id,
    hasSender: !!replyToSender,
    hasAnonymousSender: !!replyToAnonymousSender,
    content: replyToMsg.content?.substring(0, 30) + '...'
  });
  
  // Transformer replyTo...
}
```

#### 2. Gérer les utilisateurs authentifiés ET anonymes dans replyTo

```typescript
// Construire le sender pour replyTo (gérer utilisateurs authentifiés ET anonymes)
let replyToFinalSender;
if (replyToSender) {
  // Utilisateur authentifié
  replyToFinalSender = {
    id: String(replyToSender.id || 'unknown'),
    username: String(replyToSender.username || 'Unknown'),
    displayName: String(replyToSender.displayName || replyToSender.username || 'Unknown'),
    firstName: String(replyToSender.firstName || ''),
    lastName: String(replyToSender.lastName || ''),
    // ... autres champs
  };
} else if (replyToAnonymousSender) {
  // Utilisateur anonyme
  const displayName = `${String(replyToAnonymousSender.firstName || '')} ${String(replyToAnonymousSender.lastName || '')}`.trim() || 
                     String(replyToAnonymousSender.username) || 
                     'Utilisateur anonyme';
  replyToFinalSender = {
    id: String(replyToAnonymousSender.id || 'unknown'),
    username: String(replyToAnonymousSender.username || 'Anonymous'),
    displayName: displayName,
    // ... autres champs
  };
} else {
  // Fallback
  replyToFinalSender = { /* valeurs par défaut */ };
}
```

#### 3. Construire l'objet replyTo complet

```typescript
replyTo = {
  id: String(replyToMsg.id),
  content: String(replyToMsg.content),
  senderId: String(replyToMsg.senderId || replyToMsg.anonymousSenderId || ''),
  conversationId: String(replyToMsg.conversationId),
  originalLanguage: String(replyToMsg.originalLanguage || 'fr'),
  messageType: String(replyToMsg.messageType || 'text') as any,
  createdAt: new Date(replyToMsg.createdAt),
  timestamp: new Date(replyToMsg.createdAt),
  sender: replyToFinalSender,
  translations: [],
  isEdited: false,
  isDeleted: false,
  updatedAt: new Date(replyToMsg.updatedAt || replyToMsg.createdAt),
};
```

#### 4. Fallback sur la liste locale si replyTo n'est pas dans le payload

```typescript
// 2. Sinon, essayer de reconstituer depuis la liste locale
else if (socketMessage.replyToId && this.getMessageByIdCallback) {
  replyTo = this.getMessageByIdCallback(socketMessage.replyToId);
  if (replyTo) {
    console.log(`💬 [MESSAGES] Message réponse reconstitué depuis la liste locale`);
  } else {
    console.warn(`⚠️ [MESSAGES] Message non trouvé dans la liste pour replyTo`);
  }
}
```

## Résultat

✅ **Citations en temps réel** : Les citations apparaissent maintenant quand les messages sont reçus via WebSocket  
✅ **Support utilisateurs anonymes** : Les citations affichent correctement le nom des utilisateurs anonymes  
✅ **Support utilisateurs authentifiés** : Les citations affichent correctement le nom des utilisateurs authentifiés  
✅ **Fallback robuste** : Si le backend n'envoie pas replyTo, le frontend essaie de le reconstituer depuis la liste locale  
✅ **Logs de debug** : Des logs sont ajoutés pour faciliter le débogage  

## Tests à effectuer

1. **Test citation utilisateur authentifié** :
   - Se connecter avec un compte
   - Envoyer un message dans `/chat`
   - Répondre au message (citation)
   - Vérifier que la citation s'affiche en temps réel

2. **Test citation utilisateur anonyme** :
   - Se connecter en mode anonyme dans `/chat`
   - Envoyer un message
   - Répondre au message (citation)
   - Vérifier que la citation s'affiche avec le nom de l'utilisateur anonyme

3. **Test citation mixte** :
   - Utilisateur authentifié répond à utilisateur anonyme
   - Utilisateur anonyme répond à utilisateur authentifié
   - Vérifier que les noms s'affichent correctement dans les deux cas

4. **Test logs de debug** :
   - Ouvrir la console du navigateur
   - Envoyer une réponse
   - Vérifier les logs : `💬 [MESSAGES] ReplyTo reçu depuis le backend: ...`

## Différence avec conversations.service.ts

Le service `conversations.service.ts` charge les messages via l'API REST lors du chargement initial. Il transforme également les replyTo mais depuis les données de l'API (même logique, différente source).

Le service `meeshy-socketio.service.ts` gère les messages reçus en temps réel via WebSocket. C'est ce service qui avait le problème corrigé dans ce fix.

## Date

2025-10-16

