# 🐛 Code Review - Bugs et Problèmes Identifiés

## 🔴 **BUGS CRITIQUES**

### 1. **Bug dans `markMessagesAsReceived` - Réinitialisation du `readAt`**

**Fichier:** `MessageReadStatusService.ts:59-62`

```typescript
update: {
  messageId,
  receivedAt: new Date()
  // ❌ BUG: readAt n'est PAS réinitialisé !
}
```

**Problème:**
Quand un nouveau message arrive, le curseur est déplacé mais `readAt` garde son ancienne valeur. Cela crée une incohérence logique.

**Exemple:**
```
État initial:
  { messageId: msg5, receivedAt: 14h00, readAt: 14h05 }

Nouveau message msg6 arrive:
  update({ messageId: msg6, receivedAt: 14h10 })

Résultat BUGGÉ:
  { messageId: msg6, receivedAt: 14h10, readAt: 14h05 }
                                              ↑
                                    Incohérent! L'utilisateur n'a pas lu msg6
```

**Correction:**
```typescript
update: {
  messageId,
  receivedAt: new Date(),
  readAt: null  // ← AJOUTER: Réinitialiser readAt
}
```

---

### 2. **Bug dans `getMessageReadStatus` - Exclusion expéditeur cassée**

**Fichier:** `MessageReadStatusService.ts:162-168`

```typescript
const totalMembers = await this.prisma.conversationMember.count({
  where: {
    conversationId,
    isActive: true,
    userId: { not: message.senderId || undefined }
    //                              ↑
    //                    ❌ BUG: Si senderId = null, filtre devient { not: undefined }
  }
});
```

**Problème:**
Pour les messages anonymes, `senderId` est `null`. L'expression `null || undefined` retourne `undefined`, donc le filtre devient `{ not: undefined }` ce qui n'exclut rien.

**Scénario problématique:**
```typescript
// Message anonyme
message.senderId = null

// Filtre devient:
userId: { not: null || undefined }  // = { not: undefined }
// ❌ Cela ne filtre RIEN! Tous les membres sont comptés
```

**Correction:**
```typescript
const totalMembers = await this.prisma.conversationMember.count({
  where: {
    conversationId,
    isActive: true,
    ...(message.senderId ? { userId: { not: message.senderId } } : {})
  }
});
```

---

### 3. **Bug dans `getMessageReadStatus` - Ne filtre pas l'expéditeur dans les curseurs**

**Fichier:** `MessageReadStatusService.ts:189-210`

```typescript
for (const cursor of cursors) {
  // Si le curseur pointe vers un message >= au message cible (en date)
  if (cursor.message.createdAt >= message.createdAt) {
    // ❌ BUG: Ne vérifie PAS si cursor.userId === message.senderId
    if (cursor.receivedAt) {
      receivedBy.push({ ... });
    }
    if (cursor.readAt) {
      readBy.push({ ... });
    }
  }
}
```

**Problème:**
L'expéditeur a son propre curseur marqué comme "lu" (créé dans `MessagingService`), donc il apparaît dans la liste `readBy`, ce qui gonfle artificiellement les compteurs.

**Exemple:**
```
Alice envoie msg1
→ Curseur Alice créé: { messageId: msg1, readAt: now }

Récupération du statut:
  totalMembers = 3 (Bob, Claire, David - Alice exclue)
  readBy = [Alice, Bob]  ← ❌ Alice est incluse!
  readCount = 2

Affichage UI:
  "Lu par 2/3"  ← FAUX! Devrait être "Lu par 1/3"
```

**Correction:**
```typescript
for (const cursor of cursors) {
  // Exclure l'expéditeur
  if (cursor.userId === message.senderId) continue;

  if (cursor.message.createdAt >= message.createdAt) {
    if (cursor.receivedAt) {
      receivedBy.push({ ... });
    }
    if (cursor.readAt) {
      readBy.push({ ... });
    }
  }
}
```

---

## 🟡 **BUGS MOYENS**

