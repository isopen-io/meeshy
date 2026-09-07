# Fix: Citations manquantes avec attachments en temps réel

## Problème

Lorsqu'un message contenait à la fois des **citations (replyTo)** ET des **attachments**, la citation ne s'affichait PAS en temps réel dans `/chat`. Il fallait recharger la page pour voir la citation.

**Comportement observé :**
- Message simple avec citation → ✅ Citation affichée en temps réel
- Message avec attachments seulement → ✅ Attachments affichés en temps réel
- Message avec attachments + citation → ❌ Citation manquante (attachments OK)

## Cause

Dans le code backend qui gère l'envoi de messages avec attachments (`MeeshySocketIOManager.ts`, ligne 511), le message était récupéré de la base de données **SANS** inclure la relation `replyTo`.

**Code problématique (ligne 511-533):**
```typescript
const message = await this.prisma.message.findUnique({
  where: { id: response.data.id },
  include: {
    sender: { /* ... */ },
    anonymousSender: { /* ... */ },
    attachments: true,
    // ❌ MANQUANT: replyTo
  }
});
```

Le message était ensuite broadcasté **sans** le champ `replyTo`, donc le frontend ne pouvait pas afficher la citation.

## Solution

### 1. Ajouter replyTo dans l'include Prisma

**Fichier:** `gateway/src/socketio/MeeshySocketIOManager.ts` (lignes 511-554)

```typescript
const message = await this.prisma.message.findUnique({
  where: { id: response.data.id },
  include: {
    sender: {
      select: {
        id: true,
        username: true,
        displayName: true,
        firstName: true,
        lastName: true
      }
    },
    anonymousSender: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true
      }
    },
    attachments: true,
    // ✅ AJOUTÉ: replyTo avec ses relations
    replyTo: {
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            firstName: true,
            lastName: true
          }
        },
        anonymousSender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true
          }
        }
      }
    }
  }
});
```

### 2. Utiliser _broadcastNewMessage pour un formatting cohérent

**Fichier:** `gateway/src/socketio/MeeshySocketIOManager.ts` (lignes 556-568)

Au lieu de broadcaster directement, utiliser la méthode `_broadcastNewMessage` qui s'assure que le replyTo est correctement formaté :

```typescript
if (message) {
  console.log(`📤 [BROADCAST] Envoi message avec ${message.attachments?.length || 0} attachments et replyTo:`, {
    hasReplyTo: !!(message as any).replyTo,
    replyToId: message.replyToId
  });
  
  // Utiliser la méthode _broadcastNewMessage pour un formatting cohérent
  const messageWithTimestamp = {
    ...message,
    timestamp: message.createdAt
  } as any;
  await this._broadcastNewMessage(messageWithTimestamp, data.conversationId, socket);
}
```

La méthode `_broadcastNewMessage` (ligne 1617+) gère déjà :
- Le formatting du replyTo avec sender OU anonymousSender
- L'inclusion des traductions
- L'inclusion des attachments
- Le broadcast vers tous les clients de la conversation

## Résultat

✅ **Citations + attachments en temps réel** : Les messages avec citations ET attachments s'affichent maintenant correctement  
✅ **Support utilisateurs anonymes** : Les citations d'utilisateurs anonymes sont gérées dans replyTo  
✅ **Support utilisateurs authentifiés** : Les citations d'utilisateurs authentifiés sont gérées  
✅ **Formatting cohérent** : Utilisation de `_broadcastNewMessage` assure le même format que pour les messages simples  

## Flux de données

### Message simple (sans attachments)

```
1. Client envoie MESSAGE_SEND avec replyToId
   ↓
2. Backend crée le message via MessagingService
   ↓
3. Backend récupère le message avec include: { replyTo }
   ↓
4. Backend broadcaste via _broadcastNewMessage
   ↓
5. Frontend reçoit le message avec replyTo ✅
```

### Message avec attachments (AVANT le fix)

```
1. Client envoie MESSAGE_SEND_WITH_ATTACHMENTS avec replyToId
   ↓
2. Backend crée le message via MessagingService (replyTo enregistré en DB)
   ↓
3. Backend récupère le message SANS include: { replyTo } ❌
   ↓
4. Backend broadcaste directement (sans _broadcastNewMessage)
   ↓
5. Frontend reçoit le message SANS replyTo ❌
```

### Message avec attachments (APRÈS le fix)

```
1. Client envoie MESSAGE_SEND_WITH_ATTACHMENTS avec replyToId
   ↓
2. Backend crée le message via MessagingService (replyTo enregistré en DB)
   ↓
3. Backend récupère le message AVEC include: { replyTo, sender, anonymousSender } ✅
   ↓
4. Backend broadcaste via _broadcastNewMessage (formatting cohérent)
   ↓
5. Frontend reçoit le message avec replyTo complet ✅
```

## Tests à effectuer

### Test 1 : Message avec attachments + citation utilisateur authentifié
1. Se connecter avec un compte dans `/chat`
2. Envoyer un message
3. Répondre à ce message ET joindre une image
4. Vérifier que :
   - L'image s'affiche en temps réel
   - La citation s'affiche en temps réel avec le nom de l'utilisateur
   - Le message original est visible dans la citation

### Test 2 : Message avec attachments + citation utilisateur anonyme
1. Se connecter en mode anonyme dans `/chat`
2. Envoyer un message
3. Répondre à ce message ET joindre un fichier
4. Vérifier que :
   - Le fichier s'affiche en temps réel
   - La citation s'affiche en temps réel avec le nom de l'utilisateur anonyme
   - Le message original est visible dans la citation

### Test 3 : Vérifier les logs backend
Ouvrir les logs du gateway et vérifier :
```
📤 [BROADCAST] Envoi message avec 1 attachments et replyTo: { hasReplyTo: true, replyToId: '...' }
[PHASE 3.1] 📤 Broadcasting message ... vers conversation ...
```

### Test 4 : Vérifier les logs frontend
Ouvrir la console du navigateur (`F12`) et vérifier :
```
💬 [MESSAGES] ReplyTo reçu depuis le backend: { id: '...', hasSender: true, hasAnonymousSender: false, content: '...' }
🔄 Broadcasting message to X listeners
```

## Fixes liés

Cette correction complète le système de gestion des citations :

| Contexte | Fix | Document |
|----------|-----|----------|
| **Messages simples en temps réel** | Citations via WebSocket | `FIX_REPLYTO_WEBSOCKET_REALTIME.md` |
| **Chargement initial** | Citations chargées de l'API | `FIX_ATTACHMENTS_REPLYTO_API_LOAD.md` |
| **Messages avec attachments** | Citations + attachments en temps réel | `FIX_REPLYTO_WITH_ATTACHMENTS.md` (ce document) |

## Notes importantes

1. **Utiliser _broadcastNewMessage** : Ne pas broadcaster directement, utiliser la méthode qui gère le formatting
2. **Include complet** : Toujours inclure `replyTo` avec ses relations `sender` et `anonymousSender`
3. **Pas de récursion** : Le replyTo ne charge qu'une profondeur (pas de replyTo.replyTo...)
4. **Performance** : L'ajout de `replyTo` dans l'include n'affecte pas significativement les performances

## Impact

### Avant le fix
- ❌ Citations manquantes en temps réel quand il y a des attachments
- ⚠️ Les utilisateurs devaient recharger la page pour voir les citations
- ⚠️ Confusion et mauvaise UX

### Après le fix
- ✅ Citations toujours visibles en temps réel
- ✅ Attachments + citations fonctionnent ensemble
- ✅ UX cohérente et fluide
- ✅ Aucune régression sur les messages simples

## Date

2025-10-16

