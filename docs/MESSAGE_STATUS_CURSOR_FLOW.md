# 🎯 Flux de Mise à Jour du Curseur MessageStatus

## 📋 Champs du MessageStatus

```prisma
model MessageStatus {
  id             String    // ID unique du curseur
  conversationId String    // Quelle conversation
  messageId      String    // ← LE CURSEUR (pointe vers un message)
  userId         String    // Quel utilisateur
  receivedAt     DateTime? // ← Quand le message pointé a été reçu
  readAt         DateTime? // ← Quand le message pointé a été lu
  updatedAt      DateTime  // ← Dernière mise à jour (auto)
}
```

## 🔄 Scénarios de Mise à Jour

### **Scénario 1: Utilisateur se connecte**

```
État AVANT:
  Bob n'a pas de curseur dans conv123

Action:
  Bob se connecte → WebSocket connection

Dernier message de conv123:
  msg5 (créé à 14h25)

État APRÈS:
  {
    userId: Bob,
    conversationId: conv123,
    messageId: msg5,        ← CURSEUR créé
    receivedAt: 14h30,      ← Maintenant
    readAt: null,           ← Pas encore lu
    updatedAt: 14h30
  }
```

### **Scénario 2: Nouveau message arrive (utilisateur connecté)**

```
État AVANT:
  Bob cursor:
  {
    messageId: msg5,
    receivedAt: 14h30,
    readAt: 14h35          ← Bob avait lu msg5
  }

Action:
  Alice envoie msg6 (14h40)
  Bob est connecté → reçoit msg6 automatiquement

État APRÈS:
  Bob cursor:
  {
    messageId: msg6,        ← CURSEUR déplacé vers msg6
    receivedAt: 14h40,      ← Mis à jour
    readAt: null,           ← Réinitialisé (nouveau message non lu)
    updatedAt: 14h40
  }
```

### **Scénario 3: Utilisateur ouvre la conversation et scrolle**

```
État AVANT:
  Bob cursor:
  {
    messageId: msg6,
    receivedAt: 14h40,
    readAt: null           ← Pas encore lu
  }

Action:
  Bob ouvre conv123 → scrolle jusqu'à msg6 (14h45)

État APRÈS:
  Bob cursor:
  {
    messageId: msg6,        ← CURSEUR reste sur msg6
    receivedAt: 14h40,      ← Inchangé
    readAt: 14h45,          ← MIS À JOUR !
    updatedAt: 14h45
  }
```

### **Scénario 4: Utilisateur reçoit plusieurs messages d'un coup**

```
État AVANT:
  Claire cursor:
  {
    messageId: msg3,
    receivedAt: 14h20,
    readAt: 14h22
  }

Action:
  Claire était déconnectée
  Pendant ce temps: msg4, msg5, msg6, msg7 ont été envoyés
  Claire se reconnecte à 15h00

Dernier message: msg7

État APRÈS:
  Claire cursor:
  {
    messageId: msg7,        ← CURSEUR saute directement à msg7
    receivedAt: 15h00,      ← Date de connexion
    readAt: null,           ← Elle n'a pas encore ouvert la conv
    updatedAt: 15h00
  }

  Note: Claire a "sauté" msg4, msg5, msg6 → mais on peut déduire
        qu'elle les a reçus car msg7.createdAt > msg4.createdAt
```

## 🧮 Comment Calculer le Statut d'un Message Ancien

### Question: "Qui a lu msg4 ?"

```
msg4.createdAt = 14h15

Curseurs actuels:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bob:
  messageId: msg6 (créé à 14h40)
  readAt: 14h45

  → msg6.createdAt (14h40) >= msg4.createdAt (14h15)
  → Bob a lu msg4 ✅ (car il a lu un message APRÈS msg4)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Claire:
  messageId: msg7 (créé à 14h50)
  readAt: null

  → msg7.createdAt (14h50) >= msg4.createdAt (14h15)
  → Claire a REÇU msg4 ✅
  → Mais readAt = null → Elle ne l'a PAS LU ❌

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
David:
  Pas de curseur

  → David n'a PAS reçu msg4 ❌

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Résultat pour msg4:
  Reçu par: 2/3 (Bob, Claire)
  Lu par: 1/3 (Bob)
```

## 🎨 Règles de Mise à Jour

### ✅ **TOUJOURS mettre à jour quand:**

1. **Utilisateur se connecte**
   ```typescript
   messageId: dernierMessageDeLaConversation
   receivedAt: now
   readAt: null  // Ne pas toucher si déjà existant
   ```

2. **Nouveau message arrive + utilisateur connecté**
   ```typescript
   messageId: nouveauMessage
   receivedAt: now
   readAt: null  // Réinitialiser !
   ```