### 4. **Performance - N+1 queries dans `cleanupObsoleteCursors`**

**Fichier:** `MessageReadStatusService.ts:297-310`

```typescript
for (const cursor of cursors) {
  // ❌ Une requête par curseur!
  const messageExists = await this.prisma.message.findUnique({
    where: { id: cursor.messageId },
    select: { id: true, isDeleted: true }
  });

  if (!messageExists || messageExists.isDeleted) {
    // ❌ Une autre requête pour supprimer!
    await this.prisma.messageStatus.delete({
      where: { id: cursor.id }
    });
  }
}
```

**Problème:**
Si une conversation a 100 curseurs, cela génère 200 requêtes (100 `findUnique` + 100 `delete`).

**Correction:**
```typescript
// 1. Récupérer tous les messageIds des curseurs
const messageIds = cursors.map(c => c.messageId);

// 2. Vérifier lesquels existent (1 seule requête)
const existingMessages = await this.prisma.message.findMany({
  where: {
    id: { in: messageIds },
    isDeleted: false
  },
  select: { id: true }
});

const existingMessageIds = new Set(existingMessages.map(m => m.id));

// 3. Identifier les curseurs obsolètes
const obsoleteCursorIds = cursors
  .filter(c => !existingMessageIds.has(c.messageId))
  .map(c => c.id);

// 4. Supprimer en batch (1 seule requête)
if (obsoleteCursorIds.length > 0) {
  await this.prisma.messageStatus.deleteMany({
    where: { id: { in: obsoleteCursorIds } }
  });
}

return obsoleteCursorIds.length;
```

---

### 5. **Logique incorrecte dans le calcul de statut - Messages anonymes**

**Fichier:** `MessageReadStatusService.ts:147-154`

```typescript
const message = await this.prisma.message.findUnique({
  where: { id: messageId },
  select: {
    id: true,
    createdAt: true,
    senderId: true,  // ← Null pour messages anonymes
    conversationId: true
  }
});
```

**Problème:**
Pour un message anonyme, `senderId` est `null` mais `anonymousSenderId` existe. Le code ne récupère pas `anonymousSenderId`, donc on ne peut pas exclure l'expéditeur anonyme du comptage.

**Correction:**
```typescript
const message = await this.prisma.message.findUnique({
  where: { id: messageId },
  select: {
    id: true,
    createdAt: true,
    senderId: true,
    anonymousSenderId: true,  // ← AJOUTER
    conversationId: true
  }
});

// Plus tard, pour filtrer:
const authorId = message.senderId || message.anonymousSenderId;
if (cursor.userId === authorId) continue;
```

---

### 6. **Validation manquante - messageId peut pointer vers un message d'une autre conversation**

**Fichier:** `MessageReadStatusService.ts:45-63`

```typescript
await this.prisma.messageStatus.upsert({
  where: {
    userId_conversationId: { userId, conversationId }
  },
  create: {
    userId,
    conversationId,
    messageId,  // ❌ Pas de validation que messageId appartient à conversationId
    receivedAt: new Date()
  },
  ...
});
```

**Problème:**
On pourrait créer un curseur pointant vers un message d'une AUTRE conversation, créant une incohérence de données.

**Exemple d'attaque:**
```typescript
await markMessagesAsReceived(
  "user123",
  "conv_ABC",  // Conversation A
  "msg_from_conv_XYZ"  // ❌ Message de la conversation B
);

// Résultat: Curseur créé avec données incohérentes
{
  conversationId: "conv_ABC",
  messageId: "msg_from_conv_XYZ"  ← message.conversationId = "conv_XYZ"
}
```

**Correction:**
```typescript
// Valider que le message appartient à la conversation
if (latestMessageId) {
  const messageCheck = await this.prisma.message.findFirst({
    where: {
      id: latestMessageId,
      conversationId: conversationId,
      isDeleted: false
    }
  });

  if (!messageCheck) {
    throw new Error(`Message ${latestMessageId} does not belong to conversation ${conversationId}`);
  }
}
```

---

