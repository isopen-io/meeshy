# Système de Notifications v2 - Frontend Documentation

## Vue d'Ensemble

Le système de notifications v2 pour Meeshy est une implémentation complète et moderne qui gère 11 types de notifications différents avec support real-time via Socket.IO, pagination infinie, filtrage avancé, et une UX riche et accessible.

### Fonctionnalités Principales

- ✅ **11 Types de Notifications** : Messages, réponses, mentions, réactions, contacts, groupes, appels, système
- ✅ **Real-Time Socket.IO** : Notifications instantanées avec fallback polling automatique
- ✅ **Store Zustand** : State management performant avec persistence localStorage
- ✅ **Pagination Infinie** : Scroll infini avec Intersection Observer
- ✅ **Filtrage Avancé** : Par type, statut, conversation, priorité
- ✅ **Formatage Contextuel** : Timestamps intelligents, previews de messages, icônes
- ✅ **Internationalisation** : Support complet en/fr/es/pt
- ✅ **Accessible** : ARIA labels, navigation clavier, screen readers
- ✅ **Responsive** : Mobile-first design avec adaptation desktop
- ✅ **Performance** : Optimistic updates, retry logic, caching

---

## Architecture

```
frontend/
├── types/
│   └── notification-v2.ts              # Types TypeScript complets
├── stores/
│   └── notification-store-v2.ts        # Store Zustand avec Socket.IO
├── services/
│   └── notifications-v2.service.ts     # Service API avec retry logic
├── hooks/
│   └── use-notifications-v2.ts         # Hook custom avec polling fallback
├── utils/
│   └── notification-formatters.ts      # Utilitaires de formatage
├── components/
│   └── notifications-v2/
│       ├── NotificationBell.tsx        # Composant cloche avec badge
│       ├── NotificationList.tsx        # Liste avec infinite scroll
│       ├── NotificationItem.tsx        # Item formaté contextuel
│       └── index.ts                    # Exports centralisés
└── locales/
    ├── en/notifications.json           # Traductions anglais
    ├── fr/notifications.json           # Traductions français
    ├── es/notifications.json           # Traductions espagnol
    └── pt/notifications.json           # Traductions portugais
```

---

## Installation et Setup

### 1. Dépendances

Les dépendances suivantes sont déjà présentes dans le projet :

```json
{
  "dependencies": {
    "zustand": "^4.x",
    "socket.io-client": "^4.x",
    "next": "^14.x",
    "react": "^18.x",
    "sonner": "^1.x",
    "@radix-ui/react-*": "^1.x"
  }
}
```

### 2. Configuration Environnement

Aucune variable d'environnement supplémentaire n'est requise. Le système utilise les configurations existantes :

```typescript
// frontend/lib/config.ts
export const APP_CONFIG = {
  getBackendUrl: () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'
};
```

### 3. Intégration dans l'Application

#### a. Ajouter le NotificationBell dans le Header

```tsx
// frontend/components/layout/Header.tsx
import { NotificationBell } from '@/components/notifications-v2';

export function Header() {
  return (
    <header className="flex items-center gap-4">
      {/* Autres éléments du header */}
      <NotificationBell />
    </header>
  );
}
```

#### b. Initialiser le Hook dans le Layout Principal

```tsx
// frontend/app/layout.tsx ou frontend/components/providers/AppProviders.tsx
'use client';

import { useNotificationsV2 } from '@/hooks/use-notifications-v2';

function NotificationProvider({ children }: { children: React.ReactNode }) {
  // Auto-initialise les notifications pour l'utilisateur connecté
  useNotificationsV2();

  return <>{children}</>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      {children}
    </NotificationProvider>
  );
}
```

---

## Utilisation

### 1. Hook `useNotificationsV2`

Le hook principal pour gérer les notifications :

```tsx
import { useNotificationsV2 } from '@/hooks/use-notifications-v2';

function MyComponent() {
  const {
    // Données
    notifications,       // NotificationV2[]
    unreadCount,        // number
    counts,             // NotificationCounts

    // État
    isLoading,          // boolean
    isLoadingMore,      // boolean
    hasMore,            // boolean
    error,              // string | null
    filters,            // NotificationFilters

    // Connexion
    isConnected,        // boolean
    isSocketConnected,  // boolean
    isPolling,          // boolean

    // Actions
    initialize,
    disconnect,
    fetchNotifications,
    fetchMore,
    refresh,
    addNotification,
    removeNotification,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllRead,
    setFilters,
    clearFilters
  } = useNotificationsV2();

  return (
    <div>
      <p>Unread: {unreadCount}</p>
      <button onClick={markAllAsRead}>Mark all as read</button>
    </div>
  );
}
```

