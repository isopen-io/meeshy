# Plan d'Implémentation — Itération 8 (2026-06-08)

**Référence :** `docs/routine/analyses/2026-06-08-iteration-8-analyse.md`  
**Branche :** `claude/iter8-perf-reliability-HGWPs`

---

## Phase A — NotificationService : paralléliser createMentionNotificationsBatch

**Fichier :** `services/gateway/src/services/notifications/NotificationService.ts`

Remplacer :
```typescript
let count = 0;
for (const userId of mentionedUserIds) {
  if (...) continue;
  const notification = await this.createMentionNotification({...});
  if (notification) count++;
}
return count;
```

Par :
```typescript
const eligibleUserIds = mentionedUserIds.filter(userId => {
  if (userId === commonData.senderId) return false;
  if (!memberIds.includes(userId)) return false;
  if (!this.shouldCreateMentionNotification(...)) return false;
  return true;
});

const results = await Promise.all(
  eligibleUserIds.map(userId => this.createMentionNotification({...}))
);

return results.filter(Boolean).length;
```

**Impact :** ×N speedup pour N mentions simultanées (toutes les queries s'exécutent en parallèle)

---

## Phase B — Prisma : index composites Reaction et Mention

**Fichier :** `packages/shared/prisma/schema.prisma`

Dans `model Reaction` après `@@index([emoji])` :
```prisma
@@index([participantId, createdAt(sort: Desc)]) // User's reaction timeline
```

Dans `model Mention` après `@@index([mentionedAt])` :
```prisma
@@index([mentionedParticipantId, mentionedAt(sort: Desc)]) // User's mention inbox sorted by time
```

**Impact :** Queries mention inbox et historique réactions O(N) → O(log N)

---

## Statut

- [x] A — Promise.all pour createMentionNotificationsBatch
- [x] B — Index composites Reaction + Mention
