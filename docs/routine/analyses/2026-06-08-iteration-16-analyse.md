# Iteration 16 — Analyse d'optimisation (2026-06-08)

## Contexte
Suite iter 15. Cible les 8 fichiers à plus forte volumétrie parmi les 40 restants (177 console.* total).

## Fichiers ciblés

| Fichier | Count | Notes |
|---------|-------|-------|
| `services/attachments/UploadProcessor.ts` | 17 | Info/debug/error avec emojis |
| `routes/user-deletions.ts` | 13 | Logs structurés avec userId en message |
| `services/messaging/MessagingService.ts` | 11 | Erreurs critiques + 1 deprecated warning |
| `routes/two-factor.ts` | 9 | Erreurs routes 2FA |
| `routes/auth/phone-transfer.ts` | 7 | Auth errors |
| `services/zmq-agent/ZmqAgentClient.ts` | 8 | ZMQ init/close logs |
| `services/AttachmentEncryptionService.ts` | 8 | Vault + encryption errors |
| `routes/communities/core.ts` | 6 | Route errors (fichier séparé de communities.ts) |

## Exclusions justifiées
- `migrations/migrate-from-legacy.ts` — script one-shot, console.log intentionnel pour affichage terminal
- `utils/logger.ts` — infrastructure logger, console.* intentionnels
- `utils/logger-enhanced.ts` — commentaires uniquement

## PII concerns
- MessagingService : userId/conversationId → contexte
- user-deletions : userId/messageId/conversationId → contexte
