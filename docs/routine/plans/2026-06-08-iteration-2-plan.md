# Plan d'Implémentation — Itération 2 (2026-06-08)
> Basé sur analyse `docs/routine/analyses/2026-06-08-iteration-2-audit.md`
> Branche : `claude/brave-archimedes-cyKRF`

---

## Phase A — Gateway (impact serveur immédiat)

### A1 — Fix N+1 Unread Count
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts`
**Lignes :** 1566-1596

Supprimer la boucle morte (1566-1568) ET le `Promise.all` N+1 (1570-1578).
Remplacer par un map pur sur `participants` utilisant `unreadCountMap`.

```typescript
// AVANT : for loop morte + Promise.all N+1
for (const participant of participants) {
  const roomTarget = participant.userId || participant.id;
  const unreadCount = unreadCountMap.get(participant.id) ?? 0;
  // ← boucle abandonnée, tombe sur le Promise.all
  const unreadResults = await Promise.all(
    participants.map(async (participant) => {
      const unreadCount = await readStatusService.getUnreadCount(participant.id, normalizedId);
      return { participant, roomTarget, unreadCount };
    })
  );
  for (const { ... } of unreadResults) { ... }
}

// APRÈS : utilise le batch déjà calculé
const participantResults = participants.map(participant => ({
  participant,
  roomTarget: participant.userId || participant.id,
  unreadCount: unreadCountMap.get(participant.id) ?? 0,
}));
for (const { participant, roomTarget, unreadCount } of participantResults) {
  // emit + deliveryQueue
}
```

---

### A2 — Fix Missing Callback Error Responses
**Fichier :** `services/gateway/src/socketio/MeeshySocketIOManager.ts`
**Lignes :** 575-710

Ajouter `callback?.({ success: false, error: 'Internal server error' })` dans les catch blocks de :
- MESSAGE_SEND (576)
- MESSAGE_SEND_WITH_ATTACHMENTS (580)
- REACTION_ADD/REMOVE/SYNC (653-661)
- COMMENT_REACTION_ADD/REMOVE/SYNC (665-673)
- POST_REACTION_ADD/REMOVE/SYNC (685-693)
- LOCATION_SHARE/LIVE_START (697-701)

---

## Phase B — Web Frontend

### B1 — Fix stories refetchOnWindowFocus
**Fichier :** `apps/web/hooks/social/use-stories.ts:28`
Changer `refetchOnWindowFocus: 'always'` en `refetchOnWindowFocus: false`.

### B2 — Tone.js Dynamic Import
**Fichier :** `apps/web/utils/audio-effects.ts`
Remplacer le static `import * as Tone from 'tone'` par des dynamic imports dans chaque factory function.

### B3 — Supprimer ringtone.wav
**Fichier :** `apps/web/public/sounds/ringtone.wav`
Supprimer le fichier WAV (188KB) — ringtone.opus (12KB) suffit.

---

## Phase C — iOS

### C1 — Fix Task.detached → Task @MainActor
**Fichier :** `apps/ios/Meeshy/Features/Main/Services/CallManager.swift:1069`
Remplacer `Task.detached { }` par `Task { }` pour hériter de l'isolation `@MainActor`.

---

## Checklist de Validation

- [ ] A1: Plus aucun `getUnreadCount` per-participant dans `_broadcastNewMessage`
- [ ] A2: Tous les catch blocks avec `callback` appellent `callback?.({ success: false, ... })`
- [ ] B1: `use-stories.ts` n'a plus `refetchOnWindowFocus: 'always'`
- [ ] B2: `audio-effects.ts` n'a plus `import * as Tone from 'tone'` statique en top-level
- [ ] B3: `ringtone.wav` supprimé du filesystem
- [ ] C1: `Task.detached` remplacé par `Task` dans `CallManager.swift`
- [ ] Tests gateway passent : `pnpm test --filter=gateway`
- [ ] Commit sur `claude/brave-archimedes-cyKRF` avec message clair
- [ ] Push et merge dans main
