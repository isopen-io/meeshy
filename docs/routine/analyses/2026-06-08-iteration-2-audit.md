# Analyse Itération 2 — Meeshy Optimisation Globale
**Date :** 2026-06-08 (itération 2)
**Branche :** `claude/brave-archimedes-cyKRF`
**Méthode :** Audit code profond avec 3 agents parallèles — Gateway, Web Frontend, iOS

---

## 0. État par rapport à l'itération précédente (2026-06-08 itération 1)

| Item planifié | Statut réel |
|---------------|-------------|
| P1.1 N+1 unreadCount batch | ⚠️ PARTIELLEMENT — `unreadCountMap` calculé mais le `Promise.all` N+1 reste actif (code mort + code bugué coexistent) |
| P1.2 Double fetch translations | ✅ OK — `transformTranslationsToArray` utilise le message en mémoire |
| P1.3 Index Prisma MessageReadStatus | ✅ OK — 7 indexes présents |
| P1.4 Rate limit REQUEST_TRANSLATION | ✅ OK — 10 req/min sliding window |
| P1.5 Timeout ZMQ | ✅ OK — `Promise.race` 5s implémenté |
| P1.6 Dédup langues ZMQ | ✅ OK — `new Set()` + normalize lowercase |
| P2.1 Screen capture observer cleanup | ✅ OK — `stopScreenCaptureMonitoring()` appelé en premier |
| P2.4 BubbleCallNoticeView Equatable | ✅ OK — closure exclue de l'égalité |
| P2.7 Backoff reconnexion Socket SDK | ✅ OK — exponentiel 1s→60s + jitter |
| Auth Redis cache | ✅ OK — implémenté avec TTL 60s |
| ZmqRequestSender timeout | ✅ OK — 5s Promise.race |
| refetchInterval notifications/friends | ✅ OK — 0 polling, tout socket |
| Dédup socket-cache-sync | ✅ OK — O(n) acceptable |
| pendingMessages cleanup timeout | ✅ OK — 120s avec Map cleanup |

---

## 1. Bugs Confirmés à Corriger

### 1.1 N+1 Unread Count — Refactor Incomplet (CRITIQUE)

**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:1566-1578`

Le code montre une tentative de refactor abandonnée en cours de route :

```typescript
// BATCH correctement calculé (ligne 1562)
const unreadCountMap = await readStatusService.getUnreadCountsForParticipants(participantIds, normalizedId);

// BOUCLE MORTE — roomTarget/unreadCount calculés mais jamais utilisés (lignes 1566-1568)
for (const participant of participants) {
  const roomTarget = participant.userId || participant.id;
  const unreadCount = unreadCountMap.get(participant.id) ?? 0;
  // PUIS : tombe sur le Promise.all N+1 ci-dessous (lignes 1570-1578) !!!
  const unreadResults = await Promise.all(
    participants.map(async (participant) => {
      const unreadCount = await readStatusService.getUnreadCount(participant.id, normalizedId); // ← N requêtes
      return { participant, roomTarget, unreadCount };
    })
  );
```

**Impact :** Pour chaque `message:new` broadcast → N requêtes Mongo supplémentaires (1 par participant), annulant le bénéfice du batch.

**Fix :** Supprimer le `Promise.all` et la boucle morte, utiliser `unreadCountMap` directement dans le `for`.

---

### 1.2 Missing Callback Error Response dans Socket Handlers

**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts:575-710`

12 handlers avec `callback` en signature n'appellent pas `callback?.({ success: false })` dans les `catch` :
- `MESSAGE_SEND` (ligne 576)
- `MESSAGE_SEND_WITH_ATTACHMENTS` (ligne 580)
- `REACTION_ADD/REMOVE/SYNC` (lignes 653-661)
- `COMMENT_REACTION_ADD/REMOVE/SYNC` (lignes 665-673)
- `POST_REACTION_ADD/REMOVE/SYNC` (lignes 685-693)
- `LOCATION_SHARE/LIVE_START` (lignes 697-701)

**Impact :** Clients qui await le callback restent pendants indéfiniment sur erreur → UI bloquée.

---

### 1.3 Tone.js Import Statique (~350KB bundle)

**Fichier :** `apps/web/utils/audio-effects.ts:12`

```typescript
import * as Tone from 'tone'; // ← Chargé pour TOUTES les sessions
```

Tone.js n'est utilisé que dans les appels vidéo avec effets audio. Chargé systématiquement.

**Fix :** Dynamic import `await import('tone')` dans la factory function d'effet.

---

### 1.4 Stories `refetchOnWindowFocus: 'always'`

**Fichier :** `apps/web/hooks/social/use-stories.ts:28`

```typescript
refetchOnWindowFocus: 'always' as const, // ← Refetch complet à chaque focus fenêtre
staleTime: Infinity,                       // ← Contradiction : infinite staletime mais toujours refetch
```

Contradiction entre `staleTime: Infinity` (données jamais stale) et `refetchOnWindowFocus: 'always'` (force refetch malgré ça). Chaque retour sur onglet déclenche une requête HTTP inutile.

**Fix :** `refetchOnWindowFocus: false` — les stories sont mises à jour via Socket.IO.

---

### 1.5 iOS Task.detached pour Emit Socket Call:End (CONCURRENCE)

**Fichier :** `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:1069`

```swift
Task.detached {  // ← Escape de @MainActor
    let acked = await MessageSocketManager.shared.emitCallEndWithAck(callId: callId)
    // MessageSocketManager.shared est @MainActor → data race potentielle
}
```

`CallManager` est `@MainActor`. `Task.detached` échappe explicitement à l'isolation de l'acteur courant. `MessageSocketManager.shared` est également `@MainActor` — appel cross-actor non sécurisé.

**Fix :** `Task { }` (hérite du contexte `@MainActor` du site d'appel) — fire-and-forget mais sécurisé.

---

## 2. Optimisations Supplémentaires Identifiées

### 2.1 ringtone.wav (188KB) encore présent

`apps/web/public/sounds/ringtone.wav` — `ringtone.opus` (12KB) existe déjà. Le WAV est référencé nulle part dans le code, il est superflu.

**Fix :** Supprimer `ringtone.wav`.

---

## 3. Bilan — Ce qui reste à faire

| # | Problème | Sévérité | Effort | Impact |
|---|---------|---------|--------|--------|
| 1.1 | N+1 unread count (code mort + doublon actif) | 🔴 CRITIQUE | 30 min | −N req/message broadcast |
| 1.2 | Missing callback error response | 🟠 HAUTE | 45 min | UX: fin des UI bloquées |
| 1.3 | Tone.js static import | 🟡 MOYENNE | 30 min | −350KB bundle initial |
| 1.4 | Stories refetchOnWindowFocus | 🟢 BASSE | 5 min | −1 req/focus fenêtre |
| 1.5 | Task.detached @MainActor | 🟠 HAUTE | 15 min | Stabilité concurrence iOS |
| 1.6 | ringtone.wav superflu | 🟢 BASSE | 2 min | −188KB assets publics |
