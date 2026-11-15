# Correction : Attachments et ReplyTo manquants dans les messages WebSocket

**Date** : 16 octobre 2025  
**Branche** : `feature/selective-improvements`  
**Commits** : À créer après validation

---

## 🔴 Problème Identifié

### Symptômes
```
[Log] 📨 MeeshySocketIOService: Nouveau message reçu
  messageId: "68f0c6d777f61766dab53adb"
  conversationId: "meeshy"
  senderId: "68bc64071c7181d556cefce8"
  replyToId: undefined    ← Devrait contenir l'ID si réponse
  content: "To be sent..."
```

**Comportement observé** :
1. ✅ Upload d'attachments réussit (backend reçoit les fichiers)
2. ✅ Message envoyé avec succès via WebSocket
3. ❌ Message reçu SANS `attachments[]` (tableau vide)
4. ❌ Message reçu SANS objet `replyTo` complet (seulement `replyToId`)
5. ❌ Frontend ne peut pas afficher les pièces jointes
6. ❌ Frontend ne peut pas afficher le message cité

### Analyse Technique

#### 1. Backend (Gateway) - Données Prisma disponibles mais non diffusées
**Fichier** : `gateway/src/socketio/MeeshySocketIOManager.ts` (ligne 296-316)

```typescript
// ✅ BIEN : Le backend récupère les données depuis Prisma
const message = await this.prisma.message.findUnique({
  where: { id: response.data.id },
  include: {
    sender: { ... },
    anonymousSender: { ... },
    attachments: true,  // ✅ Attachments récupérés
    // ❌ MANQUE : replyTo n'était pas inclus
  }
});
```

**Problème** : Le `messagePayload` broadcasté ne contenait PAS :
- ❌ Le tableau `attachments[]`
- ❌ L'objet `replyTo` complet (seulement `replyToId`)

#### 2. Frontend - Types incomplets
**Fichiers concernés** :
- `frontend/shared/types/socketio-events.ts`
- `frontend/shared/types/socketio-events.d.ts`
- `frontend/shared/types/conversation.ts`
- `frontend/shared/types/message-types.d.ts`

```typescript
// ❌ AVANT : Types incomplets
export interface SocketIOMessage {
  id: string;
  // ...
  replyToId?: string;  // ✅ ID présent
  // ❌ MANQUE : replyTo object complet
  // ❌ MANQUE : attachments array
}

export interface Message {
  // ...
  replyTo?: Message;  // ✅ Type déclaré
  // ❌ MANQUE : attachments array
}
```

#### 3. Frontend - Conversion incomplet
**Fichier** : `frontend/services/meeshy-socketio.service.ts` (ligne 867-925)

```typescript
// ❌ AVANT : Ne traitait PAS les attachments du backend
private convertSocketMessageToMessage(socketMessage: SocketIOMessage): Message {
  return {
    id: socketMessage.id,
    // ...
    replyTo: replyTo,  // ✅ Reconstitué localement
    // ❌ MANQUE : attachments depuis socketMessage
  };
}
```

---

## ✅ Solution Implémentée

### 1. Backend - Inclure `replyTo` et `attachments` dans le payload WebSocket

#### Modification 1 : Requête Prisma avec `replyTo`
**Fichier** : `gateway/src/socketio/MeeshySocketIOManager.ts` (ligne 296-340)

