# Fix: Attachments et citations manquants au chargement initial dans /chat

## Problème

Dans `/chat`, lors du chargement initial des messages via l'API, les **attachments** et les **citations (replyTo)** n'étaient pas présents. Les utilisateurs ne voyaient donc pas :
- Les images/fichiers joints aux messages
- Le contexte des messages cités (réponses)

## Cause

L'endpoint backend `/links/:identifier/messages` (utilisé pour charger les messages des utilisateurs anonymes) ne chargeait **PAS** les relations `attachments` et `replyTo` depuis la base de données Prisma.

**Code problématique dans `gateway/src/routes/links.ts` (lignes 1054-1090):**

```typescript
const messages = await fastify.prisma.message.findMany({
  where: { 
    conversationId: shareLink.conversationId,
    isDeleted: false
  },
  include: {
    sender: { /* ... */ },
    anonymousSender: { /* ... */ },
    status: { /* ... */ }
    // ❌ Manquant: attachments
    // ❌ Manquant: replyTo
  }
});
```

Les messages étaient ensuite formatés et retournés **sans** les champs `attachments` et `replyTo` (lignes 1101-1131).

## Solution

### 1. Ajouter les relations dans la requête Prisma

**Fichier:** `gateway/src/routes/links.ts` (lignes 1054-1114)

```typescript
const messages = await fastify.prisma.message.findMany({
  where: { 
    conversationId: shareLink.conversationId,
    isDeleted: false
  },
  orderBy: { createdAt: 'desc' },
  take: parseInt(limit),
  skip: parseInt(offset),
  include: {
    sender: { /* ... */ },
    anonymousSender: { /* ... */ },
    // ✅ AJOUTÉ: Charger les attachments
    attachments: true,
    // ✅ AJOUTÉ: Charger replyTo avec ses relations
    replyTo: {
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            displayName: true,
            avatar: true
          }
        },
        anonymousSender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            language: true
          }
        }
      }
    },
    status: { /* ... */ }
  }
});
```

### 2. Inclure les champs dans la réponse formatée

**Fichier:** `gateway/src/routes/links.ts` (lignes 1125-1180)

```typescript
const formattedMessages = messages.map(message => ({
  id: message.id,
  content: message.content,
  // ... autres champs de base ...
  sender: message.sender ? { /* ... */ } : null,
  anonymousSender: message.anonymousSender ? { /* ... */ } : null,
  
  // ✅ AJOUTÉ: Inclure les attachments
  attachments: (message as any).attachments || [],
  
  // ✅ AJOUTÉ: Inclure replyTo complet
  replyTo: (message as any).replyTo ? {
    id: (message as any).replyTo.id,
    content: (message as any).replyTo.content,
    originalLanguage: (message as any).replyTo.originalLanguage || 'fr',
    messageType: (message as any).replyTo.messageType,
    createdAt: (message as any).replyTo.createdAt,
    sender: (message as any).replyTo.sender ? {
      id: (message as any).replyTo.sender.id,
      username: (message as any).replyTo.sender.username,
      firstName: (message as any).replyTo.sender.firstName,
      lastName: (message as any).replyTo.sender.lastName,
      displayName: (message as any).replyTo.sender.displayName,
      avatar: (message as any).replyTo.sender.avatar
    } : null,
    anonymousSender: (message as any).replyTo.anonymousSender ? {
      id: (message as any).replyTo.anonymousSender.id,
      username: (message as any).replyTo.anonymousSender.username,
      firstName: (message as any).replyTo.anonymousSender.firstName,
      lastName: (message as any).replyTo.anonymousSender.lastName,
      language: (message as any).replyTo.anonymousSender.language
    } : null
  } : null
}));
```

## Résultat

✅ **Attachments au chargement** : Les images, documents et fichiers sont maintenant visibles dès le chargement initial  
✅ **Citations au chargement** : Le contexte des messages cités est visible dès le chargement initial  
✅ **Support utilisateurs anonymes** : Les citations affichent correctement le nom des utilisateurs anonymes  
✅ **Support utilisateurs authentifiés** : Les citations affichent correctement le nom des utilisateurs authentifiés  
✅ **Pas de récursion** : Le replyTo ne charge qu'une profondeur (pas de replyTo.replyTo...)  

## Flux complet des corrections

Ce fix complète les corrections précédentes pour avoir un système complet :

| Contexte | Fix | Document |
|----------|-----|----------|
| **Temps réel WebSocket** | Messages reçus en direct avec replyTo | `FIX_REPLYTO_WEBSOCKET_REALTIME.md` |
| **Chargement API** | Messages chargés au démarrage avec attachments + replyTo | `FIX_ATTACHMENTS_REPLYTO_API_LOAD.md` (ce document) |
| **Transformation frontend** | Conversion des données backend vers frontend | `FIX_ATTACHMENTS_REPLYTO_RESTORATION.md` |
| **Utilisateurs anonymes** | Noms affichés correctement | `FIX_ANONYMOUS_USER_DISPLAY.md` |

## Tests à effectuer

### 1. Test attachments au chargement
1. Envoyer un message avec une image dans `/chat`
2. Recharger la page `/chat`
3. Vérifier que l'image s'affiche dès le chargement

### 2. Test citations au chargement
1. Envoyer un message dans `/chat`
2. Répondre à ce message (créer une citation)
3. Recharger la page `/chat`
4. Vérifier que la citation s'affiche avec le contexte du message original

### 3. Test utilisateur anonyme dans citations
1. Se connecter en mode anonyme
2. Envoyer un message et y répondre
3. Recharger la page
4. Vérifier que les noms des utilisateurs anonymes sont affichés dans les citations

### 4. Vérifier les logs backend
Si vous avez activé les logs détaillés, vous devriez voir :
```
Chargement messages pour conversation: xxx
Include: sender, anonymousSender, attachments, replyTo
Messages chargés: X messages avec attachments et replyTo
```

## Endpoint concerné

**Endpoint:** `GET /api/links/:identifier/messages`

**Utilisé par:**
- Utilisateurs anonymes dans `/chat/:id`
- Chargement initial des messages via `use-conversation-messages` hook

**Paramètres:**
- `identifier` : linkId (format `mshy_xxx`) ou conversationShareLinkId (ObjectId)
- `limit` : nombre de messages à charger (défaut: 50)
- `offset` : offset pour la pagination (défaut: 0)

**Headers requis:**
- `X-Session-Token` : token de session anonyme (stocké dans localStorage)

## Impact

### Avant le fix
- ❌ Messages sans images/fichiers au chargement
- ❌ Citations sans contexte au chargement
- ⚠️ Les utilisateurs devaient attendre les nouveaux messages en temps réel pour voir les attachments/citations

### Après le fix
- ✅ Tous les messages chargés avec leurs attachments
- ✅ Toutes les citations avec leur contexte complet
- ✅ Expérience utilisateur cohérente dès le chargement

## Date

2025-10-16

