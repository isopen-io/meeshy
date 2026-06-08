# Iteration 17 — Analyse d'optimisation (2026-06-08)

## Contexte
Suite iter 16. 91 console.* restants dans 33 fichiers. Exclusions : migrations (intentionnel), logger.ts/logger-enhanced.ts (infrastructure).

## Fichiers ciblés (30 fichiers, ~79 calls)

### Groupe A — Routes (30 calls)
| Fichier | Count |
|---------|-------|
| `routes/users/devices.ts` | 9 |
| `routes/attachments/upload.ts` | 5 |
| `routes/communities/members.ts` | 4 |
| `routes/voice-profile.ts` | 3 |
| `routes/translation-jobs.ts` | 2 |
| `routes/communities/settings.ts` | 2 |
| `routes/attachments/translation.ts` | 2 |
| `routes/users/profile.ts` | 1 |
| `routes/me/preferences/index.ts` | 1 |
| `routes/me/preferences/categories.ts` | 1 |
| `routes/links/validation.ts` | 1 |
| `routes/conversations/search.ts` | 1 |
| `routes/communities/search.ts` | 1 |
| `routes/attachments/download.ts` | 1 |

### Groupe B — Services (25 calls)
| Fichier | Count |
|---------|-------|
| `services/attachments/AttachmentService.ts` | 5 |
| `services/zmq-translation/utils/zmq-helpers.ts` | 4 |
| `services/GeoIPService.ts` | 4 |
| `services/AffiliateTrackingService.ts` | 4 |
| `services/notifications/NotificationFormatter.ts` | 3 |
| `services/messaging/MessageValidator.ts` | 3 |
| `services/ZmqSingleton.ts` | 2 |
| `services/SecurityMonitor.ts` | 2 |
| `services/preferences/PreferencesService.ts` | 1 |

### Groupe C — Utils + infra (6 calls)
| Fichier | Count |
|---------|-------|
| `utils/rate-limiter.ts` | 1 |
| `utils/normalize.ts` | 1 |
| `middleware/admin-permissions.middleware.ts` | 1 |
| `errors/custom-errors.ts` | 1 |
| `adapters/node-signal-stores.ts` | 1 |
| `server.ts` | 1 |

## Exclusions justifiées
- `migrations/migrate-from-legacy.ts` — script one-shot
- `utils/logger.ts` — infrastructure (intentionnel)
- `utils/logger-enhanced.ts` — infrastructure (intentionnel)