3. **Utilisateur ouvre conversation + scrolle au dernier message**
   ```typescript
   messageId: dernierMessageDeLaConversation
   receivedAt: now (ou conserver existant si déjà reçu)
   readAt: now  // Mettre à jour !
   ```

### ❌ **NE JAMAIS faire:**

1. **Créer plusieurs curseurs pour le même user/conversation**
   ```typescript
   // ❌ INTERDIT
   await prisma.messageStatus.create({
     data: { userId: "bob", conversationId: "conv123", ... }
   });
   await prisma.messageStatus.create({
     data: { userId: "bob", conversationId: "conv123", ... }
   });

   // ✅ TOUJOURS utiliser upsert
   await prisma.messageStatus.upsert({
     where: { userId_conversationId: { userId: "bob", conversationId: "conv123" } },
     create: { ... },
     update: { ... }
   });
   ```

2. **Laisser readAt sans receivedAt**
   ```typescript
   // ❌ Incohérent
   { receivedAt: null, readAt: now }

   // ✅ Logique correcte
   { receivedAt: now, readAt: now }
   ```

3. **Pointer vers un message supprimé**
   ```typescript
   // ❌ Message supprimé
   messageId: "msg_deleted"

   // ✅ Toujours pointer vers le dernier message NON supprimé
   const latestMessage = await prisma.message.findFirst({
     where: { conversationId, isDeleted: false },
     orderBy: { createdAt: 'desc' }
   });
   ```

## 🔧 Code Simplifié

### Fonction de mise à jour universelle

```typescript
async function updateMessageStatusCursor(
  userId: string,
  conversationId: string,
  action: 'received' | 'read'
): Promise<void> {
  // 1. Récupérer le dernier message non supprimé
  const latestMessage = await prisma.message.findFirst({
    where: {
      conversationId,
      isDeleted: false
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true }
  });

  if (!latestMessage) {
    console.log('⚠️  Aucun message dans la conversation');
    return;
  }

  // 2. Préparer les données selon l'action
  const now = new Date();
  const updateData = action === 'read'
    ? { messageId: latestMessage.id, receivedAt: now, readAt: now }
    : { messageId: latestMessage.id, receivedAt: now, readAt: null };

  // 3. Upsert (update or insert)
  await prisma.messageStatus.upsert({
    where: {
      userId_conversationId: { userId, conversationId }
    },
    create: {
      userId,
      conversationId,
      ...updateData
    },
    update: updateData
  });

  console.log(`✅ Curseur mis à jour: ${action} → ${latestMessage.id}`);
}

// Utilisation:
await updateMessageStatusCursor('bob', 'conv123', 'received');
await updateMessageStatusCursor('bob', 'conv123', 'read');
```

## 📊 Requête pour Afficher les Statuts

### Récupérer le statut d'un message spécifique

```typescript
async function getMessageReadStatus(messageId: string) {
  // 1. Récupérer le message
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { createdAt: true, conversationId: true, senderId: true }
  });

  // 2. Récupérer tous les curseurs de cette conversation
  const cursors = await prisma.messageStatus.findMany({
    where: { conversationId: message.conversationId },
    include: {
      message: { select: { createdAt: true } },
      user: { select: { id: true, username: true } }
    }
  });

  // 3. Filtrer ceux qui ont reçu/lu ce message
  const receivedBy = cursors.filter(c =>
    c.message.createdAt >= message.createdAt &&
    c.receivedAt !== null &&
    c.userId !== message.senderId
  );

  const readBy = cursors.filter(c =>
    c.message.createdAt >= message.createdAt &&
    c.readAt !== null &&
    c.userId !== message.senderId
  );

  return {
    receivedCount: receivedBy.length,
    readCount: readBy.length,
    receivedBy: receivedBy.map(c => ({
      userId: c.userId,
      username: c.user.username,
      receivedAt: c.receivedAt!
    })),
    readBy: readBy.map(c => ({
      userId: c.userId,
      username: c.user.username,
      readAt: c.readAt!
    }))
  };
}
```

## 🎯 Résumé - 3 Champs Clés

```
messageId    → LE CURSEUR (position actuelle)
receivedAt   → Quand le curseur a été mis à jour pour réception
readAt       → Quand le curseur a été mis à jour pour lecture

Mise à jour:
- Réception → messageId + receivedAt changent, readAt = null
- Lecture   → messageId + receivedAt + readAt changent
```

## ✅ Avantages

1. **Simple**: Seulement 3 champs à gérer
2. **Efficace**: 1 UPDATE par action (pas de création/suppression)
3. **Scalable**: Nombre fixe de curseurs (= nombre de membres)
4. **Clair**: Position explicite de chaque utilisateur
5. **Flexible**: Calcul rétroactif possible pour tous les messages