### 2. Composant `NotificationBell`

Affiche une cloche avec badge et dropdown :

```tsx
import { NotificationBell } from '@/components/notifications-v2';

function Header() {
  return (
    <NotificationBell
      showBadge={true}
      animated={true}
      className="ml-4"
    />
  );
}
```

**Props:**
- `count?: number` - Compteur personnalisé (sinon utilise unreadCount du store)
- `onClick?: () => void` - Callback personnalisé au clic
- `showBadge?: boolean` - Afficher le badge compteur (défaut: true)
- `animated?: boolean` - Animation pulse sur nouvelle notification (défaut: true)
- `className?: string` - Classes CSS additionnelles

### 3. Composant `NotificationList`

Liste scrollable avec infinite scroll :

```tsx
import { NotificationList } from '@/components/notifications-v2';

function NotificationsPage() {
  const { notifications, fetchMore, hasMore, isLoading } = useNotificationsV2();

  return (
    <NotificationList
      notifications={notifications}
      onLoadMore={fetchMore}
      hasMore={hasMore}
      isLoading={isLoading}
      emptyMessage="No notifications yet"
    />
  );
}
```

**Props:**
- `notifications: NotificationV2[]` - Tableau de notifications à afficher
- `onLoadMore?: () => void` - Callback pour charger plus (infinite scroll)
- `hasMore?: boolean` - Indique s'il reste des notifications à charger
- `isLoading?: boolean` - État de chargement
- `emptyMessage?: string` - Message si vide (défaut: "No notifications")
- `onNotificationClick?: (notification: NotificationV2) => void` - Callback au clic

### 4. Composant `NotificationListWithFilters`

Liste avec barre de filtres intégrée :

```tsx
import { NotificationListWithFilters } from '@/components/notifications-v2';

function NotificationsPage() {
  const {
    notifications,
    filters,
    setFilters,
    fetchMore,
    hasMore,
    isLoading
  } = useNotificationsV2();

  return (
    <NotificationListWithFilters
      notifications={notifications}
      filters={filters}
      onFilterChange={setFilters}
      onLoadMore={fetchMore}
      hasMore={hasMore}
      isLoading={isLoading}
      showFilters={true}
    />
  );
}
```

### 5. Composant `NotificationItem`

Item individuel avec formatage contextuel :

```tsx
import { NotificationItem } from '@/components/notifications-v2';

function MyNotificationList() {
  const { notifications, markAsRead, deleteNotification } = useNotificationsV2();

  return (
    <div>
      {notifications.map(notification => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRead={markAsRead}
          onDelete={deleteNotification}
          showActions={true}
          compact={false}
        />
      ))}
    </div>
  );
}
```

**Props:**
- `notification: NotificationV2` - Notification à afficher
- `onRead?: (id: string) => void` - Callback pour marquer comme lu
- `onDelete?: (id: string) => void` - Callback pour supprimer
- `onClick?: (notification: NotificationV2) => void` - Callback au clic
- `showActions?: boolean` - Afficher les actions (défaut: true)
- `compact?: boolean` - Mode compact (défaut: false)

---

## Types de Notifications

Le système supporte 11 types de notifications :

### 1. `NEW_MESSAGE` - "Message de XXXX"

Déclenché quand un utilisateur reçoit un nouveau message.

**Exemple:**
```typescript
{
  type: NotificationType.NEW_MESSAGE,
  title: "New message from Alice",
  content: "Hey! How are you?",
  sender: { id: "user123", username: "alice", avatar: "..." },
  context: {
    conversationId: "conv456",
    conversationTitle: "Alice & Bob",
    messageId: "msg789"
  },
  metadata: {
    attachments: { count: 1, firstType: "image", firstFilename: "photo.jpg" }
  }
}
```

### 2. `MESSAGE_REPLY` - "Réponse de XXXX"

Déclenché quand quelqu'un répond à votre message.

