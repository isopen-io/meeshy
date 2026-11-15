## 2025-01: Messages - GatewayMessage vs UIMessage
**Statut**: Accept
**Contexte**: Backend et frontend ont des besoins diffrents pour les messages
**Decision**: `GatewayMessage` (align Prisma, backend), `UIMessage` (tats visuels, frontend). Conversion via `gatewayToUIMessage()`, affichage via `getDisplayContent(msg, lang)`
**Alternatives rejet**: Type unique (mlange concerns API et UI), types multiples par contexte (maintenance impossible)
**Cons**: Logique de conversion  maintenir, deux types  comprendre
