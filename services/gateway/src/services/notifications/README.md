# Notification System Architecture

## Overview

Système de notifications modulaire et scalable avec support multi-canal (WebSocket + Firebase Push).

## Structure des Modules

```
src/services/notifications/
├── NotificationService.ts              (649 lignes) - Orchestrateur principal
├── FirebaseNotificationService.ts      (223 lignes) - Push notifications
├── SocketNotificationService.ts        (83 lignes)  - WebSocket temps réel
├── NotificationFormatter.ts            (188 lignes) - Formatage et transformations
├── NotificationServiceExtensions.ts    (378 lignes) - Méthodes spécialisées
├── types.ts                            (86 lignes)  - Types TypeScript
├── index.ts                            (18 lignes)  - Exports publics
└── README.md                           - Documentation
```

**Total: 1,625 lignes** (vs 2,033 lignes originales = -20% de code)

## Architecture

### Composition Forte

```typescript
NotificationService (Orchestrateur)
├── FirebaseNotificationService   (Composition)
├── SocketNotificationService     (Composition)
└── NotificationFormatter         (Composition)
```

### Responsabilités par Module

#### 1. NotificationService (Core Orchestrator)
**Responsabilités:**
- Orchestration des sous-services
- Gestion du cycle de vie des notifications (CRUD)
- Application des préférences utilisateur
- Anti-spam et rate limiting
- Métriques et statistiques
- Sanitisation des données

**API Principale:**
```typescript
- createNotification(data: CreateNotificationData): Promise<NotificationEventData>
- createMessageNotification(data): Promise<NotificationEventData>
- createMissedCallNotification(data): Promise<NotificationEventData>
- createMentionNotificationsBatch(userIds, data, memberIds): Promise<number>
- markAsRead(notificationId, userId): Promise<boolean>
- markAllAsRead(userId): Promise<boolean>
- getUnreadCount(userId): Promise<number>
- getNotificationStats(userId): Promise<NotificationStats>
```

#### 2. FirebaseNotificationService
**Responsabilités:**
- Vérification et initialisation de Firebase Admin SDK
- Envoi de notifications push via Firebase Cloud Messaging
- Gestion gracieuse des erreurs (ne jamais crasher)
- Validation des FCM tokens

**Caractéristiques:**
- Fallback gracieux si Firebase n'est pas configuré
- Timeout de 5 secondes sur les requêtes
- Logging détaillé sans bloquer l'application

**API:**
```typescript
- sendPushNotification(userId, notification): Promise<boolean>
- isAvailable(): boolean
```

