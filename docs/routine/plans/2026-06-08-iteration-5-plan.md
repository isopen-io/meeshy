# Plan d'Implémentation — Itération 5 (2026-06-08)

**Référence :** `docs/routine/analyses/2026-06-08-iteration-5-analyse.md`  
**Branche :** `claude/brave-archimedes-HGWPs`

---

## Phase A — Gateway Auth : Suppression 2e Query Prisma

**Fichier :** `services/gateway/src/middleware/auth.ts`

Étendre `CachedUserRow` pour inclure tous les champs de `FullUserRow`.
Quand `cachedSlim` est trouvé, construire `FullUserRow` directement depuis le cache
sans faire de 2e `prisma.user.findUnique()`.

**Impact :** −50% queries DB auth | ~300ms → <5ms sur cache hit

---

## Phase B — Gateway N+1 CallEventsHandler

**Fichier :** `services/gateway/src/socketio/CallEventsHandler.ts`

Remplacer toutes les boucles `participant.userId → prisma.user.findUnique()` par :
1. Collecter tous les `userId` des participants
2. Un seul `prisma.user.findMany({ where: { id: { in: [...] } } })`
3. Construire une `Map<userId, User>` pour le lookup O(1)

**Impact :** 50 queries → 1 query pour les calls de groupe

---

## Phase C — Gateway Message Dedup

**Fichier :** `services/gateway/src/socketio/handlers/MessageHandler.ts`

Avant `prisma.message.create()` :
```typescript
const existing = await prisma.message.findFirst({ 
  where: { clientMessageId: validated.clientMessageId, conversationId: ... }
});
if (existing) {
  callback?.({ success: true, data: { messageId: existing.id }, duplicate: true });
  return;
}
```

**Impact :** Élimine les messages dupliqués sur retry réseau

---

## Phase D — Translator NLLB Timeout

**Fichier :** `services/translator/src/services/zmq_translation_handler.py`

Wraper l'appel ML dans `asyncio.wait_for(..., timeout=45.0)`.
En cas de timeout, retourner le texte original (fallback gracieux).

**Impact :** Prévient les deadlocks (incident prod #13)

---

## Phase E — iOS Notification Dedup

**Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift`

Ajouter un `Set<String>` d'IDs récents + fenêtre de déduplication 2s.
Les notifications venant d'APN ET de Socket.IO partagent le même filtre.

**Impact :** Élimine les toasts dupliqués (APN + socket)

---

## Phase F — Web Voice Messages : Vitesse de Lecture

**Fichiers :** 
- `apps/web/components/audio/AudioPlayerV2.tsx` (si existe)
- Composants de lecture audio dans les bulles de messages

Ajouter un bouton de vitesse (1× → 1.5× → 2×) sur l'AudioPlayer des voice messages.
`HTMLMediaElement.playbackRate` API native.

**Impact :** Feature gap WhatsApp/Telegram comblé

---

## Phase G — Prisma Index Notification

**Fichier :** `packages/shared/prisma/schema.prisma`

```prisma
// Dans model Notification (si existant) ou ConversationReadCursor
@@index([userId, isRead])
@@index([conversationId, isRead])
```

**Impact :** Comptage unread rapide

---

## Phase H — Web Reconnect Backoff Exponentiel

**Fichier :** `apps/web/services/socketio/connection.service.ts`

Remplacer délai fixe 500ms par backoff exponentiel avec jitter :
```typescript
const delay = Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 1000;
```

**Impact :** Réduit spam réseau en cas de serveur down

---

## Phase I — Web Socket Event Dedup Client

**Fichier :** `apps/web/services/socketio/messaging.service.ts`

Ajouter un `Set<string>` de messageIds récents (TTL 30s) pour prévenir
l'affichage dupliqué de messages en cas de reconnexion.

---

## Ordre d'Exécution

```
A (30min) → B (1h) → C (45min) → D (15min)
→ E (1h) → F (2h) → G (5min) → H (30min) → I (30min)
```

Phases A-D en priorité (impact DB/fiabilité).
Phases E-I en parallèle (domaines distincts).

---

## Statut

- [x] A — Auth cache full row (services/gateway/src/middleware/auth.ts)
- [x] B — N+1 CallEventsHandler (services/gateway/src/socketio/CallEventsHandler.ts)
- [x] C — Message dedup clientMessageId (already implemented via Prisma P2002 unique constraint)
- [x] D — NLLB timeout asyncio (already implemented in iteration 4 — translation_processor.py)
- [x] E — iOS notification dedup (packages/MeeshySDK/Sources/MeeshySDK/Notifications/NotificationToastManager.swift)
- [x] F — Web voice speed control (already implemented — AudioControls.tsx snapPlaybackRate)
- [x] G — Prisma notification index (already present in schema.prisma)
- [x] H — Web reconnect backoff (apps/web/services/socketio/connection.service.ts)
- [x] I — Web socket event dedup (apps/web/services/socketio/messaging.service.ts)
- [x] Bonus — Presence snapshot cache 60s TTL (services/gateway/src/socketio/MeeshySocketIOManager.ts)
