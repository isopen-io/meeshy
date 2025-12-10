# Système de Statut Utilisateur En Ligne/Hors Ligne - Documentation Complète

## Vue d'ensemble

Ce document décrit l'implémentation complète du système de statut utilisateur en ligne/hors ligne pour la plateforme Meeshy. Le système utilise une architecture optimisée avec throttling pour réduire la charge sur la base de données tout en maintenant une précision élevée des statuts.

## Architecture

### Composants Principaux

1. **StatusService** (`gateway/src/services/status.service.ts`)
   - Service central de gestion des statuts
   - Throttling intelligent (1 update max par minute par utilisateur)
   - Cache en mémoire avec nettoyage automatique
   - Métriques de performance en temps réel

2. **AuthMiddleware** (`gateway/src/middleware/auth.ts`)
   - Middleware unifié pour JWT et Session Token
   - Mise à jour automatique de `lastActiveAt` sur chaque requête REST
   - Intégration transparente avec StatusService

3. **MaintenanceService** (`gateway/src/services/maintenance.service.ts`)
   - Job de maintenance optimisé (15 secondes au lieu de 60)
   - Détection automatique des utilisateurs inactifs (seuil: 5 minutes)
   - Broadcast des changements de statut via Socket.IO

4. **Socket.IO Manager** (`gateway/src/socketio/MeeshySocketIOManager.ts`)
   - Gestion des connexions/déconnexions WebSocket
   - Broadcast en temps réel des changements de statut
   - Support utilisateurs enregistrés et anonymes

## Flux de Données

### 1. Requête REST (Utilisateur Enregistré)

```
Client → [REST API] → AuthMiddleware
                           ↓
                   StatusService.updateUserLastActive(userId)
                           ↓
                   [Throttling Check]
                           ↓
                   Si > 60s depuis dernière update:
                           ↓
                   Prisma.user.update({ lastActiveAt: new Date() })
```

### 2. Requête REST (Utilisateur Anonyme)

```
Client → [REST API] → AuthMiddleware
                           ↓
                   StatusService.updateAnonymousLastActive(participantId)
                           ↓
                   [Throttling Check]
                           ↓
                   Si > 60s depuis dernière update:
                           ↓
                   Prisma.anonymousParticipant.update({ lastActiveAt: new Date() })
```

### 3. Connexion Socket.IO

```
Client → [Socket.IO] → authenticate event
                           ↓
                   MaintenanceService.updateUserOnlineStatus(userId, true, broadcast=true)
                           ↓
                   Prisma.user.update({ isOnline: true, lastActiveAt: new Date() })
                           ↓
                   MeeshySocketIOManager._broadcastUserStatus(userId, true)
                           ↓
                   io.to(conversations).emit('user:status', { userId, isOnline: true })
```

### 4. Job de Maintenance (toutes les 15 secondes)

```
MaintenanceService (interval: 15s)
         ↓
   updateOfflineUsers()
         ↓
   Trouver users avec:
   - isOnline = true
   - lastActiveAt < maintenant - 5 minutes
         ↓
   Prisma.user.updateMany({ isOnline: false, lastSeen: new Date() })
         ↓
   Broadcast changements de statut via Socket.IO
```

## Caractéristiques Techniques

### Throttling

- **Intervalle**: 1 minute (60 000 ms)
- **Mécanisme**: Cache en mémoire (Map<userId, timestamp>)
- **Nettoyage**: Automatique toutes les 5 minutes
- **Économie DB**: ~95% de réduction des writes pour utilisateurs actifs

### Performance

| Métrique | Valeur |
|----------|--------|
| Throttle Interval | 60 secondes |
| Maintenance Job | 15 secondes |
| Offline Threshold | 5 minutes |
| Cache Cleanup | 5 minutes |
| Cache Max Age | 10 minutes |

### Métriques Disponibles

