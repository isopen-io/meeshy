# Architecture du Système de Notifications

## Diagramme de Composition

```
┌─────────────────────────────────────────────────────────────────┐
│                     NotificationService                         │
│                    (Orchestrateur Principal)                    │
│                                                                 │
│  Responsabilités:                                               │
│  - Orchestration des sous-services                             │
│  - Gestion du cycle de vie des notifications                   │
│  - Application des préférences utilisateur                     │
│  - Anti-spam et rate limiting                                  │
│  - Métriques et statistiques                                   │
│                                                                 │
│  ┌───────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │   Firebase    │  │     Socket.IO    │  │   Formatter     │ │
│  │   Service     │  │     Service      │  │                 │ │
│  │               │  │                  │  │                 │ │
│  │ • Push FCM    │  │ • Emit events    │  │ • Truncate      │ │
│  │ • Graceful    │  │ • Multi-device   │  │ • Format msgs   │ │
│  │   fallback    │  │ • User mapping   │  │ • Attachments   │ │
│  └───────────────┘  └──────────────────┘  └─────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ extends with
                              ▼
        ┌─────────────────────────────────────────┐
        │   NotificationServiceExtensions         │
        │                                         │
        │  Méthodes Spécialisées:                 │
        │  • createReplyNotification()           │
        │  • createReactionNotification()        │
        │  • createContactRequestNotification()  │
        │  • createMemberJoinedNotification()    │
        │  • createSystemNotification()          │
        └─────────────────────────────────────────┘
```

## Flux de Données - Création de Notification

```
┌──────────────┐
│  API Request │
│   (Route)    │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ NotificationService.createNotification()                │
└─────────────────────────────────────────────────────────┘
       │
       ├─► 1. Validation & Sanitization
       │      └─► SecuritySanitizer
       │          ├─► sanitizeText()
       │          ├─► sanitizeUsername()
       │          ├─► sanitizeURL()
       │          └─► sanitizeJSON()
       │
       ├─► 2. User Preferences Check
       │      └─► prisma.notificationPreference.findUnique()
       │          ├─► Check DND (Do Not Disturb)
       │          └─► Check type-specific preferences
       │
       ├─► 3. Database Creation
       │      └─► prisma.notification.create()
       │          └─► Returns Notification object
       │
       ├─► 4. Format for Socket.IO
       │      └─► NotificationFormatter.formatNotificationEvent()
       │
       ├─► 5. WebSocket Emission (CRITICAL PATH)
       │      └─► SocketNotificationService.emitNotification()
       │          ├─► Get user sockets from map
       │          ├─► io.to(socketId).emit('notification', event)
       │          └─► Return immediately (non-blocking)
       │
       └─► 6. Firebase Push (BACKGROUND, FIRE-AND-FORGET)
              └─► FirebaseNotificationService.sendPushNotification()
                  ├─► Check if Firebase available
                  ├─► Get FCM token from DB
                  ├─► Send via Firebase Admin SDK (timeout 5s)
                  └─► Log success/failure (never throws)
```

## Flux de Données - Batch Mentions

```
┌───────────────────────────────────────────────────┐
│ createMentionNotificationsBatch()                 │
│   Input:                                          │
│   - mentionedUserIds: string[]                   │
│   - commonData: { sender, message, ... }         │
│   - memberIds: string[]                          │
└───────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 1. Format Message (ONCE)                │
│    NotificationFormatter                │
│    ├─► formatMessagePreview()           │
│    └─► formatAttachmentInfo()           │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 2. Filter Recipients                    │
│    FOR EACH mentionedUserId:            │
│    ├─► Skip if userId === senderId     │
│    ├─► Check rate limit (5/min)        │
│    └─► Check user preferences          │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 3. Build Notification Data (Batch)     │
│    MAP validUserIds → notificationData  │
│    ├─► Determine isMember              │
│    ├─► Set content based on membership │
│    └─► Add attachment info             │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 4. Create in DB (SINGLE QUERY)         │
│    prisma.notification.createMany()    │
│    └─► Batch insert (N notifications)  │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 5. Fetch Created Notifications          │
│    prisma.notification.findMany()       │
│    WHERE messageId + type + userIds     │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ 6. Emit via Socket.IO                   │
│    FOR EACH notification:               │
│    └─► SocketService.emitNotification()│
└─────────────────────────────────────────┘
```

## Hiérarchie des Responsabilités