```typescript
{
  type: NotificationType.MESSAGE_REPLY,
  title: "Reply from Bob",
  content: "I agree with you!",
  context: {
    originalMessageId: "msg456",
    messageId: "msg789"
  }
}
```

### 3. `USER_MENTIONED` - "XXXX vous a cité"

Déclenché quand vous êtes mentionné avec @username.

```typescript
{
  type: NotificationType.USER_MENTIONED,
  title: "Alice mentioned you",
  content: "@bob can you check this?",
  metadata: {
    isMember: true,
    action: "view_message"
  }
}
```

### 4. `MESSAGE_REACTION` - "XXXX a réagi"

Déclenché quand quelqu'un réagit à votre message.

```typescript
{
  type: NotificationType.MESSAGE_REACTION,
  title: "Alice reacted to your message",
  content: "❤️ Great idea!",
  metadata: {
    reactionEmoji: "❤️",
    reactionId: "react123"
  }
}
```

### 5. `CONTACT_REQUEST` - "XXXX veut se connecter"

Déclenché quand vous recevez une demande de contact.

```typescript
{
  type: NotificationType.CONTACT_REQUEST,
  title: "Alice wants to connect",
  content: "Hi! I saw your profile...",
  priority: "high",
  context: {
    friendRequestId: "fr123"
  },
  metadata: {
    action: "accept_or_reject_contact"
  }
}
```

### 6. `CONTACT_ACCEPTED` - "XXXX accepte la connexion"

Déclenché quand votre demande de contact est acceptée.

```typescript
{
  type: NotificationType.CONTACT_ACCEPTED,
  title: "Alice accepted your invitation",
  content: "You can now chat together.",
  context: {
    conversationId: "conv_new_123"
  }
}
```

### 7. `NEW_CONVERSATION_DIRECT` - "Conversation avec XXXX"

Déclenché quand une conversation directe est créée.

```typescript
{
  type: NotificationType.NEW_CONVERSATION_DIRECT,
  title: "New conversation with Alice",
  content: "Alice started a conversation with you",
  context: {
    conversationId: "conv123",
    conversationType: "direct"
  }
}
```

### 8. `NEW_CONVERSATION_GROUP` - "Invitation de XXXX"

Déclenché quand vous êtes invité à rejoindre un groupe.

```typescript
{
  type: NotificationType.NEW_CONVERSATION_GROUP,
  title: "Invitation to \"Project Team\"",
  content: "Alice invited you to join \"Project Team\"",
  context: {
    conversationId: "group123",
    conversationTitle: "Project Team",
    conversationType: "group"
  }
}
```

### 9. `MEMBER_JOINED` - "XXXX a rejoint"

Déclenché quand un nouveau membre rejoint un groupe (admins seulement).

```typescript
{
  type: NotificationType.MEMBER_JOINED,
  title: "New member in \"Project Team\"",
  content: "Bob joined the group",
  priority: "low",
  metadata: {
    joinMethod: "via_link"
  }
}
```

### 10. `MISSED_CALL` - "Appel manqué"

Déclenché quand vous manquez un appel.

```typescript
{
  type: NotificationType.MISSED_CALL,
  title: "Missed video call",
  content: "Missed call from Alice",
  priority: "high",
  context: {
    callSessionId: "call123"
  },
  metadata: {
    action: "open_call"
  }
}
```

### 11. `SYSTEM` - "Notification système"

Notifications administratives, maintenance, sécurité.

```typescript
{
  type: NotificationType.SYSTEM,
  title: "System Maintenance",
  content: "Scheduled maintenance on January 15th",
  priority: "urgent",
  metadata: {
    systemType: "maintenance",
    action: "view_details"
  }
}
```

---

## Formatage et Utilitaires

### Formatage des Timestamps

```typescript
import { formatNotificationTimestamp } from '@/utils/notification-formatters';

const timestamp = formatNotificationTimestamp(notification.createdAt, 'en');
// < 10s: "just now"
// < 1min: "30 seconds ago"
// < 1h: "5 minutes ago"
// < 24h: "2 hours ago"
// < 7d: "3 days ago"
// >= 7d: "12 Jan 2024"
```

### Formatage des Messages

```typescript
import { formatMessagePreview } from '@/utils/notification-formatters';

const preview = formatMessagePreview(
  "This is a long message...",
  { count: 2, firstType: "image", firstFilename: "photo.jpg" },
  'en'
);
// Result: "This is a long... 📷 Photo"
```