```typescript
interface StatusUpdateMetrics {
  totalRequests: number;        // Total de requêtes reçues
  throttledRequests: number;    // Requêtes throttled (économie DB)
  successfulUpdates: number;    // Updates DB réussies
  failedUpdates: number;        // Updates DB échouées
  cacheSize: number;            // Taille actuelle du cache
}
```

## Endpoints API

### 1. Statistiques de Maintenance

**GET** `/maintenance/stats`

```json
{
  "success": true,
  "data": {
    "onlineUsers": 42,
    "totalUsers": 1250,
    "anonymousSessions": 8,
    "onlineAnonymous": 3,
    "offlineThresholdMinutes": 5,
    "maintenanceActive": true
  }
}
```

### 2. Métriques StatusService

**GET** `/maintenance/status-metrics`

```json
{
  "success": true,
  "data": {
    "totalRequests": 10000,
    "throttledRequests": 9500,
    "successfulUpdates": 495,
    "failedUpdates": 5,
    "cacheSize": 120,
    "throttleRate": 95.00
  }
}
```

### 3. Réinitialiser Métriques

**POST** `/maintenance/status-metrics/reset`

```json
{
  "success": true,
  "message": "Métriques de statut réinitialisées avec succès"
}
```

### 4. Update Manuel de Statut

**POST** `/maintenance/user-status`

```json
{
  "userId": "user123",
  "isOnline": true
}
```

## Guide de Test

### Test 1: Vérifier Throttling REST

```bash
# Terminal 1: Obtenir un JWT token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}' \
  | jq -r '.token' > token.txt

TOKEN=$(cat token.txt)

# Terminal 2: Faire 10 requêtes rapidement
for i in {1..10}; do
  echo "Request $i"
  curl -X GET http://localhost:3000/api/conversations \
    -H "Authorization: Bearer $TOKEN"
  sleep 1
done

# Terminal 3: Vérifier les métriques
curl http://localhost:3000/maintenance/status-metrics | jq
```

**Résultat attendu**:
- `totalRequests`: 10
- `throttledRequests`: 9 (seule la 1ère requête passe)
- `successfulUpdates`: 1
- `throttleRate`: 90.00%

### Test 2: Vérifier Job Maintenance

```bash
# Terminal 1: Observer les logs du gateway
docker compose logs -f gateway | grep "CLEANUP"

# Terminal 2: Connecter un utilisateur via Socket.IO
node test-socket-connection.js

# Attendre 6 minutes (seuil de 5 min + intervalle de 15s)

# Observer dans Terminal 1:
# "🔄 [CLEANUP] 1 utilisateurs marqués comme hors ligne (inactifs depuis >5min)"
```

### Test 3: Vérifier Broadcast Socket.IO

```javascript
// test-socket-broadcast.js
const io = require('socket.io-client');

const socket1 = io('http://localhost:3000', {
  auth: { token: 'JWT_TOKEN_USER1' }
});

const socket2 = io('http://localhost:3000', {
  auth: { token: 'JWT_TOKEN_USER2' }
});

// Socket 2 écoute les changements de statut
socket2.on('user:status', (data) => {
  console.log('Status changed:', data);
  // Devrait afficher: { userId: 'user1_id', username: 'User1', isOnline: false }
});

// Socket 1 se connecte puis se déconnecte
socket1.on('authenticated', () => {
  console.log('Socket 1 connected');
  setTimeout(() => {
    console.log('Socket 1 disconnecting...');
    socket1.disconnect();
  }, 2000);
});
```

### Test 4: Test de Charge

```bash
# Utiliser Apache Bench pour simuler charge
ab -n 1000 -c 50 -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/conversations

# Vérifier l'impact sur les métriques
curl http://localhost:3000/maintenance/status-metrics | jq

# Vérifier que throttleRate est proche de 95%+
```

### Test 5: Vérifier Cache Cleanup

```bash
# Terminal 1: Observer le cache
watch -n 1 'curl -s http://localhost:3000/maintenance/status-metrics | jq .data.cacheSize'

# Terminal 2: Générer activité puis arrêter
# Attendre 10 minutes

# Observer dans Terminal 1:
# cacheSize devrait diminuer progressivement
```

