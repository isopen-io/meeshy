# 📖 Système de Statut de Lecture par Curseur

## 🎯 Concept

Au lieu de créer un `MessageStatus` pour chaque message reçu/lu par chaque utilisateur, nous utilisons un **système de curseur mobile**.

Chaque utilisateur a **UN SEUL** `MessageStatus` par conversation qui agit comme un curseur pointant vers le dernier message reçu/lu.

## 📊 Exemple Concret

### Scénario: Conversation de groupe avec 4 membres

```
Membres: Alice (expéditrice), Bob, Claire, David
Messages: msg1, msg2, msg3, msg4, msg5
```

### État initial (conversation vide)

```
MessageStatus: aucun
```

### Alice envoie msg1 (14h00)

```
MessageStatus:
- Aucun (Alice n'a pas de curseur pour ses propres messages)

Bob est connecté → son curseur est créé automatiquement:
{
  userId: Bob,
  conversationId: conv123,
  messageId: msg1,  ← Curseur pointe vers msg1
  receivedAt: 14h00,
  readAt: null
}

Claire et David sont déconnectés → pas de curseur créé
```

### Bob ouvre la conversation et lit msg1 (14h05)

```
MessageStatus Bob:
{
  userId: Bob,
  conversationId: conv123,
  messageId: msg1,
  receivedAt: 14h00,
  readAt: 14h05  ← Mis à jour
}
```

### Alice envoie msg2, msg3, msg4 (14h10)

```
Bob est toujours connecté → son curseur se déplace:
{
  userId: Bob,
  conversationId: conv123,
  messageId: msg4,  ← Curseur déplacé vers msg4
  receivedAt: 14h10,  ← Mis à jour
  readAt: null  ← Réinitialisé (pas encore lu)
}
```

### Claire se connecte (14h15)

```
Curseur de Claire créé automatiquement:
{
  userId: Claire,
  conversationId: conv123,
  messageId: msg4,  ← Curseur vers le dernier message
  receivedAt: 14h15,
  readAt: null
}
```

### Claire ouvre la conversation et scrolle jusqu'à msg4 (14h20)

```
Curseur de Claire mis à jour:
{
  userId: Claire,
  conversationId: conv123,
  messageId: msg4,
  receivedAt: 14h15,
  readAt: 14h20  ← Mis à jour
}
```

### Alice envoie msg5 (14h25)

```
Bob (connecté) et Claire (connecté):
{
  userId: Bob,
  messageId: msg5,  ← Déplacé vers msg5
  receivedAt: 14h25,
  readAt: null  ← Réinitialisé
}
{
  userId: Claire,
  messageId: msg5,  ← Déplacé vers msg5
  receivedAt: 14h25,
  readAt: null  ← Réinitialisé
}

David est toujours déconnecté → pas de curseur
```

## 🧮 Calcul des Statuts pour l'UI

### Question: "Combien ont lu msg3 ?"

```typescript
// msg3 créé à 14h10

// On regarde tous les curseurs:
Bob: messageId=msg5 (créé à 14h25) ≥ msg3 (14h10) ET readAt existe
  → Bob a LU msg3 ✅

Claire: messageId=msg5 (créé à 14h25) ≥ msg3 (14h10) ET readAt existe
  → Claire a LU msg3 ✅

David: pas de curseur
  → David n'a PAS reçu msg3 ❌

Résultat: Lu par 2/3 membres (Bob, Claire)
```

### Question: "Qui a reçu msg2 ?"

```typescript
// msg2 créé à 14h10

Bob: messageId=msg5 (14h25) ≥ msg2 (14h10) ET receivedAt existe
  → Bob a REÇU msg2 ✅ (à 14h25)

Claire: messageId=msg5 (14h25) ≥ msg2 (14h10) ET receivedAt existe
  → Claire a REÇU msg2 ✅ (à 14h25)

David: pas de curseur
  → David n'a PAS reçu msg2 ❌

Résultat: Reçu par 2/3 membres
```

## 🎨 Affichage dans l'UI

### Pour msg1 (ancien message)

```
Alice: Ton message                    14h00  ✓✓ (bleu) 2/3
                                             ↑
                              Bob et Claire ont lu
```

### Pour msg5 (message récent)

```
Alice: Ton message                    14h25  ✓✓ (gris) 2/3
                                             ↑
                              Reçu mais pas encore lu
```

### Popover détaillé (clic sur le compteur)

```
┌────────────────────────────────────┐
│ 📖 Statut du message               │
│ ──────────────────────────────────│
│ Lu par (2)                         │
│  👤 Bob      Aujourd'hui 14h30    │
│  👤 Claire   Aujourd'hui 14h20    │
│                                    │
│ Reçu uniquement (0)                │
│  (aucun)                           │
│                                    │
│ Non reçu (1)                       │
│  👤 David                          │
└────────────────────────────────────┘
```

## 🚀 Événements Socket.IO

### Quand un utilisateur reçoit un message

```typescript
// Backend
socket.on('connection', async (socket) => {
  const userId = socket.userId;

  // Récupérer toutes les conversations de l'utilisateur
  const conversations = await getUserConversations(userId);

  // Marquer comme reçu pour chaque conversation
  for (const conv of conversations) {
    await messageReadStatusService.markMessagesAsReceived(
      userId,
      conv.id
    );
  }

  // Notifier les autres membres
  for (const conv of conversations) {
    socket.to(`conversation_${conv.id}`).emit('read-status:updated', {
      conversationId: conv.id,
      userId,
      type: 'received'
    });
  }
});
```

### Quand un utilisateur ouvre une conversation

