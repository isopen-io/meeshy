# Guide de Migration - Système de Statut Utilisateur Temps Réel

## Résumé des Changements

Le système de statut utilisateur a été complètement refactorisé pour utiliser Socket.IO en temps réel au lieu du polling HTTP.

### Avant (Polling)
- Polling toutes les 3 minutes via `useParticipantsStatusPolling`
- Requêtes HTTP répétées inutiles
- Latence de 3 minutes maximum pour détecter les changements de statut
- Consommation de bande passante élevée

### Après (Temps Réel)
- Événements Socket.IO `USER_STATUS` en temps réel
- Mises à jour instantanées (< 1 seconde)
- Aucune requête HTTP de polling
- Store global centralisé (`useUserStore`)

---

## Fichiers Créés

### 1. `/frontend/stores/user-store.ts`
Store Zustand global pour gérer les statuts utilisateur.

**API:**
```typescript
interface UserStoreState {
  usersMap: Map<string, User>;
  participants: User[];
  setParticipants: (participants: User[]) => void;
  updateUserStatus: (userId: string, updates: UserStatusUpdate) => void;
  getUserById: (userId: string) => User | undefined;
  clearStore: () => void;
}
```

**Usage:**
```typescript
import { useUserStore } from '@/stores/user-store';

function MyComponent() {
  const participants = useUserStore(state => state.participants);
  const getUserById = useUserStore(state => state.getUserById);

  const user = getUserById('user-id-123');
  console.log(user?.isOnline); // true/false en temps réel
}
```

### 2. `/frontend/hooks/use-user-status-realtime.ts`
Hook pour activer les listeners Socket.IO USER_STATUS.

**Usage:**
```typescript
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';

function MyComponent() {
  // Active les listeners - le store se met à jour automatiquement
  useUserStatusRealtime();

  // Pas besoin d'autre code, le store est mis à jour en temps réel
}
```

### 3. `/frontend/hooks/use-manual-status-refresh.ts`
Hook de fallback pour rafraîchissement manuel (si WebSocket down).

**Usage:**
```typescript
import { useManualStatusRefresh } from '@/hooks/use-manual-status-refresh';

function MyComponent({ conversationId }: { conversationId: string }) {
  const { refresh, isRefreshing } = useManualStatusRefresh(conversationId);

  return (
    <button onClick={refresh} disabled={isRefreshing}>
      {isRefreshing ? 'Rafraîchissement...' : 'Rafraîchir'}
    </button>
  );
}
```

---

## Fichiers Supprimés

### `/frontend/hooks/use-participants-status-polling.ts` ❌
Ce hook est complètement supprimé. Remplacé par `use-user-status-realtime.ts`.

---

## Fichiers Modifiés

### `/frontend/components/conversations/conversation-participants-drawer.tsx`

**Avant:**
```typescript
// ❌ ANCIEN CODE (ne plus utiliser)
import { useParticipantsStatusPolling } from '@/hooks/use-participants-status-polling';

export function ConversationParticipantsDrawer({ participants, ... }) {
  useParticipantsStatusPolling({
    conversationId,
    enabled: true,
    intervalMs: 180000,
    onParticipantsUpdate: (newParticipants) => {
      // Mise à jour manuelle
    }
  });

  // Utiliser directement les participants des props
  const onlineParticipants = participants.filter(p => p.user.isOnline);
  // ...
}
```

**Après:**
```typescript
// ✅ NOUVEAU CODE (temps réel)
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';
import { useUserStore } from '@/stores/user-store';
import { useManualStatusRefresh } from '@/hooks/use-manual-status-refresh';

export function ConversationParticipantsDrawer({ participants, conversationId, ... }) {
  // Activer les listeners temps réel
  useUserStatusRealtime();

  // Fallback manuel
  const { refresh: manualRefresh, isRefreshing } = useManualStatusRefresh(conversationId);

  // Store global (mis à jour en temps réel)
  const storeParticipants = useUserStore(state => state.participants);
  const setStoreParticipants = useUserStore(state => state.setParticipants);

  // Initialiser le store au montage
  useEffect(() => {
    if (participants && participants.length > 0) {
      const users = participants.map(p => p.user);
      setStoreParticipants(users);
    }
  }, [participants, setStoreParticipants]);

  // Utiliser les participants du store (temps réel)
  const activeParticipants = storeParticipants.length > 0
    ? participants.map(p => ({
        ...p,
        user: storeParticipants.find(u => u.id === p.userId) || p.user
      }))
    : participants;

  // Filtrer avec activeParticipants
  const onlineParticipants = activeParticipants.filter(p => p.user.isOnline);
  // ...
}
```