```
┌────────────────────────────────────────────────────┐
│               BUSINESS LOGIC LAYER                 │
│                                                    │
│  NotificationService (Orchestrator)                │
│  • Preferences enforcement                        │
│  • Rate limiting                                  │
│  • Metrics tracking                               │
│  • Security validation                            │
│                                                    │
│  NotificationServiceExtensions                     │
│  • Domain-specific notification logic             │
│  • High-level convenience methods                 │
└────────────────────────────────────────────────────┘
                       │
                       │ uses
                       ▼
┌────────────────────────────────────────────────────┐
│               SERVICE LAYER                        │
│                                                    │
│  FirebaseNotificationService                       │
│  • FCM integration                                │
│  • Error handling                                 │
│  • Token management                               │
│                                                    │
│  SocketNotificationService                         │
│  • Real-time delivery                             │
│  • Connection management                          │
│  • Multi-device support                           │
│                                                    │
│  NotificationFormatter                             │
│  • Data transformation                            │
│  • Message formatting                             │
│  • Type conversions                               │
└────────────────────────────────────────────────────┘
                       │
                       │ uses
                       ▼
┌────────────────────────────────────────────────────┐
│               DATA ACCESS LAYER                    │
│                                                    │
│  Prisma Client                                     │
│  • Database operations                            │
│  • Transactions                                   │
│  • Type-safe queries                              │
└────────────────────────────────────────────────────┘
```

## Dépendances entre Modules

```
NotificationService
├── depends on → FirebaseNotificationService
│                └── depends on → Prisma
│
├── depends on → SocketNotificationService
│                └── depends on → Socket.IO
│
└── depends on → NotificationFormatter
                 └── no external dependencies (pure logic)

NotificationServiceExtensions
└── depends on → NotificationService
                 └── (inherits all dependencies)
```

## Patterns de Design Utilisés

### 1. Composition over Inheritance
```typescript
class NotificationService {
  private firebaseService: FirebaseNotificationService;
  private socketService: SocketNotificationService;
  private formatter: NotificationFormatter;

  constructor(prisma: PrismaClient) {
    this.firebaseService = new FirebaseNotificationService(prisma);
    this.socketService = new SocketNotificationService();
    this.formatter = new NotificationFormatter();
  }
}
```

### 2. Dependency Injection
```typescript
// Prisma injecté au constructeur
constructor(private prisma: PrismaClient) { ... }

// Socket.IO injecté après initialisation
setSocketIO(io: SocketIOServer, userSocketsMap: Map<...>) { ... }
```

### 3. Single Responsibility Principle
```
FirebaseNotificationService → Uniquement push notifications
SocketNotificationService   → Uniquement WebSocket
NotificationFormatter       → Uniquement formatage
NotificationService         → Orchestration uniquement
```

### 4. Strategy Pattern (Implicite)
```typescript
// Choix de la stratégie de livraison
if (FirebaseService.isAvailable()) {
  // Stratégie Firebase
} else {
  // Stratégie WebSocket uniquement
}
```

### 5. Factory Pattern (via Extensions)
```typescript
// NotificationServiceExtensions agit comme factory
extensions.createReplyNotification(...)
extensions.createReactionNotification(...)
extensions.createContactRequestNotification(...)
```

## Gestion des Erreurs - Layers de Défense

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: Input Validation                          │
│ • SecuritySanitizer.isValidNotificationType()      │
│ • SecuritySanitizer.isValidPriority()              │
│ └─► Throw error if invalid                        │
└─────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ Layer 2: Business Rules                            │
│ • Check user preferences                           │
│ • Apply rate limiting                              │
│ └─► Return null if blocked (graceful)             │
└─────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ Layer 3: Database Operations                       │
│ • Try/catch on Prisma operations                   │
│ • Log errors                                       │
│ └─► Return default values on error                │
└─────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│ Layer 4: Delivery Mechanisms                       │
│ • Firebase: Fire-and-forget, log failures          │
│ • Socket.IO: Try/catch, continue on error          │
│ └─► NEVER crash the application                   │
└─────────────────────────────────────────────────────┘
```

## Performance Optimizations

### 1. Batch Operations
```sql
-- Before (N queries)
INSERT INTO notifications (userId, type, ...) VALUES (...)
INSERT INTO notifications (userId, type, ...) VALUES (...)
INSERT INTO notifications (userId, type, ...) VALUES (...)

-- After (1 query)
INSERT INTO notifications (userId, type, ...) VALUES
  (...),
  (...),
  (...)
```

### 2. Fire-and-Forget Firebase
```typescript
// Non-blocking Firebase push
this.firebaseService.sendPushNotification(userId, notification)
  .catch(error => logger.debug('Firebase push skipped:', error.message));

