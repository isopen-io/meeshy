## 2025-01: WebSocket - Socket.IO 4.8 avec multi-device
**Statut**: Accept
**Contexte**: Messagerie temps rel bidirectionnelle avec reconnexion et fallback
**Decision**: Socket.IO 4.8, rooms normalises (`conversation:{id}`), maps multi-device (`userSockets: Map<userId, Set<socketId>>`)
**Alternatives rejet**: WebSocket natif (pas de reconnexion/rooms), Firebase RTDB (vendor lock-in)
**Cons**: Convention `entity:action-word` doit tre enforce (hyphens PAS underscores), `emit()` n'attend pas les Promises
