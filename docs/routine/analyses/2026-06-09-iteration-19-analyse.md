# Iteration 19 — Analyse d'optimisation (2026-06-09)

## Contexte
Suite iter 18. Logger migration complète. Focus : standardisation du format de réponse HTTP (reply.send → sendSuccess/sendError).

## État des lieux
**1373 calls** non-standards dans 40+ fichiers route. La règle CLAUDE.md exige l'usage de `sendSuccess()`/`sendError()` depuis `utils/response.ts`.

## Exceptions documentées (ne pas migrer)
- `conversations/participants.ts:209` — top-level `pagination` attendu par iOS SDK (CoR client)
- `conversations/core.ts:546` — ETag pipeline (`sendWithETag` → `reply.send`)
- `conversations/sharing.ts:491` — top-level `isModerator` attendu par iOS SDK
- `conversations/messages.ts:1244` — ETag pipeline
- `conversations/messages.ts:2363` — top-level `cursorPagination` attendu par iOS SDK
- `posts/audio.ts:148` — réponse binaire (readFile), pas JSON

## Fichiers ciblés iter 19 (6 fichiers, ~133 calls)

| Fichier | Count | Notes |
|---------|-------|-------|
| `routes/message-read-status.ts` | 21 | Partiellement migré (3 std existants) |
| `routes/affiliate.ts` | 29 | Entièrement à migrer |
| `routes/calls.ts` | 20 | Entièrement à migrer |
| `routes/two-factor.ts` | 20 | Entièrement à migrer |
| `routes/reactions.ts` | 22 | Entièrement à migrer |
| `routes/voice-profile.ts` | 21 | Entièrement à migrer |

## Patterns de conversion
```typescript
// Pattern 1: Success
reply.send({ success: true, data: X })
→ sendSuccess(reply, X)

// Pattern 2: Error générique
reply.status(500).send({ success: false, error: 'msg' })
→ sendInternalError(reply, 'msg')

// Pattern 3: Erreurs spécifiques
reply.status(401).send(...) → sendUnauthorized(reply, '...')
reply.status(403).send(...) → sendForbidden(reply, '...')
reply.status(404).send(...) → sendNotFound(reply, '...')
reply.status(400).send(...) → sendBadRequest(reply, '...')
reply.status(409).send(...) → sendConflict(reply, '...')

// Pattern 4: Pagination standard
reply.send({ success: true, data: X, pagination: { total, offset, limit, hasMore } })
→ sendPaginatedSuccess(reply, X, { total, offset, limit, hasMore })
```

## Import nécessaire
```typescript
import { sendSuccess, sendError, sendInternalError, sendNotFound, sendUnauthorized, sendForbidden, sendBadRequest, sendConflict, sendPaginatedSuccess } from '../../utils/response';
```

## Prochaines itérations
- **Iter 20** : communities.ts (78), admin/users.ts (64), users/profile.ts (50)
- **Iter 21** : tracking-links, anonymous.ts, auth/magic-link.ts, messages.ts
