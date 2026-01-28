# Guide de Migration - Système de Notifications

## Vue d'ensemble

Ce guide couvre la migration de l'ancienne structure de notifications vers la nouvelle architecture groupée.

## Changements Majeurs

### 1. Structure Groupée

**Avant (Structure Plate/Mixte):**
```typescript
{
  id: string;
  userId: string;
  type: string;
  title: string;              // ❌ Supprimé
  content: string;

  // Champs dénormalisés à la racine
  senderId: string;          // ❌ Déplacé vers actor
  senderUsername: string;    // ❌ Déplacé vers actor
  senderAvatar: string;      // ❌ Déplacé vers actor
  senderDisplayName: string; // ❌ Déplacé vers actor

  conversationId: string;    // ❌ Déplacé vers context
  messageId: string;         // ❌ Déplacé vers context
  callSessionId: string;     // ❌ Déplacé vers context

  isRead: boolean;           // ❌ Déplacé vers state
  readAt: Date;              // ❌ Déplacé vers state
  createdAt: Date;           // ❌ Déplacé vers state

  data: Json;                // ❌ Remplacé par metadata structuré
}
```

**Après (Structure Groupée):**
```typescript
{
  id: string;
  userId: string;
  type: string;
  priority: string;
  content: string;  // Plus de title !

  actor: {          // ✅ Nouveau groupe
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };

  context: {        // ✅ Nouveau groupe
    conversationId?: string;
    conversationTitle?: string;
    conversationType?: string;
    messageId?: string;
    callSessionId?: string;
  };

  metadata: {       // ✅ Nouveau groupe (typé)
    attachments?: Attachment[];
    reactionEmoji?: string;
    // ... type-specific
  };

  state: {          // ✅ Nouveau groupe
    isRead: boolean;
    readAt: Date | null;
    createdAt: Date;
    expiresAt?: Date;
  };

  delivery: {       // ✅ Nouveau groupe
    emailSent: boolean;
    pushSent: boolean;
  };
}
```

### 2. Suppression du Champ `title`

**Avant:**
```typescript
{
  title: "Message de Alice",  // ❌ Stocké en DB
  content: "Salut! Comment vas-tu?"
}
```

**Après:**
```typescript
{
  content: "Salut! Comment vas-tu?"
  // Le title est construit dynamiquement via buildNotificationTitle()
}
```

**Pourquoi?**
- Support i18n automatique
- Mise à jour facile des textes
- Moins de stockage en DB
- Cohérence de l'affichage

### 3. Champ `data` → `metadata` Structuré

**Avant:**
```typescript
{
  data: {  // ❌ Json non typé, structure incohérente
    conversationTitle: "...",
    attachments: [...],
    emoji: "❤️",
    // ... mélange de données
  }
}
```

**Après:**
```typescript
{
  metadata: {  // ✅ Typé avec discriminated unions
    attachments: [...],
    reactionEmoji: "❤️"
  }
}
```

## Migration Base de Données

### Option 1: Drop & Recreate (Recommandé pour Développement)

**Avantages:**
- ✅ Plus rapide
- ✅ Pas de complexité
- ✅ Pas de données legacy

**Inconvénients:**
- ❌ Perte des notifications existantes

**Script:**
```bash
cd scripts/migrations
node drop-notifications.ts --confirm
```

### Option 2: Migration Progressive (Production)

Si vous devez conserver les notifications existantes:

**Script de migration** (non inclus, à adapter selon besoins):
```typescript
// Pseudo-code
const notifications = await prisma.notification.findMany();

for (const notif of notifications) {
  await prisma.notification.update({
    where: { id: notif.id },
    data: {
      // Construire actor depuis champs dénormalisés
      actor: notif.senderId ? {
        id: notif.senderId,
        username: notif.senderUsername,
        displayName: notif.senderDisplayName,
        avatar: notif.senderAvatar
      } : null,

      // Construire context
      context: {
        conversationId: notif.conversationId,
        messageId: notif.messageId,
        callSessionId: notif.callSessionId
      },

      // Migrer data vers metadata
      metadata: notif.data || {},

      // Initialiser delivery
      delivery: { emailSent: false, pushSent: false }
    }
  });
}
```