#### 3. SocketNotificationService
**Responsabilités:**
- Émission temps réel via Socket.IO
- Gestion du mapping utilisateur → sockets
- Support multi-device (broadcast à tous les sockets d'un utilisateur)

**API:**
```typescript
- setSocketIO(io, userSocketsMap): void
- emitNotification(userId, notification): boolean
- isInitialized(): boolean
- getUserSocketCount(userId): number
```

#### 4. NotificationFormatter
**Responsabilités:**
- Formatage des aperçus de messages
- Troncature intelligente du contenu
- Génération de descriptions d'attachments
- Transformation Prisma → Socket.IO events

**API:**
```typescript
- truncateMessage(message, maxWords): string
- formatAttachmentInfo(attachments): AttachmentInfo | null
- formatMessagePreview(content, attachments, maxWords): string
- formatNotificationEvent(notification): NotificationEventData
- createNotificationData(...): any
```

#### 5. NotificationServiceExtensions
**Responsabilités:**
- Méthodes de notification spécialisées
- Logique métier spécifique par type
- Abstraction high-level

**Types de Notifications:**
```typescript
- createReplyNotification()          // Réponses aux messages
- createReactionNotification()       // Réactions emoji
- createContactRequestNotification() // Demandes de contact
- createContactAcceptedNotification() // Acceptation de contact
- createDirectConversationNotification() // Conversations 1:1
- createGroupConversationNotification()  // Invitations de groupe
- createMemberJoinedNotification()   // Nouveaux membres (batch)
- createSystemNotification()         // Notifications système
```

## Types de Notifications Supportés

```typescript
type NotificationType =
  | 'new_message'              // Nouveau message
  | 'new_conversation_direct'  // Conversation directe
  | 'new_conversation_group'   // Conversation de groupe
  | 'message_reply'            // Réponse à un message
  | 'member_joined'            // Membre a rejoint
  | 'contact_request'          // Demande de contact
  | 'contact_accepted'         // Contact accepté
  | 'user_mentioned'           // Mention d'utilisateur
  | 'message_reaction'         // Réaction à un message
  | 'missed_call'              // Appel manqué
  | 'system'                   // Notification système
  | 'message_edited';          // Message édité
```

## Flux de Données

### 1. Création d'une Notification

```
API Request
    ↓
NotificationService.createNotification()
    ↓
├── Validation et sanitisation (SecuritySanitizer)
├── Vérification des préférences utilisateur
├── Création en DB (Prisma)
    ↓
├── SocketNotificationService.emitNotification()  [Temps réel]
└── FirebaseNotificationService.sendPushNotification() [Background, fire-and-forget]
```

### 2. Notifications par Batch (Mentions)

```
createMentionNotificationsBatch(userIds, data, memberIds)
    ↓
├── Rate limiting anti-spam (5 mentions/min)
├── Filtrage selon préférences utilisateur
├── Formatage unique du message (évite duplication)
    ↓
prisma.notification.createMany() [1 query au lieu de N]
    ↓
Émission Socket.IO pour chaque utilisateur
```

## Sécurité

### Sanitisation
Toutes les entrées utilisateur sont sanitisées:
```typescript
- SecuritySanitizer.sanitizeText()      // Titre, contenu, noms
- SecuritySanitizer.sanitizeUsername()  // Usernames
- SecuritySanitizer.sanitizeURL()       // Avatars, liens
- SecuritySanitizer.sanitizeJSON()      // Données JSON
```

### Anti-Spam
- Rate limiting: max 5 mentions/minute par paire (sender → recipient)
- Nettoyage automatique des anciens timestamps toutes les 2 minutes
- Validation des types de notification contre une whitelist

### Validation
- Types de notification validés (whitelist)
- Priorités validées ('low' | 'normal' | 'high' | 'urgent')
- Tous les IDs d'utilisateurs vérifiés en DB

## Préférences Utilisateur

### Types de Préférences
```typescript
interface NotificationPreference {
  // Par type
  newMessageEnabled: boolean;
  replyEnabled: boolean;
  mentionEnabled: boolean;
  reactionEnabled: boolean;
  missedCallEnabled: boolean;
  systemEnabled: boolean;
  conversationEnabled: boolean;
  contactRequestEnabled: boolean;
  memberJoinedEnabled: boolean;

  // Do Not Disturb
  dndEnabled: boolean;
  dndStartTime?: string;  // "22:00"
  dndEndTime?: string;    // "08:00"
}
```

### Logique d'Application
1. Vérifier si DND est actif (plage horaire)
2. Si DND actif → bloquer notification
3. Sinon → vérifier préférence par type
4. Par défaut → envoyer si pas de préférence

## Performance

### Optimisations
1. **Batch Creation**: `createMany()` au lieu de boucle `create()`
2. **Formatage Unique**: Message formaté une seule fois pour batch mentions
3. **Fire-and-Forget Firebase**: Push notifications asynchrones non-bloquantes
4. **Cache Anti-Spam**: Map en mémoire pour rate limiting
5. **Queries Optimisées**: Sélection uniquement des champs nécessaires

### Métriques
```typescript
interface NotificationMetrics {
  notificationsCreated: number;   // Total créées
  webSocketSent: number;          // Envoyées via Socket.IO
  firebaseSent: number;           // Envoyées via Firebase
  firebaseFailed: number;         // Échecs Firebase
  firebaseEnabled: boolean;       // Firebase disponible
}
```

## Gestion des Erreurs

### Principe: Never Crash
- Firebase échoue → continue avec WebSocket uniquement
- Socket.IO non initialisé → notification sauvegardée en DB
- User non trouvé → log warning + continue
- Préférences non trouvées → utilise defaults

### Logging
```typescript
logger.info()   // Succès
logger.warn()   // Avertissements (non-critiques)
logger.error()  // Erreurs (mais pas de crash)
logger.debug()  // Debug détaillé
```

## Usage

### Import Basique
```typescript
import { NotificationService } from '@/services/notifications';
import type { CreateNotificationData, NotificationEventData } from '@/services/notifications';

const notificationService = new NotificationService(prisma);
notificationService.setSocketIO(io, userSocketsMap);
```

### Créer une Notification Simple
```typescript
const notification = await notificationService.createNotification({
  userId: 'user-123',
  type: 'new_message',
  title: 'Nouveau message',
  content: 'Hello world',
  priority: 'normal',
  senderId: 'sender-456',
  senderUsername: 'john_doe',
  conversationId: 'conv-789',
  messageId: 'msg-101'
});
```

### Créer des Mentions en Batch
```typescript
const count = await notificationService.createMentionNotificationsBatch(
  ['user-1', 'user-2', 'user-3'],  // Utilisateurs mentionnés
  {
    senderId: 'sender-id',
    senderUsername: 'john',
    messageContent: '@user-1 @user-2 @user-3 Hello!',
    conversationId: 'conv-123',
    messageId: 'msg-456'
  },
  ['user-1', 'user-2']  // Membres de la conversation
);
```

### Utiliser les Extensions
```typescript
import { NotificationServiceExtensions } from '@/services/notifications/NotificationServiceExtensions';

const extensions = new NotificationServiceExtensions(notificationService, prisma);

await extensions.createReplyNotification({
  originalMessageAuthorId: 'author-id',
  replierId: 'replier-id',
  replyContent: 'Great idea!',
  // ...
});
```

## Migration depuis l'Ancien Service

### Changements d'Import
```typescript
// Avant
import { NotificationService } from '@/services/NotificationService';

// Après
import { NotificationService } from '@/services/notifications';
// Ou pour les types
import type { CreateNotificationData } from '@/services/notifications';
```

### Compatibilité
✅ **100% compatible** - Toutes les méthodes publiques sont identiques

### Nouvelles Fonctionnalités
- Métriques détaillées: `getMetrics()`
- Stats par type: `getNotificationStats(userId)`
- Extensions: `NotificationServiceExtensions`
- Formatter indépendant: `NotificationFormatter`

## Tests

### Modules à Tester
1. `NotificationService` - Tests d'intégration
2. `FirebaseNotificationService` - Mock Firebase Admin SDK
3. `SocketNotificationService` - Mock Socket.IO
4. `NotificationFormatter` - Tests unitaires purs
5. `NotificationServiceExtensions` - Tests des méthodes spécialisées

### Exemples de Tests
```typescript
describe('NotificationFormatter', () => {
  it('should truncate long messages', () => {
    const formatter = new NotificationFormatter();
    const result = formatter.truncateMessage('a '.repeat(30), 10);
    expect(result).toContain('...');
  });
});

describe('NotificationService', () => {
  it('should respect user preferences', async () => {
    // Mock prisma.notificationPreference
    // Tester que notification n'est pas créée si disabled
  });
});
```

## Monitoring

### Métriques à Surveiller
1. **Taux de livraison WebSocket**: `webSocketSent / notificationsCreated`
2. **Taux de succès Firebase**: `firebaseSent / (firebaseSent + firebaseFailed)`
3. **Notifications par type**: `getNotificationStats()`
4. **Rate limiting hits**: Logs "rate limited"

### Alertes Recommandées
- Firebase down pendant > 5 minutes
- Taux d'échec Firebase > 10%
- Pic de notifications créées (possible spam)
- Socket.IO non initialisé pendant > 1 minute

## Maintenance

### Tâches Périodiques
1. **Nettoyage des notifications expirées**:
   ```sql
   DELETE FROM notifications WHERE expiresAt < NOW();
   ```

2. **Archivage des anciennes notifications**:
   ```sql
   -- Archiver notifications lues > 30 jours
   ```

3. **Analyse des métriques**:
   - Identifier les types de notifications les plus fréquents
   - Optimiser les préférences par défaut

### Évolutions Futures
- [ ] Support des notifications groupées (digest)
- [ ] Notification channels (email, SMS)
- [ ] Templates personnalisables
- [ ] A/B testing des formats
- [ ] Analytics avancées (taux d'ouverture, etc.)

## Références

- Firebase Admin SDK: https://firebase.google.com/docs/admin/setup
- Socket.IO: https://socket.io/docs/v4/
- Prisma Client: https://www.prisma.io/docs/concepts/components/prisma-client