```typescript
// ✅ APRÈS : Inclure replyTo avec sender et anonymousSender
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
    replyTo: {                    // ✅ NOUVEAU : Inclure message de réponse
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

#### Modification 2 : Payload WebSocket avec `attachments` et `replyTo`
**Fichier** : `gateway/src/socketio/MeeshySocketIOManager.ts` (ligne 1636-1700)

```typescript
// ✅ APRÈS : Inclure attachments et replyTo dans le payload
const messagePayload = {
  id: message.id,
  conversationId: conversationId,
  senderId: message.senderId || undefined,
  content: message.content,
  originalLanguage: message.originalLanguage || 'fr',
  messageType: message.messageType || 'text',
  isEdited: Boolean(message.isEdited),
  isDeleted: Boolean(message.isDeleted),
  createdAt: message.createdAt || new Date(),
  updatedAt: message.updatedAt || new Date(),
  translations: messageTranslations,
  sender: message.sender ? { ... } : undefined,
  
  // ✅ NOUVEAU : Inclure les attachments
  attachments: (message as any).attachments || [],
  
  // ✅ NOUVEAU : Inclure l'objet replyTo complet ET replyToId
  replyToId: message.replyToId || undefined,
  replyTo: (message as any).replyTo ? {
    id: (message as any).replyTo.id,
    conversationId: (message as any).replyTo.conversationId,
    senderId: (message as any).replyTo.senderId || undefined,
    anonymousSenderId: (message as any).replyTo.anonymousSenderId || undefined,
    content: (message as any).replyTo.content,
    originalLanguage: (message as any).replyTo.originalLanguage || 'fr',
    messageType: (message as any).replyTo.messageType || 'text',
    createdAt: (message as any).replyTo.createdAt || new Date(),
    sender: (message as any).replyTo.sender ? {
      id: (message as any).replyTo.sender.id,
      username: (message as any).replyTo.sender.username,
      firstName: (message as any).replyTo.sender.firstName || '',
      lastName: (message as any).replyTo.sender.lastName || '',
      displayName: (message as any).replyTo.sender.displayName || (message as any).replyTo.sender.username,
    } : undefined,
    anonymousSender: (message as any).replyTo.anonymousSender ? {
      id: (message as any).replyTo.anonymousSender.id,
      username: (message as any).replyTo.anonymousSender.username,
      firstName: (message as any).replyTo.anonymousSender.firstName,
      lastName: (message as any).replyTo.anonymousSender.lastName,
    } : undefined
  } : undefined,
  
  meta: {
    conversationStats: updatedStats
  }
};
```

**Détails techniques** :
- `attachments` : Tableau complet des pièces jointes (id, fileName, mimeType, fileUrl, etc.)
- `replyTo` : Objet message complet avec sender/anonymousSender simplifié
- `replyToId` : Conservé pour compatibilité backend

---

### 2. Frontend - Mise à jour des types TypeScript

#### Modification 3 : Type `SocketIOMessage`
**Fichiers** :
- `frontend/shared/types/socketio-events.ts`
- `frontend/shared/types/socketio-events.d.ts`

```typescript
// ✅ APRÈS : Types complets avec attachments et replyTo
export interface SocketIOMessage {
  id: string;
  conversationId: string;
  senderId?: string;
  anonymousSenderId?: string;
  content: string;
  originalLanguage: string;
  messageType: MessageType;
  isEdited?: boolean;
  isDeleted?: boolean;
  editedAt?: Date;
  deletedAt?: Date;
  replyToId?: string;
  replyTo?: SocketIOMessage;  // ✅ NOUVEAU : Objet message complet
  createdAt: Date;
  updatedAt?: Date;
  sender?: SocketIOUser | AnonymousParticipant;
  
  // ✅ NOUVEAU : Attachments du message
  attachments?: Array<{
    id: string;
    fileName: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    fileUrl: string;
    thumbnailUrl?: string;
    fileType: 'image' | 'video' | 'audio' | 'document' | 'other';
    metadata?: any;
    createdAt: Date;
  }>;
}
```

#### Modification 4 : Type `Message` et `GatewayMessage`
**Fichiers** :
- `frontend/shared/types/conversation.ts`
- `frontend/shared/types/message-types.d.ts`

```typescript
// ✅ APRÈS : Message avec attachments
export interface Message {
  id: string;
  conversationId: string;
  senderId?: string;
  anonymousSenderId?: string;
  content: string;
  originalLanguage: string;
  messageType: MessageType;
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  replyToId?: string;
  replyTo?: Message;
  
  // ✅ NOUVEAU : Pièces jointes
  attachments?: Array<{
    id: string;
    fileName: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    fileUrl: string;
    thumbnailUrl?: string;
    fileType: 'image' | 'video' | 'audio' | 'document' | 'other';
    metadata?: any;
    createdAt: Date;
  }>;
  
