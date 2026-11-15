## 2025-01: Validation - Zod avec CommonSchemas
**Statut**: Accept
**Contexte**: Validation runtime aux frontires de confiance (API, WebSocket)
**Decision**: Zod pour validation + infrence de types. `CommonSchemas` centralis (mongoId, conversationType, messageContent, email, etc.)
**Alternatives rejet**: Joi (moins TypeScript-friendly), Yup (moins d'infrence), class-validator (ncessite classes), validation manuelle (error-prone)
**Cons**: Source unique de vrit pour les rgles de validation