## 🟢 **BUGS MINEURS**

### 7. **Manque de gestion des utilisateurs anonymes**

**Fichier:** Partout

**Problème:**
Le système ne gère que les utilisateurs authentifiés (`userId`). Les utilisateurs anonymes (`AnonymousParticipant`) ne peuvent pas avoir de curseur de lecture.

**Impact:**
Les messages envoyés/lus par des anonymes ne sont pas trackés.

**Correction:**
Ajouter support pour `anonymousUserId` dans `MessageStatus`:

```prisma
model MessageStatus {
  id                String    @id
  conversationId    String    @db.ObjectId
  messageId         String    @db.ObjectId
  userId            String?   @db.ObjectId  // ← Nullable
  anonymousUserId   String?   @db.ObjectId  // ← AJOUTER
  receivedAt        DateTime?
  readAt            DateTime?

  user              User?                @relation(...)
  anonymousUser     AnonymousParticipant? @relation(...)

  @@unique([userId, conversationId])
  @@unique([anonymousUserId, conversationId])
}
```

---

### 8. **Dates de réception/lecture incohérentes avec la vraie date**

**Fichier:** `MessageReadStatusService.ts:113-114`, `118-119`

```typescript
create: {
  userId,
  conversationId,
  messageId,
  receivedAt: new Date(),  // ← Date de création du curseur
  readAt: new Date()       // ← Date de création du curseur
}
```

**Problème:**
`receivedAt` et `readAt` sont toujours "maintenant", même si l'utilisateur a peut-être reçu/lu le message il y a plusieurs heures (cas de synchronisation différée).

**Impact limité:**
Acceptable pour la plupart des cas, mais peut être trompeur pour l'affichage "Lu il y a 2h" si la vraie lecture était bien plus tôt.

**Amélioration possible:**
Accepter des paramètres optionnels `receivedAtTimestamp` et `readAtTimestamp`.

---

### 9. **Pas de gestion de transaction dans les routes API**

**Fichier:** `routes/message-read-status.ts:160-175`

```typescript
await readStatusService.markMessagesAsRead(userId, conversationId);

// ❌ Si cette partie échoue, le curseur est déjà mis à jour
try {
  const socketIOManager = socketIOHandler.getManager();
  if (socketIOManager) {
    (socketIOManager as any).io.to(room).emit('read-status:updated', {...});
  }
} catch (socketError) {
  // L'événement Socket.IO n'est pas émis mais le curseur est modifié
}
```

**Impact:**
Si l'émission Socket.IO échoue, les autres utilisateurs ne seront pas notifiés en temps réel, mais le curseur est quand même mis à jour. Pas critique mais peut créer un décalage temporaire.

---

## 📊 **Résumé des Bugs**

| Priorité | Bug | Impact | Correction requise |
|----------|-----|--------|-------------------|
| 🔴 Critique | #1 - `readAt` non réinitialisé | Messages marqués comme lus alors qu'ils ne le sont pas | 1 ligne |
| 🔴 Critique | #2 - Expéditeur anonyme non filtré | Compteurs faux | 3 lignes |
| 🔴 Critique | #3 - Expéditeur inclus dans les résultats | Compteurs gonflés | 1 ligne |
| 🟡 Moyen | #4 - Performance N+1 | Lenteur pour grandes conversations | Refactor |
| 🟡 Moyen | #5 - `anonymousSenderId` non récupéré | Filtrage incomplet | 2 lignes |
| 🟡 Moyen | #6 - Pas de validation messageId/conversationId | Possibilité d'incohérence | 10 lignes |
| 🟢 Mineur | #7 - Pas de support anonymes | Fonctionnalité incomplète | Schema change |
| 🟢 Mineur | #8 - Dates approximatives | Précision réduite | Optionnel |
| 🟢 Mineur | #9 - Pas de transactions | Décalage temps réel | Optionnel |

---

## ✅ **Corrections Prioritaires**

Voulez-vous que je corrige les bugs critiques (#1, #2, #3) immédiatement ?