## Changements Code

### Backend

#### 1. Création de Notifications

**Avant:**
```typescript
await prisma.notification.create({
  data: {
    userId,
    type: 'new_message',
    title: 'Message de Alice',
    content: message.content,
    senderId: sender.id,
    senderUsername: sender.username,
    senderDisplayName: sender.displayName,
    conversationId: conversation.id,
    messageId: message.id,
    isRead: false,
    createdAt: new Date()
  }
});
```

**Après:**
```typescript
await notificationService.createMessageNotification({
  userId,
  senderId: sender.id,
  messageId: message.id,
  conversationId: conversation.id,
  preview: message.content
});
```

#### 2. Lecture de Notifications

**Avant:**
```typescript
const notifications = await prisma.notification.findMany({
  where: { userId },
  orderBy: { createdAt: 'desc' }
});

// Accès plat
notifications.forEach(n => {
  console.log(n.title);
  console.log(n.senderUsername);
  console.log(n.conversationId);
});
```

**Après:**
```typescript
const response = await notificationService.getUserNotifications({
  userId,
  limit: 50,
  offset: 0
});

// Accès groupé
response.notifications.forEach(n => {
  console.log(buildNotificationTitle(n));  // Title construit
  console.log(n.actor?.username);
  console.log(n.context.conversationId);
});
```

#### 3. Émission Socket.IO

**Avant:**
```typescript
io.to(userId).emit('notification', {
  id: notification.id,
  type: notification.type,
  title: notification.title,
  senderId: notification.senderId,
  senderUsername: notification.senderUsername,
  conversationId: notification.conversationId,
  // ... structure plate
});
```

**Après:**
```typescript
// Géré automatiquement par NotificationService
// lors de la création via createNotification()
// Émet déjà la structure groupée correcte
```

### Frontend

#### 1. Imports

**Avant:**
```typescript
import type { Notification } from '@/types/notification';

// Accès direct aux champs
notification.title
notification.sender?.username
notification.conversationId
notification.isRead
notification.createdAt
```

**Après:**
```typescript
import type { Notification } from '@/types/notification';
import { buildNotificationTitle } from '@/utils/notification-helpers';

// Accès groupé
buildNotificationTitle(notification, t)  // Title construit
notification.actor?.username
notification.context.conversationId
notification.state.isRead
notification.state.createdAt
```

#### 2. Composants UI

**Avant:**
```typescript
function NotificationItem({ notification }) {
  return (
    <div>
      <h3>{notification.title}</h3>
      <Avatar src={notification.sender?.avatar} />
      <p>{notification.content}</p>
      <span>{formatDate(notification.createdAt)}</span>
      {!notification.isRead && <Badge>Non lu</Badge>}
    </div>
  );
}
```

**Après:**
```typescript
function NotificationItem({ notification }) {
  const { t } = useI18n('notifications');

  return (
    <div>
      <h3>{buildNotificationTitle(notification, t)}</h3>
      <Avatar src={notification.actor?.avatar} />
      <p>{notification.content}</p>
      <span>{formatDate(notification.state.createdAt)}</span>
      {!notification.state.isRead && <Badge>Non lu</Badge>}
    </div>
  );
}
```

#### 3. Socket.IO Client

**Avant:**
```typescript
socket.on('notification', (data) => {
  const notification = {
    id: data.id,
    type: data.type,
    title: data.title,
    sender: {
      id: data.senderId,
      username: data.senderUsername,
      avatar: data.senderAvatar
    },
    conversationId: data.conversationId,
    isRead: data.isRead,
    createdAt: new Date(data.createdAt)
  };

  addNotification(notification);
});
```

**Après:**
```typescript
socket.on('notification:new', (data) => {
  // data est déjà dans le bon format groupé
  const notification: Notification = {
    id: data.id,
    userId: data.userId,
    type: data.type,
    priority: data.priority,
    content: data.content,
    actor: data.actor,
    context: data.context,
    metadata: data.metadata,
    state: {
      isRead: data.state.isRead,
      readAt: data.state.readAt ? new Date(data.state.readAt) : null,
      createdAt: new Date(data.state.createdAt)
    },
    delivery: data.delivery
  };

  addNotification(notification);
});
```