## Métriques de Performance Attendues

### Scénario: 1000 Utilisateurs Actifs

| Sans Throttling | Avec Throttling |
|-----------------|-----------------|
| 1000 writes/min | 50 writes/min |
| ~60K writes/h | ~3K writes/h |
| Charge DB élevée | Charge DB minimale |

### Économie Calculée

```
Réduction de charge DB = (1 - (1/60)) × 100 = 98.33%
```

Pour un utilisateur faisant 1 requête par seconde:
- Sans throttling: 60 writes/min
- Avec throttling: 1 write/min
- Économie: 59 writes/min (98.33%)

## Troubleshooting

### Problème: lastActiveAt ne se met pas à jour

**Diagnostic**:
```bash
# Vérifier que StatusService est bien initialisé
curl http://localhost:3000/maintenance/status-metrics

# Si cacheSize = 0 et totalRequests = 0:
# → StatusService n'est pas utilisé par AuthMiddleware
```

**Solution**:
```bash
# Vérifier que server.ts injecte bien statusService
grep -n "statusService" gateway/src/server.ts

# Vérifier que auth.ts utilise statusService
grep -n "this.statusService" gateway/src/middleware/auth.ts
```

### Problème: Utilisateurs restent en ligne trop longtemps

**Diagnostic**:
```bash
# Vérifier l'intervalle du job maintenance
curl http://localhost:3000/maintenance/stats | jq

# Vérifier les logs
docker compose logs gateway | grep "CLEANUP"
```

**Solution**:
- Vérifier que `maintenanceInterval` est bien à 15000ms
- Vérifier que `OFFLINE_THRESHOLD_MINUTES` est à 5

### Problème: Broadcasts Socket.IO ne fonctionnent pas

**Diagnostic**:
```javascript
// Test simple de broadcast
const socket = io('http://localhost:3000');
socket.on('user:status', (data) => {
  console.log('Received:', data);
});
```

**Solution**:
- Vérifier que `_broadcastUserStatus` est bien appelée
- Vérifier les logs: "📡 [STATUS] Statut utilisateur ... broadcasté"
- Vérifier que les rooms Socket.IO sont bien configurées

## Monitoring en Production

### Dashboard Recommandé

```typescript
// Métriques à monitorer
const metrics = {
  // StatusService
  statusThrottleRate: 'Devrait être > 90%',
  statusCacheSize: 'Devrait être < 1000',
  statusFailedUpdates: 'Devrait être 0',

  // Maintenance
  onlineUsers: 'Nombre d\'utilisateurs en ligne',
  maintenanceActive: 'Devrait être true',

  // Socket.IO
  activeConnections: 'Nombre de connexions WebSocket'
};
```

### Alertes Recommandées

1. **Alerte Critique**: `statusFailedUpdates > 10 sur 5 minutes`
2. **Alerte Warning**: `statusThrottleRate < 80%`
3. **Alerte Info**: `onlineUsers > 1000`

## Prochaines Améliorations

1. **Redis Cache**: Remplacer Map en mémoire par Redis pour scaling horizontal
2. **Métriques Prometheus**: Exposer métriques au format Prometheus
3. **WebSocket Heartbeat**: Ping/pong pour détecter déconnexions plus rapidement
4. **Presence Channels**: Support de présence par conversation
5. **Last Seen Accuracy**: Précision à la seconde au lieu de la minute

## Références

- Prisma Schema: `/shared/schema.prisma`
- Socket.IO Events: `/gateway/src/socketio/events.ts`
- Auth Middleware: `/gateway/src/middleware/auth.ts`
- Status Service: `/gateway/src/services/status.service.ts`
- Maintenance Service: `/gateway/src/services/maintenance.service.ts`

## Auteur

Implémentation réalisée le 2025-11-03 dans le cadre de l'amélioration du système de présence utilisateur.

## License

Propriété de Meeshy - Tous droits réservés