### Icônes de Notifications

```typescript
import { getNotificationIcon } from '@/utils/notification-formatters';

const icon = getNotificationIcon(notification);
// Returns: { emoji: '💬', color: 'text-blue-600', bgColor: 'bg-blue-50' }
```

### Navigation Automatique

```typescript
import { getNotificationLink } from '@/utils/notification-formatters';

const link = getNotificationLink(notification);
// Returns: "/chat/conv123#msg-456" ou null
```

---

## Internationalisation (i18n)

### Utilisation avec next-i18next

```tsx
import { useTranslation } from 'next-i18next';

function NotificationTitle({ notification }: { notification: NotificationV2 }) {
  const { t } = useTranslation('notifications');

  return (
    <h4>{t(`titles.${notification.type}`, { sender: notification.sender?.username })}</h4>
  );
}
```

### Clés Disponibles

Toutes les clés sont disponibles dans les fichiers :
- `frontend/locales/en/notifications.json`
- `frontend/locales/fr/notifications.json`
- `frontend/locales/es/notifications.json`
- `frontend/locales/pt/notifications.json`

**Structure:**
```json
{
  "notifications": {
    "title": "Notifications",
    "tabs": { "all": "All", "unread": "Unread", "mentions": "Mentions" },
    "types": { "new_message": "New message", ... },
    "titles": { "newMessage": "New message from {sender}", ... },
    "timestamps": { "justNow": "just now", ... },
    "actions": { "accept": "Accept", "decline": "Decline", ... }
  }
}
```

---

## Performance et Optimisations

### 1. Optimistic Updates

Les actions (markAsRead, delete) sont exécutées localement immédiatement, puis synchronisées avec le backend :

```typescript
// Mise à jour locale immédiate
set(state => ({
  notifications: state.notifications.map(n =>
    n.id === id ? { ...n, isRead: true } : n
  )
}));

// Puis synchronisation backend
await notificationServiceV2.markAsRead(id);
```

### 2. LRU Eviction

Le store limite automatiquement le nombre de notifications en mémoire (max 500) :

```typescript
const STORE_CONFIG = {
  MAX_NOTIFICATIONS: 500,  // Limite maximale
};

// Éviction automatique des notifications lues les plus anciennes
if (notifications.length > MAX_NOTIFICATIONS) {
  // Supprime 20% des plus anciennes lues
}
```

### 3. Retry Logic

Le service API retry automatiquement avec backoff exponentiel :

```typescript
async function withRetry<T>(fn: () => Promise<T>, retries = 3) {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await delay(1000 * (4 - retries)); // Backoff: 1s, 2s, 3s
    return withRetry(fn, retries - 1);
  }
}
```

### 4. Polling Fallback

Si Socket.IO est déconnecté, le système bascule automatiquement sur le polling :

```typescript
// Détection de déconnexion Socket.IO
socket.on('disconnect', () => {
  console.warn('Socket disconnected, starting polling...');
  startPolling(); // Polling toutes les 30 secondes
});

// Reconnexion Socket.IO arrête le polling
socket.on('connect', () => {
  stopPolling();
});
```

### 5. Persistence localStorage

Les 50 premières notifications sont cachées dans localStorage pour un chargement instantané :

```typescript
persist(
  (set, get) => ({ /* store */ }),
  {
    name: 'meeshy-notifications-v2',
    partialize: (state) => ({
      notifications: state.notifications.slice(0, 50), // Cache partiel
      unreadCount: state.unreadCount,
      counts: state.counts
    })
  }
)
```

---

## Tests

### Tests Unitaires (à implémenter)

```typescript
// frontend/__tests__/stores/notification-store-v2.test.ts
import { renderHook, act } from '@testing-library/react';
import { useNotificationStoreV2 } from '@/stores/notification-store-v2';

describe('NotificationStoreV2', () => {
  it('should add notification', () => {
    const { result } = renderHook(() => useNotificationStoreV2());

    act(() => {
      result.current.addNotification(mockNotification);
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.unreadCount).toBe(1);
  });

  it('should mark as read optimistically', async () => {
    // Test optimistic update + rollback on error
  });
});
```

### Tests d'Intégration