// Application continues immediately
return notificationEvent;
```

### 3. Formatting Optimization (Batch Mentions)
```typescript
// Format message ONCE for all mentions
const messagePreview = formatter.formatMessagePreview(...);
const attachmentInfo = formatter.formatAttachmentInfo(...);

// Reuse for all notifications
notificationsData.map(userId => ({
  messagePreview,  // Reused
  attachmentInfo   // Reused
}));
```

### 4. In-Memory Rate Limiting
```typescript
// Map en mémoire (pas de DB query)
private recentMentions: Map<string, number[]> = new Map();

// Cleanup automatique toutes les 2 minutes
setInterval(() => this.cleanupOldMentions(), 120000);
```

## Sécurité - Defense in Depth

```
┌──────────────────────────────────────────┐
│ 1. Input Sanitization                   │
│    SecuritySanitizer.sanitizeText()     │
│    • XSS prevention                     │
│    • SQL injection prevention           │
└──────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│ 2. Type Validation                      │
│    isValidNotificationType()            │
│    • Whitelist enforcement              │
└──────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│ 3. Rate Limiting                        │
│    shouldCreateMentionNotification()    │
│    • Anti-spam (5 mentions/min)         │
└──────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│ 4. User Authorization                   │
│    Check user preferences               │
│    • Privacy enforcement                │
└──────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────┐
│ 5. Secure Transmission                  │
│    Socket.IO / Firebase                 │
│    • Encrypted connections (TLS)        │
└──────────────────────────────────────────┘
```

## Scalability Considerations

### Horizontal Scaling
```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  Gateway 1  │   │  Gateway 2  │   │  Gateway 3  │
│  (Socket.IO)│   │  (Socket.IO)│   │  (Socket.IO)│
└─────┬───────┘   └─────┬───────┘   └─────┬───────┘
      │                 │                 │
      └─────────────────┴─────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  Redis Adapter   │
              │  (Socket.IO)     │
              └──────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  Shared Database │
              │  (Notifications) │
              └──────────────────┘
```

### Vertical Scaling
- Batch operations reduce DB load
- In-memory caching (rate limiting)
- Fire-and-forget Firebase (non-blocking)
- Async/await throughout

## Testing Strategy

### Unit Tests
```
NotificationFormatter
├─► truncateMessage()
├─► formatAttachmentInfo()
└─► formatMessagePreview()
    (Pure functions, no mocks needed)

FirebaseNotificationService
├─► Mock Firebase Admin SDK
└─► Test error scenarios

SocketNotificationService
├─► Mock Socket.IO
└─► Test multi-device scenarios
```

### Integration Tests
```
NotificationService
├─► Mock Prisma
├─► Test preference enforcement
├─► Test rate limiting
└─► Test end-to-end flow
```

### E2E Tests
```
Full notification flow
├─► Create notification via API
├─► Verify DB record
├─► Verify Socket.IO emission
└─► Verify Firebase push attempt
```

## Monitoring & Observability

### Metrics to Track
```typescript
interface NotificationMetrics {
  notificationsCreated: number;   // Counter
  webSocketSent: number;          // Counter
  firebaseSent: number;           // Counter
  firebaseFailed: number;         // Counter
  firebaseEnabled: boolean;       // Gauge
}
```

### Logging Levels
```
ERROR: Critical failures (should alert)
WARN:  Degraded state (Firebase unavailable)
INFO:  Important events (notification created)
DEBUG: Detailed flow (user not connected)
```

### Health Checks
```typescript
GET /health/notifications
{
  "status": "healthy",
  "firebase": "available",
  "socketio": "initialized",
  "metrics": {
    "notificationsCreated": 12450,
    "successRate": 0.99
  }
}
```

## Future Enhancements

### 1. Email Notifications
```typescript
class EmailNotificationService {
  async sendEmail(userId: string, notification: NotificationEventData) {
    // Send via SendGrid, SES, etc.
  }
}

// Add to NotificationService composition
this.emailService = new EmailNotificationService();
```

### 2. SMS Notifications
```typescript
class SMSNotificationService {
  async sendSMS(phoneNumber: string, notification: NotificationEventData) {
    // Send via Twilio, SNS, etc.
  }
}
```

### 3. Notification Grouping
```typescript
// Group multiple notifications by conversation
interface NotificationGroup {
  conversationId: string;
  count: number;
  latestNotification: NotificationEventData;
}
```

### 4. Rich Templates
```typescript
interface NotificationTemplate {
  type: string;
  titleTemplate: string;
  contentTemplate: string;
  variables: string[];
}
```

### 5. Analytics
```typescript
interface NotificationAnalytics {
  openRate: number;
  clickRate: number;
  dismissRate: number;
  avgTimeToRead: number;
}
```
