## 2025-01: API Response - Format unifi ApiResponse<T>
**Statut**: Accept
**Contexte**: Cohrence des rponses REST et WebSocket
**Decision**: `{ success: boolean, data?: T, error?: string, code?: ErrorCode, pagination?: PaginationMeta }`
**Alternatives rejet**: Formats diffrents par endpoint (incohrent), erreurs lances (pas de type safety)
**Cons**: Lgrement plus verbeux (toujours unwrapper `.data`)