```typescript
// Frontend
socket.emit('conversation:opened', { conversationId });

// Backend
socket.on('conversation:opened', async ({ conversationId }) => {
  await messageReadStatusService.markMessagesAsRead(
    socket.userId,
    conversationId
  );

  // Notifier les autres membres
  socket.to(`conversation_${conversationId}`).emit('read-status:updated', {
    conversationId,
    userId: socket.userId,
    type: 'read'
  });
});
```

## 📈 Avantages de cette approche

### Scalabilité

```
❌ ANCIEN (MessageStatus par message):
   1000 messages × 100 membres = 100,000 entrées

✅ NOUVEAU (Curseur par conversation):
   100 membres = 100 entrées (fixe!)

   Réduction de 99.9% du stockage!
```

### Performance

```
✅ Requêtes ultra-rapides
   - Un seul UPDATE par utilisateur par conversation
   - Pas de création/suppression massive

✅ Index optimisés
   - @@unique([userId, conversationId])
   - Recherche instantanée du curseur
```

### Simplicité

```
✅ Logique claire
   - Un curseur = position de l'utilisateur
   - Facile à déboguer
   - Facile à visualiser
```

## 🔧 Implémentation

### 1. Backend - MessagingService

```typescript
import { MessageReadStatusService } from './MessageReadStatusService';

export class MessagingService {
  private readStatusService: MessageReadStatusService;

  constructor(private prisma: PrismaClient) {
    this.readStatusService = new MessageReadStatusService(prisma);
  }

  async handleMessage(request: MessageRequest, senderId: string) {
    // ... créer le message ...

    // Marquer comme reçu pour les utilisateurs connectés
    const connectedUsers = socketIOManager.getConnectedUsersInConversation(
      message.conversationId
    );

    for (const userId of connectedUsers) {
      if (userId === senderId) continue;

      await this.readStatusService.markMessagesAsReceived(
        userId,
        message.conversationId,
        message.id
      );
    }

    // Émettre événement Socket.IO
    socketIOManager.io.to(`conversation_${message.conversationId}`).emit(
      'read-status:updated',
      {
        conversationId: message.conversationId,
        messageId: message.id,
        type: 'received'
      }
    );
  }
}
```

### 2. Frontend - Hook useMessageReadStatus

```typescript
export function useMessageReadStatus(messageId: string, conversationId: string) {
  const [status, setStatus] = useState({
    receivedCount: 0,
    readCount: 0,
    totalMembers: 0
  });

  useEffect(() => {
    // Charger le statut initial
    async function loadStatus() {
      const result = await apiService.get(
        `/messages/${messageId}/read-status`
      );
      setStatus(result.data);
    }

    loadStatus();

    // Écouter les mises à jour en temps réel
    const socket = meeshySocketIOService.getSocket();
    socket.on('read-status:updated', (data) => {
      if (data.conversationId === conversationId) {
        loadStatus(); // Recharger le statut
      }
    });

    return () => {
      socket.off('read-status:updated');
    };
  }, [messageId, conversationId]);

  return status;
}
```

### 3. Frontend - Composant MessageStatusIndicator

```tsx
function MessageStatusIndicator({ message, isOwnMessage }: Props) {
  const { receivedCount, readCount, totalMembers } = useMessageReadStatus(
    message.id,
    message.conversationId
  );

  if (!isOwnMessage) return null;

  const isFullyRead = readCount === totalMembers;
  const isFullyReceived = receivedCount === totalMembers;

  return (
    <div className="flex items-center gap-1">
      {/* Double check mark */}
      <div className={cn(
        isFullyRead ? "text-blue-500" : "text-gray-400"
      )}>
        <Check className="w-3 h-3" />
        <Check className="w-3 h-3 -ml-1.5" />
      </div>

      {/* Compteur si groupe */}
      {totalMembers > 1 && (
        <span className="text-xs text-muted-foreground">
          {readCount}/{totalMembers}
        </span>
      )}
    </div>
  );
}
```

## 📝 Migration depuis l'ancien système

Si vous avez déjà des `MessageStatus` créés avec l'ancien système:

```typescript
async function migrateToNewCursorSystem(conversationId: string) {
  // 1. Récupérer tous les anciens MessageStatus
  const oldStatuses = await prisma.messageStatus.findMany({
    where: { conversationId },
    include: {
      message: { select: { createdAt: true } }
    },
    orderBy: { message: { createdAt: 'desc' } }
  });

  // 2. Grouper par utilisateur
  const byUser = new Map<string, typeof oldStatuses>();
  for (const status of oldStatuses) {
    if (!byUser.has(status.userId)) {
      byUser.set(status.userId, []);
    }
    byUser.get(status.userId)!.push(status);
  }

  // 3. Pour chaque utilisateur, garder seulement le plus récent
  for (const [userId, statuses] of byUser) {
    const latest = statuses[0]; // Déjà trié par date DESC

    // Supprimer tous les anciens
    await prisma.messageStatus.deleteMany({
      where: {
        userId,
        conversationId,
        id: { not: latest.id }
      }
    });

    console.log(`✅ Migrated ${statuses.length} statuses → 1 cursor for user ${userId}`);
  }
}
```

## 🎯 Résumé

- ✅ **UN SEUL** MessageStatus par utilisateur par conversation
- ✅ `messageId` = curseur vers le dernier message reçu/lu
- ✅ `receivedAt` = date de réception du message pointé
- ✅ `readAt` = date de lecture du message pointé
- ✅ Calcul des statuts par comparaison de dates
- ✅ 99.9% moins de stockage
- ✅ Temps réel via Socket.IO
- ✅ Compatible avec l'UI "check mark + compteur"
