# Quick Reference - Système de Statut en Temps Réel

## Version 1.0 | Date: 2025-11-03

Guide de référence rapide pour implémenter et débugger le système de statut utilisateur.

---

## Vue d'Ensemble en 30 Secondes

```
🚀 PRINCIPE: Push-only, pas de polling
📡 ÉVÉNEMENT: SERVER_EVENTS.USER_STATUS (broadcast Socket.IO)
🔄 MISE À JOUR: lastActiveAt (throttled 1x/min) + isOnline (WebSocket)
🎨 CALCUL: Frontend détermine statut basé sur lastActiveAt
⏱️ GARANTIE: Temps réel (<100ms) + Fallback zombie cleanup (60s)
```

---

## Champs Base de Données

### User / AnonymousParticipant

```prisma
isOnline: Boolean      // Flag WebSocket (true = socket connectée)
lastSeen: DateTime     // Horodatage dernière DÉCONNEXION
lastActiveAt: DateTime // Horodatage dernière ACTIVITÉ (REST ou WS)
```

### Sémantique

| Champ | Quand Mis à Jour | Par Qui |
|-------|------------------|---------|
| `isOnline` | Connect/Disconnect WebSocket | MaintenanceService + Job |
| `lastSeen` | Disconnect WebSocket | MaintenanceService |
| `lastActiveAt` | Connect WebSocket + REST API | Auth Middleware (throttled) |

---

## Événements Socket.IO

### SERVER_EVENTS.USER_STATUS (Server → Client)

**Payload**:
```typescript
{
  userId: string;      // ID MongoDB utilisateur
  username: string;    // Nom utilisateur
  isOnline: boolean;   // true = connexion, false = déconnexion
}
```

**Émis quand**:
- Connexion WebSocket
- Déconnexion WebSocket
- Job maintenance nettoie zombie