---

## Comment Migrer Votre Code

### Étape 1: Remplacer le Hook de Polling

**Ancien:**
```typescript
import { useParticipantsStatusPolling } from '@/hooks/use-participants-status-polling';

useParticipantsStatusPolling({
  conversationId,
  enabled: true,
  onParticipantsUpdate: (participants) => {
    setLocalParticipants(participants);
  }
});
```

**Nouveau:**
```typescript
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';
import { useUserStore } from '@/stores/user-store';

useUserStatusRealtime(); // Active les listeners

const participants = useUserStore(state => state.participants);
// Les participants sont maintenant mis à jour en temps réel automatiquement
```

### Étape 2: Initialiser le Store

Au montage de votre composant, initialisez le store avec les participants:

```typescript
import { useEffect } from 'react';
import { useUserStore } from '@/stores/user-store';

useEffect(() => {
  if (participants && participants.length > 0) {
    const users = participants.map(p => p.user);
    setStoreParticipants(users);
  }
}, [participants]);
```

### Étape 3: Utiliser les Données du Store

```typescript
const storeParticipants = useUserStore(state => state.participants);

// Les statuts sont maintenant en temps réel
const onlineUsers = storeParticipants.filter(u => u.isOnline);
const offlineUsers = storeParticipants.filter(u => !u.isOnline);
```

### Étape 4: Ajouter un Fallback Manuel (Optionnel)

Si vous voulez permettre un rafraîchissement manuel (pull-to-refresh ou bouton):

```typescript
import { useManualStatusRefresh } from '@/hooks/use-manual-status-refresh';

const { refresh, isRefreshing } = useManualStatusRefresh(conversationId);

<button onClick={refresh} disabled={isRefreshing}>
  Rafraîchir
</button>
```

---

## Architecture du Système

```
┌──────────────────────────────────────────────────────────┐
│                    Backend (Gateway)                      │
│                                                           │
│  ┌─────────────────────────────────────────────┐        │
│  │  Socket.IO Server                            │        │
│  │  - Écoute connexions/déconnexions           │        │
│  │  - Broadcast USER_STATUS à tous les clients │        │
│  └─────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────┘
                          │
                          │ WebSocket
                          │
┌──────────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                      │
│                                                           │
│  ┌───────────────────────────────────────────┐          │
│  │  meeshy-socketio.service.ts               │          │
│  │  - Connexion Socket.IO                    │          │
│  │  - onUserStatus() listener                │          │
│  └───────────────────────────────────────────┘          │
│                       │                                   │
│                       │ Events                            │
│                       ▼                                   │
│  ┌───────────────────────────────────────────┐          │
│  │  use-user-status-realtime.ts              │          │
│  │  - Écoute USER_STATUS                     │          │
│  │  - Appelle updateUserStatus()             │          │
│  └───────────────────────────────────────────┘          │
│                       │                                   │
│                       │ Updates                           │
│                       ▼                                   │
│  ┌───────────────────────────────────────────┐          │
│  │  user-store.ts (Zustand)                  │          │
│  │  - usersMap: Map<userId, User>            │          │
│  │  - participants: User[]                   │          │
│  │  - updateUserStatus()                     │          │
│  └───────────────────────────────────────────┘          │
│                       │                                   │
│                       │ Read                              │
│                       ▼                                   │
│  ┌───────────────────────────────────────────┐          │
│  │  Components (ConversationParticipantsDrawer)│        │
│  │  - useUserStore(state => state.participants)│        │
│  │  - Affichage en temps réel                │          │
│  └───────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────┘
```