#### 4. Recherche/Filtrage

**Avant:**
```typescript
const filtered = notifications.filter(n => {
  const title = n.title.toLowerCase();
  const content = n.content.toLowerCase();
  const sender = n.sender?.username.toLowerCase();

  return title.includes(query) ||
         content.includes(query) ||
         sender?.includes(query);
});
```

**Après:**
```typescript
const filtered = notifications.filter(n => {
  const content = n.content.toLowerCase();
  const actor = n.actor?.username.toLowerCase();

  return content.includes(query) || actor?.includes(query);
});
```

#### 5. Navigation

**Avant:**
```typescript
function handleClick(notification) {
  if (notification.conversationId) {
    if (notification.messageId) {
      router.push(`/conversations/${notification.conversationId}?messageId=${notification.messageId}`);
    } else {
      router.push(`/conversations/${notification.conversationId}`);
    }
  }
}
```

**Après:**
```typescript
function handleClick(notification) {
  if (notification.context.conversationId) {
    if (notification.context.messageId) {
      router.push(`/conversations/${notification.context.conversationId}?messageId=${notification.context.messageId}`);
    } else {
      router.push(`/conversations/${notification.context.conversationId}`);
    }
  }
}
```

## Helpers de Migration

### buildNotificationTitle()

Construit dynamiquement le title avec i18n:

```typescript
import { buildNotificationTitle } from '@/utils/notification-helpers';
import { useI18n } from '@/hooks/use-i18n';

function MyComponent({ notification }) {
  const { t } = useI18n('notifications');
  const title = buildNotificationTitle(notification, t);

  return <h3>{title}</h3>;
}
```

### Type Guards

Pour typer correctement le metadata:

```typescript
import {
  isMessageNotification,
  isMentionNotification,
  isReactionNotification
} from '@meeshy/shared/types/notification';

if (isMessageNotification(notification)) {
  // metadata.attachments est typé correctement
  const attachments = notification.metadata.attachments;
}

if (isReactionNotification(notification)) {
  // metadata.reactionEmoji est typé correctement
  const emoji = notification.metadata.reactionEmoji;
}
```

### Parsing Sécurisé

Le service frontend parse automatiquement:

```typescript
import { NotificationService } from '@/services/notification.service';

const response = await NotificationService.fetchNotifications({
  offset: 0,
  limit: 50
});

// response.data.notifications est déjà parsé avec dates converties
response.data.notifications.forEach(n => {
  console.log(n.state.createdAt instanceof Date);  // true
});
```

## Breaking Changes

### ❌ Champs Supprimés

Ces champs n'existent plus:

```typescript
notification.title           // Utiliser buildNotificationTitle()
notification.senderId        // Utiliser notification.actor?.id
notification.senderUsername  // Utiliser notification.actor?.username
notification.senderAvatar    // Utiliser notification.actor?.avatar
notification.conversationId  // Utiliser notification.context.conversationId
notification.messageId       // Utiliser notification.context.messageId
notification.isRead          // Utiliser notification.state.isRead
notification.readAt          // Utiliser notification.state.readAt
notification.createdAt       // Utiliser notification.state.createdAt
notification.data            // Utiliser notification.metadata
```

### ⚠️ Champs Renommés

| Ancien | Nouveau | Notes |
|--------|---------|-------|
| `sender` | `actor` | Nouveau nom plus précis |
| `messagePreview` | `content` | Unifié dans content |
| `data` | `metadata` | Typé avec discriminated unions |
| `isRead` | `state.isRead` | Groupé dans state |
| `createdAt` | `state.createdAt` | Groupé dans state |

### ✅ Champs Ajoutés

```typescript
notification.priority         // 'low' | 'normal' | 'high' | 'urgent'
notification.context         // Object groupé
notification.metadata        // Object typé
notification.state           // Object groupé
notification.delivery        // Object groupé
notification.state.expiresAt // Date d'expiration optionnelle
```

## Checklist de Migration

### Backend

- [ ] Remplacer création directe en DB par NotificationService
- [ ] Utiliser méthodes `createXXXNotification()` spécifiques
- [ ] Vérifier que Socket.IO utilise la nouvelle structure
- [ ] Tester API endpoints avec nouvelle structure
- [ ] Migrer ou drop les notifications existantes