**Routing**: Broadcast ciblé (seulement conversations de l'utilisateur)

**Fréquence**: ~10-50 events/s (dépend du trafic)

---

## APIs Clés

### Backend (Gateway)

#### MaintenanceService

```typescript
// Mettre à jour statut utilisateur
await maintenanceService.updateUserOnlineStatus(
  userId: string,
  isOnline: boolean,
  broadcast: boolean = false
);

// Mettre à jour statut anonyme
await maintenanceService.updateAnonymousOnlineStatus(
  participantId: string,
  isOnline: boolean,
  broadcast: boolean = false
);
```

#### MeeshySocketIOManager

```typescript
// Broadcaster changement de statut
private async _broadcastUserStatus(
  userId: string,
  isOnline: boolean,
  isAnonymous: boolean
);

// Configuration callback
maintenanceService.setStatusBroadcastCallback(
  (userId, isOnline, isAnonymous) => {
    this._broadcastUserStatus(userId, isOnline, isAnonymous);
  }
);
```

### Frontend (Zustand Store)

#### usersService

```typescript
// Mettre à jour statut local
updateUserStatus(userId: string, data: Partial<User>);

// Calculer statut utilisateur
getUserStatus(user: User): { status: 'online' | 'away' | 'offline', color, label }

// Vérifier si en ligne
isUserOnline(user: User): boolean

// Obtenir texte "dernière activité"
getLastSeenText(user: User): string
```

#### Setup Listeners

```typescript
// Dans useEffect
socket.on(SERVER_EVENTS.USER_STATUS, (data: UserStatusEvent) => {
  usersService.updateUserStatus(data.userId, {
    isOnline: data.isOnline,
    lastActiveAt: new Date()
  });
});
```

---

## Configuration Critique

### Socket.IO (Backend)

```typescript
// gateway/src/socketio/MeeshySocketIOManager.ts

const io = new SocketIOServer(httpServer, {
  pingTimeout: 10000,    // 10s - Détection déconnexion brutale
  pingInterval: 25000,   // 25s - Heartbeat interval
  connectTimeout: 45000  // 45s - Timeout connexion initiale
});
```

### Job Maintenance

```typescript
// gateway/src/services/maintenance.service.ts

private readonly OFFLINE_THRESHOLD_MINUTES = 5; // Seuil zombie

// Job toutes les 60s
setInterval(async () => {
  await this.updateOfflineUsers();
}, 60000);
```

### Throttling Auth Middleware

```typescript
// gateway/src/middleware/auth.ts

const THROTTLE_INTERVAL = 60000; // 1 minute
const throttleCache = new Map<string, number>(); // userId → lastUpdateTimestamp

// Dans middleware
if (now - lastUpdate >= THROTTLE_INTERVAL) {
  await prisma.user.update({
    where: { id: userId },
    data: { lastActiveAt: new Date() }
  });
  throttleCache.set(userId, now);
}
```

---

## Logique de Calcul Statut (Frontend)

```typescript
getUserStatus(user: User): UserStatus {
  const now = Date.now();
  const lastActive = new Date(user.lastActiveAt).getTime();
  const diffMinutes = (now - lastActive) / 60000;

  if (diffMinutes < 5) {
    return { status: 'online', color: '#10b981', label: 'En ligne' };
  }
  if (diffMinutes < 30) {
    return { status: 'away', color: '#f59e0b', label: 'Absent' };
  }
  return { status: 'offline', color: '#6b7280', label: 'Hors ligne' };
}
```

### Seuils

| Statut | Condition | Couleur | Icône |
|--------|-----------|---------|-------|
| Online | `lastActiveAt < 5 min` | Vert (#10b981) | 🟢 |
| Away | `5 min ≤ lastActiveAt < 30 min` | Orange (#f59e0b) | 🟠 |
| Offline | `lastActiveAt ≥ 30 min` | Gris (#6b7280) | ⚪ |

---

## Flux Principaux

### 1. Connexion Utilisateur

```
Browser → Socket.IO connect + JWT
  ↓
Backend: _handleTokenAuthentication()
  ↓
JWT verify → Get User from DB
  ↓
MaintenanceService.updateUserOnlineStatus(userId, true, broadcast=true)
  ↓
UPDATE User SET isOnline=true, lastActiveAt=NOW()
  ↓
Broadcast USER_STATUS (isOnline: true) à conversations
  ↓
Frontend: Reçoit event → updateUserStatus()
  ↓
UI: OnlineIndicator 🟢
```

**Durée**: ~50-100ms

### 2. Déconnexion Utilisateur

```
Browser closes tab
  ↓
Socket.IO disconnect event
  ↓
Backend: socket.on('disconnect')
  ↓
MaintenanceService.updateUserOnlineStatus(userId, false, broadcast=true)
  ↓
UPDATE User SET isOnline=false, lastSeen=NOW()
  ↓
Broadcast USER_STATUS (isOnline: false)
  ↓
Frontend: updateUserStatus() → UI: 🟠 ou ⚪
```

**Durée**: ~50-150ms

### 3. Activité REST API

```
Browser → POST /api/messages (Authorization: Bearer xyz)
  ↓
Auth Middleware: Throttle check
  ├─ Si last update < 60s → SKIP
  └─ Sinon → UPDATE User SET lastActiveAt=NOW()
  ↓
Route handler exécute
  ↓
Frontend: Recalcule statut localement (getUserStatus)
```

**Fréquence**: Max 1 update/min/user

### 4. Nettoyage Zombies

```
Job Maintenance (toutes les 60s)
  ↓
SELECT * FROM User WHERE isOnline=true AND lastActiveAt < (NOW() - 5min)
  ↓
Si zombies trouvés:
  ├─ UPDATE User SET isOnline=false, lastSeen=NOW()
  └─ Broadcast USER_STATUS (isOnline: false) pour chaque zombie
  ↓
Frontend: Reçoit events → UI mis à jour
```

**Fréquence**: 60s
**Seuil**: 5 minutes d'inactivité

---

## Debug Checklist

### Problème: Statut pas mis à jour en temps réel

**Vérifications**:

1. **Frontend - Socket connecté?**
   ```javascript
   console.log('Connected:', socket.connected); // true?
   console.log('Socket ID:', socket.id); // Doit avoir valeur
   ```

2. **Frontend - Listener installé?**
   ```javascript
   console.log('Listeners:', socket.eventNames()); // Contient "user:status"?
   ```

3. **Backend - Broadcast fonctionne?**
   ```bash
   grep "Broadcast USER_STATUS" gateway.log | tail
   ```

4. **Backend - Job maintenance tourne?**
   ```bash
   curl http://localhost:8000/api/admin/maintenance/stats
   # Vérifier maintenanceActive: true
   ```

5. **Base de données - lastActiveAt récent?**
   ```javascript
   db.User.findOne({ id: "userId" }).then(u => console.log(u.lastActiveAt));
   // Doit être < 5 min pour "online"
   ```

### Problème: Utilisateur reste "zombie" trop longtemps

**Diagnostic**:

```bash
# 1. Vérifier Socket.IO timeout
grep "ping timeout" gateway.log | tail

# 2. Vérifier job maintenance logs
grep "\[CLEANUP\]" gateway.log | tail -n 20

# 3. Forcer cleanup manuel
curl -X POST http://localhost:8000/api/admin/maintenance/cleanup-zombies
```

**Solutions**:
- Réduire `pingTimeout` (actuellement 10s)
- Augmenter fréquence job (actuellement 60s)
- Vérifier index MongoDB sur `lastActiveAt`

### Problème: Trop de broadcasts (performance)

**Métriques**:

```promql
# Broadcasts/seconde
rate(meeshy_user_status_broadcasts_total[1s])

# Si > 100/s → Problème
```

**Solutions**:
1. Implémenter debouncing (attendre 5s avant broadcast disconnect)
2. Augmenter seuil zombie (5min → 10min)
3. Limiter broadcasts aux conversations actives uniquement

---

## Commandes Utiles

### Monitoring

```bash
# Stats en temps réel
curl http://localhost:8000/api/admin/maintenance/stats

# Logs live
tail -f gateway.log | grep -E "(USER_STATUS|CLEANUP|Broadcast)"

# Utilisateurs en ligne
mongo meeshy --eval "db.User.count({ isOnline: true })"

# Zombies potentiels
mongo meeshy --eval "
  db.User.find({
    isOnline: true,
    lastActiveAt: { \$lt: new Date(Date.now() - 5*60*1000) }
  }).count()
"
```

### Forcer Actions

```bash
# Forcer cleanup zombies
curl -X POST http://localhost:8000/api/admin/maintenance/cleanup-zombies

# Forcer disconnect utilisateur
curl -X POST http://localhost:8000/api/admin/users/{userId}/disconnect

# Refresh statut manuel (frontend)
fetch('/api/users/me').then(r => r.json()).then(console.log);
```

---

## Métriques de Performance Attendues

| Métrique | Valeur Attendue | Alerte Si |
|----------|-----------------|-----------|
| Latence broadcast | < 100ms (p95) | > 500ms |
| Détection zombie | < 70s | > 120s |
| Zombies/min | 0-5 | > 20 |
| Broadcasts/s | 10-50 | > 100 |
| Throttled requests | 80-90% | < 50% |
| DB updates/min | ~N users actifs | > 10× users actifs |

---

## Snippets Code

### Backend: Initialiser Système

```typescript
// gateway/src/index.ts

import { MeeshySocketIOManager } from './socketio/MeeshySocketIOManager';

const socketManager = new MeeshySocketIOManager(httpServer, prisma);
await socketManager.initialize(); // Démarre job maintenance automatiquement
```

### Frontend: Composant OnlineIndicator

```tsx
// components/users/OnlineIndicator.tsx

import { useUsersService } from '@/services/usersService';

export const OnlineIndicator = ({ user }) => {
  const usersService = useUsersService();
  const status = usersService.getUserStatus(user);

  return (
    <div className="flex items-center gap-2">
      <div
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: status.color }}
      />
      <span className="text-sm">{status.label}</span>
    </div>
  );
};
```

### Frontend: Setup Socket Listener

```typescript
// hooks/useRealtimeStatus.ts

import { useEffect } from 'react';
import { useSocketIO } from '@/services/socketService';
import { useUsersService } from '@/services/usersService';
import { SERVER_EVENTS } from '@shared/types/socketio-events';

export const useRealtimeStatus = () => {
  const { socket } = useSocketIO();
  const usersService = useUsersService();

  useEffect(() => {
    if (!socket) return;

    socket.on(SERVER_EVENTS.USER_STATUS, (data) => {
      usersService.updateUserStatus(data.userId, {
        isOnline: data.isOnline,
        lastActiveAt: new Date()
      });
    });

    return () => {
      socket.off(SERVER_EVENTS.USER_STATUS);
    };
  }, [socket]);
};
```

---

## Checklist Pré-Déploiement

- [ ] Job maintenance démarre automatiquement
- [ ] Socket.IO timeouts configurés (pingTimeout: 10s)
- [ ] Auth middleware throttling activé (1x/min)
- [ ] Index MongoDB créés (`isOnline`, `lastActiveAt`)
- [ ] Broadcast callback configuré (MaintenanceService → SocketIOManager)
- [ ] Frontend listeners installés (USER_STATUS)
- [ ] Tests de charge réussis (1000+ utilisateurs)
- [ ] Monitoring alertes configurées
- [ ] Logs de debug réduits (production level: info)
- [ ] CORS Socket.IO restreint (production domains seulement)

---

## Liens Utiles

- **Architecture Complète**: `ARCHITECTURE_REALTIME_STATUS.md`
- **Diagrammes Détaillés**: `ARCHITECTURE_REALTIME_STATUS_DIAGRAMS.md`
- **Shared Types**: `/shared/types/socketio-events.ts`
- **MaintenanceService**: `/gateway/src/services/maintenance.service.ts`
- **MeeshySocketIOManager**: `/gateway/src/socketio/MeeshySocketIOManager.ts`
- **Auth Middleware**: `/gateway/src/middleware/auth.ts`

---

## FAQ

**Q: Pourquoi throttling 1x/min et non temps réel?**
A: Trade-off performance/précision. Seuil statut = 5min, donc précision ±60s acceptable. Économise 10-100× updates DB.

**Q: Pourquoi pas de polling frontend?**
A: Architecture push-only plus scalable. Polling = N users × polling rate requêtes/s. Push = 1 event quand changement réel.

**Q: Que se passe-t-il si MongoDB est lent?**
A: Throttling protège DB (max 1 update/min). Updates async (fire-and-forget). Calcul statut local ne dépend pas de DB.

**Q: Comment gérer multi-onglets?**
A: Actuellement: 1 socket/user max, ancienne socket déconnectée. Alternative: Permettre multi-sockets (plus complexe).

**Q: Quelle précision pour le statut?**
A: ±60s sur `lastActiveAt` (throttling). Suffisant car seuil statut = 5min (60s << 5min).

---

**Document Rédigé Par**: Claude (Anthropic)
**Date**: 2025-11-03
**Version**: 1.0
**Type**: Quick Reference