```typescript
// frontend/__tests__/hooks/use-notifications-v2.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useNotificationsV2 } from '@/hooks/use-notifications-v2';

describe('useNotificationsV2', () => {
  it('should initialize Socket.IO connection', async () => {
    const { result } = renderHook(() => useNotificationsV2());

    await waitFor(() => {
      expect(result.current.isSocketConnected).toBe(true);
    });
  });

  it('should fallback to polling on disconnect', async () => {
    // Test polling fallback
  });
});
```

### Tests de Composants

```typescript
// frontend/__tests__/components/NotificationItem.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationItem } from '@/components/notifications-v2';

describe('NotificationItem', () => {
  it('should render notification correctly', () => {
    render(<NotificationItem notification={mockNotification} />);

    expect(screen.getByText('New message from Alice')).toBeInTheDocument();
    expect(screen.getByText('Hey! How are you?')).toBeInTheDocument();
  });

  it('should call onRead when mark as read is clicked', () => {
    const onRead = jest.fn();
    render(<NotificationItem notification={mockNotification} onRead={onRead} />);

    fireEvent.click(screen.getByTitle('Mark as read'));

    expect(onRead).toHaveBeenCalledWith(mockNotification.id);
  });
});
```

---

## Troubleshooting

### Problème: Socket.IO ne se connecte pas

**Solution:**
1. Vérifier que le backend Socket.IO est démarré
2. Vérifier l'URL dans `APP_CONFIG.getBackendUrl()`
3. Vérifier le token d'authentification : `authStore.authToken`
4. Regarder les logs de console : `[useNotificationsV2]`

### Problème: Notifications ne s'affichent pas

**Solution:**
1. Vérifier que le hook `useNotificationsV2()` est appelé dans le layout
2. Vérifier que l'utilisateur est authentifié : `isAuthenticated === true`
3. Vérifier les logs : `console.log(notifications, unreadCount)`
4. Vérifier localStorage : `meeshy-notifications-v2`

### Problème: Compteur de badge incorrect

**Solution:**
1. Forcer un refresh : `refresh()`
2. Vérifier la synchronisation avec le backend
3. Vérifier que les notifications sont correctement marquées comme lues

### Problème: Performance lente avec beaucoup de notifications

**Solution:**
1. Vérifier que LRU eviction est activé (max 500)
2. Activer le mode compact : `<NotificationItem compact={true} />`
3. Limiter le nombre de notifications affichées avec pagination

---

## Roadmap et Améliorations Futures

### Phase 1 (Actuel) ✅
- [x] Types TypeScript complets
- [x] Store Zustand avec Socket.IO
- [x] Service API avec retry logic
- [x] Hook custom avec polling fallback
- [x] Composants UI (Bell, List, Item)
- [x] Formatage contextuel des 11 types
- [x] i18n en 4 langues

### Phase 2 (À venir)
- [ ] Tests unitaires et d'intégration
- [ ] Storybook stories pour tous les composants
- [ ] Virtualisation avec react-window pour > 1000 notifications
- [ ] Service Worker pour push notifications natives
- [ ] Page NotificationCenter full-screen
- [ ] Filtres avancés (par date, par priorité, recherche)

### Phase 3 (Future)
- [ ] Grouping intelligent par conversation
- [ ] Actions groupées (tout marquer lu par type)
- [ ] Statistiques et insights
- [ ] Notifications persistantes avec IndexedDB
- [ ] Sync cross-device via WebSocket
- [ ] Notifications riches avec images et actions

---

## Support et Contribution

### Documentation Complémentaire

- [NOTIFICATION_SYSTEM_ARCHITECTURE.md](../NOTIFICATION_SYSTEM_ARCHITECTURE.md) - Architecture complète backend + frontend
- [NOTIFICATION_TYPES_REFERENCE.md](../NOTIFICATION_TYPES_REFERENCE.md) - Référence des 11 types
- [NOTIFICATION_MIGRATION_GUIDE.md](../NOTIFICATION_MIGRATION_GUIDE.md) - Guide de migration v1 → v2

### Contact

Pour toute question ou problème :
- Ouvrir une issue sur GitHub
- Contacter l'équipe technique : tech@meeshy.com

---

**Version**: 2.0.0
**Dernière mise à jour**: 2025-01-21
**Auteur**: Architecture Team - Meeshy