  createdAt: Date;
  updatedAt?: Date;
  sender?: User | AnonymousParticipant;
  translations: MessageTranslation[];
  timestamp: Date;
  anonymousSender?: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    language: string;
    isMeeshyer: boolean;
  };
}
```

**Même structure pour `GatewayMessage`** (utilisé par l'API REST).

---

### 3. Frontend - Traitement dans `convertSocketMessageToMessage()`

#### Modification 5 : Conversion complète avec `replyTo` et `attachments`
**Fichier** : `frontend/services/meeshy-socketio.service.ts` (ligne 867-925)

```typescript
// ✅ APRÈS : Conversion complète avec tous les champs
private convertSocketMessageToMessage(socketMessage: SocketIOMessage): Message {
  // CORRECTION CRITIQUE: Utiliser replyTo depuis le backend si disponible
  // Sinon fallback sur la reconstitution depuis le cache local
  let replyTo: Message | undefined = undefined;
  
  if (socketMessage.replyTo) {
    // Le backend a fourni l'objet complet replyTo
    console.log(`💬 [MESSAGES] Message réponse fourni par le backend: ${socketMessage.replyTo.id}`);
    replyTo = this.convertSocketMessageToMessage(socketMessage.replyTo);
  } else if (socketMessage.replyToId && this.getMessageByIdCallback) {
    // Fallback: Reconstituer depuis la liste locale
    replyTo = this.getMessageByIdCallback(socketMessage.replyToId);
    if (replyTo) {
      console.log(`💬 [MESSAGES] Message réponse reconstitué depuis la liste locale: ${socketMessage.replyToId}`);
    } else {
      console.warn(`⚠️ [MESSAGES] Message ${socketMessage.replyToId} non trouvé dans la liste pour replyTo`);
    }
  } else if (socketMessage.replyToId && !this.getMessageByIdCallback) {
    console.warn(`⚠️ [MESSAGES] Callback getMessageById non défini, impossible de reconstituer replyTo`);
  }

  return {
    id: socketMessage.id,
    conversationId: socketMessage.conversationId,
    senderId: socketMessage.senderId || '',
    content: socketMessage.content,
    originalLanguage: socketMessage.originalLanguage || 'fr',
    messageType: socketMessage.messageType,
    timestamp: socketMessage.createdAt,
    createdAt: socketMessage.createdAt,
    updatedAt: socketMessage.updatedAt,
    isEdited: false,
    isDeleted: false,
    translations: [],
    
    // ✅ NOUVEAU : Utiliser replyTo depuis le backend ou le cache local
    replyTo: replyTo,
    
    // ✅ NOUVEAU : Inclure les attachments depuis le backend
    attachments: socketMessage.attachments || [],
    
    sender: socketMessage.sender || {
      id: socketMessage.senderId || '',
      username: 'Utilisateur inconnu',
      firstName: '',
      lastName: '',
      displayName: 'Utilisateur inconnu',
      email: '',
      phoneNumber: '',
      role: 'USER',
      systemLanguage: 'fr',
      regionalLanguage: 'fr',
      customDestinationLanguage: undefined,
      autoTranslateEnabled: true,
      translateToSystemLanguage: true,
      translateToRegionalLanguage: false,
      useCustomDestination: false,
      isOnline: false,
      avatar: undefined,
      lastSeen: new Date(),
      createdAt: new Date(),
      lastActiveAt: new Date(),
      isActive: true,
      updatedAt: new Date()
    }
  };
}
```

**Logique de conversion `replyTo`** :
1. **Priorité 1** : Utiliser `socketMessage.replyTo` fourni par le backend (récursif)
2. **Fallback** : Reconstituer depuis `getMessageByIdCallback()` (liste locale)
3. **Warning** : Si callback non défini et `replyToId` présent

---

## 📊 Fichiers Modifiés

### Backend (Gateway)
1. **`gateway/src/socketio/MeeshySocketIOManager.ts`**
   - Ligne 296-340 : Requête Prisma avec `replyTo`
   - Ligne 1636-1700 : Payload WebSocket avec `attachments` et `replyTo` complet

### Frontend - Types
2. **`frontend/shared/types/socketio-events.ts`**
   - Ligne 103-133 : Ajout `replyTo` et `attachments` dans `SocketIOMessage`

3. **`frontend/shared/types/socketio-events.d.ts`**
   - Ligne 142-169 : Ajout `replyTo` et `attachments` dans déclaration TypeScript

4. **`frontend/shared/types/conversation.ts`**
   - Ligne 75-135 : Ajout `attachments` dans `Message`

5. **`frontend/shared/types/message-types.d.ts`**
   - Ligne 31-60 : Ajout `attachments` dans `GatewayMessage`

### Frontend - Service
6. **`frontend/services/meeshy-socketio.service.ts`**
   - Ligne 867-925 : Conversion complète avec `replyTo` backend et `attachments`

---

## ✅ Tests de Validation

### Test 1 : Message avec attachments
```typescript
// 1. Upload fichier via AttachmentService
const uploadResponse = await attachmentService.uploadFiles(files);
console.log(uploadResponse.attachments); // [{id, fileName, fileUrl, ...}]

