## 2025-01: Socket.IO Events - `entity:action-word` avec hyphens
**Statut**: Accept
**Contexte**: Convention de nommage unique pour tous les vnements temps rel
**Decision**: Format `entity:action-word` (colons + hyphens, JAMAIS underscores). Constants spars `SERVER_EVENTS` et `CLIENT_EVENTS` avec `as const`
**Alternatives rejet**: Underscores (`message_send`) (moins lisible), camelCase (`messageSend`) (pas convention WS), namespace plat (collisions)
**Cons**: Convention doit tre enforce manuellement