---

## Événement Socket.IO USER_STATUS

### Format de l'Événement

```typescript
interface UserStatusEvent {
  userId: string;
  username: string;
  isOnline: boolean;
  timestamp?: Date;
}
```

### Quand est-il émis ?

Le backend émet `USER_STATUS` dans ces cas:
1. **Connexion**: Quand un utilisateur se connecte (isOnline: true)
2. **Déconnexion**: Quand un utilisateur se déconnecte (isOnline: false)
3. **Heartbeat**: Quand un utilisateur est actif (isOnline: true)

### Comment l'écouter ?

Vous n'avez pas besoin de l'écouter manuellement - `useUserStatusRealtime()` le fait pour vous.

Si vous avez besoin d'écouter manuellement:
```typescript
import { getSocketIOService } from '@/services/meeshy-socketio.service';

const socketService = getSocketIOService();

const unsubscribe = socketService.onUserStatus((event) => {
  console.log('User status changed:', event);
});

// Cleanup
return () => unsubscribe();
```

---

## FAQ

### Q: Dois-je encore faire des requêtes API pour les participants ?
**R:** Oui, au montage initial pour charger les participants. Ensuite, le store est mis à jour en temps réel via Socket.IO.

### Q: Que se passe-t-il si Socket.IO est déconnecté ?
**R:** Le store garde les dernières valeurs connues. Vous pouvez utiliser `useManualStatusRefresh` pour forcer un rafraîchissement via API REST.

### Q: Puis-je utiliser le store dans plusieurs composants ?
**R:** Oui! Le store est global. Appelez `useUserStatusRealtime()` dans le composant racine, puis utilisez `useUserStore()` dans tous les enfants.

### Q: Comment savoir si un utilisateur est en ligne ?
**R:**
```typescript
const user = useUserStore(state => state.getUserById('user-id'));
const isOnline = user?.isOnline ?? false;
```

### Q: Le polling est-il complètement supprimé ?
**R:** Oui. `useParticipantsStatusPolling` est supprimé. Aucun polling automatique. Uniquement Socket.IO temps réel + rafraîchissement manuel optionnel.

---

## Checklist de Migration

- [ ] Supprimer les imports de `useParticipantsStatusPolling`
- [ ] Ajouter `useUserStatusRealtime()` dans le composant racine
- [ ] Initialiser le store avec `setStoreParticipants(participants)`
- [ ] Remplacer les références aux participants par `useUserStore(state => state.participants)`
- [ ] (Optionnel) Ajouter `useManualStatusRefresh` pour le fallback
- [ ] Tester les connexions/déconnexions utilisateur
- [ ] Vérifier que les statuts s'actualisent en temps réel

---

## Dépannage

### Les statuts ne s'actualisent pas

1. Vérifier que Socket.IO est connecté:
```typescript
import { getSocketIOService } from '@/services/meeshy-socketio.service';

const socketService = getSocketIOService();
const status = socketService.getConnectionStatus();
console.log('Socket.IO status:', status);
```

2. Vérifier que le hook est actif:
```typescript
useUserStatusRealtime(); // Doit être appelé dans le composant
```

3. Vérifier les logs console:
```
[useUserStatusRealtime] Setting up USER_STATUS listener
[useUserStatusRealtime] USER_STATUS received: { userId: '...', isOnline: true }
[UserStore] User status updated: { userId: '...', isOnline: true }
```

### Le store est vide

1. Vérifier l'initialisation:
```typescript
useEffect(() => {
  if (participants && participants.length > 0) {
    const users = participants.map(p => p.user);
    setStoreParticipants(users);
  }
}, [participants, setStoreParticipants]);
```

2. Vérifier que les participants sont chargés:
```typescript
console.log('Participants from props:', participants);
console.log('Store participants:', useUserStore.getState().participants);
```

---

## Contact

Pour toute question ou problème, contactez l'équipe de développement ou créez une issue sur le repository.