// 2. Envoyer message avec attachmentIds
await meeshySocketIOService.sendMessageWithAttachments(
  'meeshy',
  'Message avec image',
  uploadResponse.attachments.map(a => a.id)
);

// 3. Vérifier message reçu via WebSocket
onNewMessage((message) => {
  console.log(message.attachments);
  // ✅ ATTENDU : [{id, fileName, mimeType, fileUrl, thumbnailUrl, ...}]
  // ❌ AVANT : []
});
```

### Test 2 : Message en réponse à un autre
```typescript
// 1. Cliquer sur "Répondre" à un message
setReplyingTo(previousMessage);

// 2. Envoyer la réponse
await meeshySocketIOService.sendMessage(
  'meeshy',
  'Ceci est ma réponse',
  'fr',
  previousMessage.id  // replyToId
);

// 3. Vérifier message reçu via WebSocket
onNewMessage((message) => {
  console.log(message.replyTo);
  // ✅ ATTENDU : {id, content, sender: {username, ...}, ...}
  // ❌ AVANT : undefined (seulement replyToId présent)
  
  console.log(message.replyToId);
  // ✅ ATTENDU : previousMessage.id
});
```

### Test 3 : Message avec attachments ET réponse
```typescript
// 1. Upload fichier
const uploadResponse = await attachmentService.uploadFiles(files);

// 2. Envoyer réponse avec attachments
await meeshySocketIOService.sendMessageWithAttachments(
  'meeshy',
  'Réponse avec image',
  uploadResponse.attachments.map(a => a.id),
  'fr',
  previousMessage.id
);

