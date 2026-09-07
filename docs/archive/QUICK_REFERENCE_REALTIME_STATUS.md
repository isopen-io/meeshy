# Référence Rapide - Statuts Utilisateur Temps Réel

## Installation en 3 Étapes

### 1. Activer les Listeners
```typescript
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';

// Dans votre composant
useUserStatusRealtime();
```

### 2. Initialiser le Store
```typescript
import { useUserStore } from '@/stores/user-store';
import { useEffect } from 'react';

const setStoreParticipants = useUserStore(state => state.setParticipants);

useEffect(() => {
  if (participants && participants.length > 0) {
    setStoreParticipants(participants);
  }
}, [participants, setStoreParticipants]);
```

### 3. Lire les Statuts
```typescript
const storeParticipants = useUserStore(state => state.participants);

// Les statuts sont maintenant en temps réel
const online = storeParticipants.filter(u => u.isOnline);
const offline = storeParticipants.filter(u => !u.isOnline);
```

---

## API Complète

### `useUserStatusRealtime()`
Active les listeners Socket.IO USER_STATUS.

**Params:** Aucun
**Returns:** `void`

### `useUserStore`
Store Zustand global pour les statuts utilisateur.

**Selectors:**
- `state.participants: User[]` - Liste des participants
- `state.setParticipants(participants)` - Initialiser le store
- `state.updateUserStatus(userId, updates)` - Mettre à jour un statut
- `state.getUserById(userId)` - Récupérer un utilisateur
- `state.clearStore()` - Nettoyer le store

### `useManualStatusRefresh(conversationId)`
Rafraîchissement manuel (fallback).

**Params:** `conversationId: string | null`
**Returns:** `{ refresh: () => Promise<void>, isRefreshing: boolean }`

---

## Exemples

### Composant Simple
```typescript
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';
import { useUserStore } from '@/stores/user-store';

export function UserList({ participants }) {
  useUserStatusRealtime();

  const storeParticipants = useUserStore(state => state.participants);

  useEffect(() => {
    useUserStore.getState().setParticipants(participants);
  }, [participants]);

  return (
    <div>
      {storeParticipants.map(user => (
        <div key={user.id}>
          {user.username} - {user.isOnline ? 'En ligne' : 'Hors ligne'}
        </div>
      ))}
    </div>
  );
}
```

### Avec Statistiques
```typescript
const participants = useUserStore(state => state.participants);
const onlineCount = participants.filter(u => u.isOnline).length;
const offlineCount = participants.length - onlineCount;

return (
  <div>
    <span>{onlineCount} en ligne</span>
    <span>{offlineCount} hors ligne</span>
  </div>
);
```

### Avec Rafraîchissement Manuel
```typescript
import { useManualStatusRefresh } from '@/hooks/use-manual-status-refresh';

const { refresh, isRefreshing } = useManualStatusRefresh(conversationId);

return (
  <button onClick={refresh} disabled={isRefreshing}>
    {isRefreshing ? 'Rafraîchissement...' : 'Rafraîchir'}
  </button>
);
```

---

## Dépannage Rapide

### Problème: Les statuts ne s'actualisent pas
**Solution:** Vérifier que `useUserStatusRealtime()` est appelé

### Problème: Le store est vide
**Solution:** Vérifier que `setStoreParticipants(participants)` est appelé

### Problème: Socket.IO déconnecté
**Solution:**
```typescript
import { getSocketIOService } from '@/services/meeshy-socketio.service';
const status = getSocketIOService().getConnectionStatus();
console.log(status);
```

---

## Checklist

- [ ] Importer `useUserStatusRealtime`
- [ ] Appeler `useUserStatusRealtime()` dans le composant
- [ ] Importer `useUserStore`
- [ ] Initialiser le store avec `setStoreParticipants()`
- [ ] Utiliser `state.participants` au lieu des props
- [ ] Tester les connexions/déconnexions

---

## Documentation Complète

- [Guide de Migration](/MIGRATION_USER_STATUS_REALTIME.md)
- [Exemple Contacts Page](/EXAMPLE_CONTACTS_PAGE_REALTIME.md)
- [Résumé Technique](/REALTIME_STATUS_SUMMARY.md)
- [Résumé des Changements](/CHANGES_SUMMARY.md)