### Frontend

- [ ] Remplacer `notification.title` par `buildNotificationTitle()`
- [ ] Remplacer `notification.sender` par `notification.actor`
- [ ] Remplacer `notification.conversationId` par `notification.context.conversationId`
- [ ] Remplacer `notification.isRead` par `notification.state.isRead`
- [ ] Remplacer `notification.createdAt` par `notification.state.createdAt`
- [ ] Mettre à jour Socket.IO client pour nouvelle structure
- [ ] Tester composants UI avec nouvelle structure
- [ ] Ajouter i18n pour titles des notifications
- [ ] Vérifier navigation avec context

### Tests

- [ ] Tests unitaires NotificationService
- [ ] Tests unitaires buildNotificationTitle
- [ ] Tests composants UI
- [ ] Tests Socket.IO
- [ ] Tests end-to-end création/lecture

### Documentation

- [ ] Mettre à jour README
- [ ] Documenter API endpoints
- [ ] Exemples de code
- [ ] Guide des types disponibles

## Timeline Recommandée

### Phase 1: Préparation (1 jour)
- Créer types partagés
- Mettre à jour schema Prisma
- Créer script de migration

### Phase 2: Backend (2-3 jours)
- Implémenter NotificationService
- Mettre à jour routes API
- Tester Socket.IO

### Phase 3: Frontend (2-3 jours)
- Mettre à jour types
- Créer helpers (buildNotificationTitle)
- Mettre à jour composants UI
- Mettre à jour Socket.IO client

### Phase 4: Tests & Documentation (1-2 jours)
- Tests unitaires
- Tests end-to-end
- Documentation

### Phase 5: Déploiement (1 jour)
- Migration DB
- Monitoring
- Rollback plan si besoin

**Total: 7-10 jours**

## Support

En cas de problème:

1. **Vérifier la structure des données:**
   ```typescript
   console.log('Notification structure:', notification);
   ```

2. **Vérifier que buildNotificationTitle est utilisé:**
   ```typescript
   const title = buildNotificationTitle(notification, t);
   console.log('Title:', title);
   ```

3. **Vérifier le parsing Socket.IO:**
   ```typescript
   socket.on('notification:new', (data) => {
     console.log('Raw data:', data);
     console.log('Actor:', data.actor);
     console.log('Context:', data.context);
   });
   ```

4. **Vérifier les type guards:**
   ```typescript
   console.log('Is message?', isMessageNotification(notification));
   console.log('Metadata:', notification.metadata);
   ```

## FAQ

### Q: Pourquoi supprimer le champ `title`?

**R:** Pour supporter i18n nativement et permettre la mise à jour facile des textes sans migration DB.

### Q: Puis-je garder l'ancienne structure temporairement?

**R:** Non, le code ne supporte plus la structure legacy. Une migration complète est nécessaire.

### Q: Comment migrer sans perdre les notifications?

**R:** Utilisez le script de migration personnalisé pour convertir les anciennes notifications. Contactez l'équipe pour assistance.

### Q: Que faire si mon code ne compile plus?

**R:** Suivez les changements dans la section "Breaking Changes" et utilisez les helpers fournis.

### Q: Comment tester la migration localement?

**R:**
1. Drop les notifications: `node scripts/migrations/drop-notifications.ts --confirm`
2. Créer des notifications de test via API
3. Vérifier l'affichage dans l'UI

### Q: Le title s'affiche "undefined" ou "null"?

**R:** Vérifiez que vous utilisez bien `buildNotificationTitle()` avec la fonction `t` d'i18n.

### Q: Les notifications Socket.IO ne s'affichent pas?

**R:** Vérifiez que le parsing dans le client Socket.IO utilise la nouvelle structure groupée.

### Q: Comment ajouter un nouveau type de notification?

**R:**
1. Ajouter le type dans `NotificationTypeEnum`
2. Créer l'interface metadata dans shared types
3. Ajouter méthode `createXXXNotification()` dans NotificationService
4. Ajouter la clé i18n dans `locales/{lang}/notifications.json`
5. Mettre à jour `buildNotificationTitle()` si besoin