// 3. Vérifier message reçu
onNewMessage((message) => {
  console.log(message.attachments.length > 0);  // ✅ true
  console.log(message.replyTo !== undefined);   // ✅ true
  console.log(message.replyTo.sender.username); // ✅ "Alice"
});
```

---

## 🎯 Résultats Attendus

### Avant la correction
```javascript
// Message reçu via WebSocket
{
  id: "68f0c6d777f61766dab53adb",
  content: "Message avec image",
  replyToId: "68f0c6d777f61766dab53ac0",  // ✅ ID présent
  replyTo: undefined,                      // ❌ Objet absent
  attachments: undefined                   // ❌ Attachments absents
}
```

### Après la correction
```javascript
// Message reçu via WebSocket
{
  id: "68f0c6d777f61766dab53adb",
  content: "Message avec image",
  replyToId: "68f0c6d777f61766dab53ac0",
  
  // ✅ NOUVEAU : Objet replyTo complet
  replyTo: {
    id: "68f0c6d777f61766dab53ac0",
    content: "Message original",
    sender: {
      id: "68bc64071c7181d556cefce8",
      username: "Alice",
      displayName: "Alice Doe"
    }
  },
  
  // ✅ NOUVEAU : Attachments complets
  attachments: [
    {
      id: "68f0c6d777f61766dab53ae5",
      fileName: "screenshot.png",
      originalFileName: "Screenshot 2025-08-30 at 07.47.02.png",
      mimeType: "image/png",
      fileSize: 125432,
      fileUrl: "/uploads/68f0c6d777f61766dab53ae5.png",
      thumbnailUrl: "/uploads/thumbs/68f0c6d777f61766dab53ae5_thumb.png",
      fileType: "image",
      createdAt: "2025-10-16T10:20:07.000Z"
    }
  ]
}
```

---

## 📝 Leçons Apprises

### 1. Synchronisation Backend ↔ Frontend
**Problème** : Le backend récupérait les données via Prisma mais ne les incluait PAS dans le payload WebSocket.

**Solution** : 
- ✅ Inclure TOUS les champs nécessaires dans le payload WebSocket
- ✅ Synchroniser les types TypeScript backend/frontend
- ✅ Vérifier que `include: { ... }` Prisma correspond au payload émis

### 2. Types TypeScript cohérents
**Problème** : Les types `SocketIOMessage` et `Message` n'avaient PAS le champ `attachments`.

**Solution** :
- ✅ Définir le type d'attachment dans `SocketIOMessage` (source de vérité)
- ✅ Propager ce type dans `Message`, `GatewayMessage`, `UIMessage`
- ✅ Utiliser le même type d'attachment partout (structure cohérente)

### 3. Conversion récursive pour `replyTo`
**Problème** : `replyTo` est un objet `Message` récursif, difficile à typer.

**Solution** :
- ✅ Utiliser `SocketIOMessage` récursif dans la signature
- ✅ Convertir récursivement avec `convertSocketMessageToMessage(socketMessage.replyTo)`
- ✅ Fallback sur cache local si backend ne fournit pas `replyTo`

### 4. Éviter les "undefined" silencieux
**Problème** : `attachments` et `replyTo` étaient `undefined` sans warning.

**Solution** :
- ✅ Utiliser `|| []` pour attachments (array vide par défaut)
- ✅ Logger explicitement quand `replyTo` est reconstitué vs fourni par backend
- ✅ Warnings si données attendues mais absentes

---

## 🚀 Prochaines Étapes

### Validation Utilisateur
1. **Test manual** : Envoyer message avec image sur http://localhost:3100
2. **Vérifier** : Image s'affiche dans le message reçu
3. **Test réponse** : Citer un message et vérifier l'affichage de la citation
4. **Test combiné** : Réponse avec image attachée

### Performance
1. **Optimisation** : Limiter la profondeur de `replyTo` (max 2 niveaux ?)
2. **Lazy loading** : Charger thumbnails des attachments à la demande
3. **Compression** : Thumbnails automatiques pour images > 1MB

### Améliorations Futures
1. **Prévisualisation** : Afficher preview des attachments dans le message cité
2. **Validation** : Vérifier taille/type des attachments avant envoi
3. **Retry** : Réessayer upload si échec réseau
4. **Offline** : Mettre en cache les attachments pour mode hors ligne

---

## ✅ Checklist Validation

- [x] Backend récupère `attachments` et `replyTo` depuis Prisma
- [x] Backend inclut `attachments` et `replyTo` dans payload WebSocket
- [x] Types `SocketIOMessage` incluent `attachments` et `replyTo`
- [x] Types `Message` incluent `attachments`
- [x] Types `GatewayMessage` incluent `attachments`
- [x] Conversion `convertSocketMessageToMessage()` traite `attachments`
- [x] Conversion `convertSocketMessageToMessage()` traite `replyTo` récursif
- [x] Aucune erreur TypeScript dans le frontend
- [x] Aucune erreur TypeScript dans le gateway
- [ ] Tests manuels validés (à faire)
- [ ] Documentation mise à jour
- [ ] Commit et push vers `feature/selective-improvements`

---

**Résumé** : Cette correction garantit que les messages reçus via WebSocket incluent TOUS les champs nécessaires (`attachments`, `replyTo` complet) pour un affichage correct dans l'interface utilisateur.
