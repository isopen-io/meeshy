## 2025-01: Logging - Pino + PII Redaction
**Statut**: Accept
**Contexte**: Logs structures pour aggregation, conformit RGPD
**Decision**: Pino (5x plus rapide que Winston), redaction automatique PII (email, userId, IP hashes), child loggers par module
**Alternatives rejet**: Winston seul (plus lent, legacy), console.log (pas structur)
**Cons**: Double systme logging (Pino + Winston legacy), redaction complique le debugging
