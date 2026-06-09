# Analyse Optimisation — Itération 8 (2026-06-08)

**Branche :** `claude/brave-archimedes-OnFYZ`
**Construit sur :** Itérations 1–7 (mergées dans main)

## Contexte

Les 7 premières itérations ont adressé : auth cache, N+1 conversations, reconnect backoff,
event dedup, i18n, a11y, typing throttle serveur, élimination query currentUserParticipants.

Cette itération cible 6 points chauds identifiés par analyse statique approfondie sur
gateway + shared + web frontend.

---

## Issue #1 — Type Safety : `SpeakerInfo.voiceCharacteristics: any` (CRITIQUE)

**Fichier :** `packages/shared/types/attachment-transcription.ts:77`

`voiceCharacteristics?: any` viole la politique strict-mode. Ce champ transporte des
données de pitch/spectral/MFCC entre le translator Python et le gateway/frontend.
L'absence de type compile empêche la détection d'erreurs de schéma lors des mises à jour
du translator.

**Fix :** Introduire `VoiceCharacteristics` interface typée avec toutes les sous-structures
documentées dans le commentaire JSDoc existant.

---

## Issue #2 — Rate Limiter : clé par socket.id au lieu de userId (HAUTE)

**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:598,736`

```typescript
const rateLimitKey = `translation_request:${socket.id}`;
```

Un user avec 5 appareils connectés bénéficie de 5× la limite (10 req/min × 5 = 50).
Vecteur d'abus multi-device pour saturer le pipeline ZMQ de traduction.

**Fix :** Utiliser `userId` (disponible via `this.socketToUser.get(socket.id)`) comme clé.
Cleanup sur disconnect utilise également le userId pour purger toutes les entrées de cet user.

---

## Issue #3 — Presence Snapshot Cache : pas invalidé sur disconnect (MEDIUM)

**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:725-737`

Le cache `presenceSnapshotCache` (TTL 60s) n'est pas invalidé quand un user se déconnecte.
Si l'user se reconnecte dans les 60s, le snapshot envoyé aux contacts contient potentiellement
des statuts en ligne périmés (TTL 60s >> délai reconnect typique 2-5s).

**Fix :** Ajouter `this.presenceSnapshotCache.delete(disconnectedUserId)` dans le handler
`disconnect` au même endroit que les autres invalidations (invalidateIdentityCache, clearTypingThrottle).

---

## Issue #4 — AuthHandler : console.* au lieu de logger (HAUTE)

**Fichier :** `services/gateway/src/socketio/handlers/AuthHandler.ts:58,61,79,147,169,174,226,288,306,319`

10 appels `console.warn/error/log` contournent le système de logging Winston/Pino avec
redaction PII. Les userId et socketId apparaissent en clair dans stdout sans redaction.

**Fix :** Remplacer par le `logger` (`enhancedLogger.child({ module: 'AuthHandler' })`) déjà
importé dans le projet.

---

## Issue #5 — Web : Message Dedup TTL trop court (30s → 5min) (HAUTE)

**Fichier :** `apps/web/services/socketio/messaging.service.ts`

La déduplication des messages socket.io expire après 30s. Sur les réseaux flaky avec
reconnexion > 30s, des messages peuvent apparaître en double.

**Fix :** Augmenter le TTL à 5 minutes (300 000ms) — cohérent avec le `gcTime: 30min`
de React Query. Minimal impact mémoire (IDs strings, bounded set).

---

## Issue #6 — Web : Typing Indicator Timeouts non nettoyés (HAUTE)

**Fichier :** `apps/web/stores/conversation-ui-store.ts`

Les timeouts `removeTypingUser` ne sont pas trackés par clé `(conversationId, userId)`.
Si l'user change de conversation rapidement, les anciens timeouts continuent de mettre
à jour l'état de conversations fermées — memory leak progressif.

**Fix :** Introduire `typingTimeouts: Map<string, ReturnType<typeof setTimeout>>` dans le
store, keyed par `${conversationId}:${userId}`. Clear avant chaque nouveau setTimeout.

---

## Résumé Priorités

| # | Fichier | Catégorie | Effort |
|---|---------|-----------|--------|
| 1 | `packages/shared/types/attachment-transcription.ts` | Type Safety | S |
| 2 | `services/gateway/src/socketio/MeeshySocketIOManager.ts` | Security | S |
| 3 | `services/gateway/src/socketio/MeeshySocketIOManager.ts` | Correctness | XS |
| 4 | `services/gateway/src/socketio/handlers/AuthHandler.ts` | Logging | M |
| 5 | `apps/web/services/socketio/messaging.service.ts` | Reliability | XS |
| 6 | `apps/web/stores/conversation-ui-store.ts` | Memory | S |
