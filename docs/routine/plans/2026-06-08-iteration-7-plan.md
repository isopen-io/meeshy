# Plan d'Implémentation — Itération 7 (2026-06-08)

**Référence :** `docs/routine/analyses/2026-06-08-iteration-7-analyse.md`  
**Branche :** `claude/iter7-perf-reliability-HGWPs`

---

## Phase A — Conversation List: élimination query `currentUserParticipants`

**Fichier :** `services/gateway/src/routes/conversations/core.ts`

Remplacer le bloc :
```typescript
const currentUserParticipants = userId ? await prisma.participant.findMany({...}) : [];
const currentUserRoleMap = new Map(currentUserParticipants.map(...));
const currentUserJoinedAtMap = new Map(currentUserParticipants.map(...));
```

Par une extraction depuis `conv.participants` déjà fetchés :
```typescript
const currentUserRoleMap = new Map<string, string>();
const currentUserJoinedAtMap = new Map<string, Date | null>();
const convsMissingCurrentUser: string[] = [];

if (userId) {
  for (const conv of conversations) {
    const found = conv.participants.find(p => p.userId === userId);
    if (found) {
      currentUserRoleMap.set(conv.id, found.role);
      currentUserJoinedAtMap.set(conv.id, found.joinedAt);
    } else {
      convsMissingCurrentUser.push(conv.id);
    }
  }
  if (convsMissingCurrentUser.length > 0) {
    const remaining = await prisma.participant.findMany({
      where: { conversationId: { in: convsMissingCurrentUser }, userId, isActive: true },
      select: { conversationId: true, role: true, joinedAt: true }
    });
    for (const p of remaining) {
      currentUserRoleMap.set(p.conversationId, p.role);
      currentUserJoinedAtMap.set(p.conversationId, p.joinedAt);
    }
  }
}
```

**Impact :** −1 query DB / requête GET /conversations (éliminée pour DMs et petits groupes)

---

## Phase B — Typing Throttle serveur

**Fichiers :**
- `services/gateway/src/socketio/handlers/StatusHandler.ts`
- `services/gateway/src/socketio/MeeshySocketIOManager.ts`

Ajouts à `StatusHandler` :
1. `private typingThrottleMap = new Map<string, number>()`
2. `private static readonly TYPING_THROTTLE_MS = 2_000`
3. Dans `handleTypingStart`, avant le broadcast :
   ```typescript
   const throttleKey = `${userId}:${normalizedId}`;
   const now = Date.now();
   const lastEmitAt = this.typingThrottleMap.get(throttleKey) ?? 0;
   if (now - lastEmitAt < TYPING_THROTTLE_MS) return;
   this.typingThrottleMap.set(throttleKey, now);
   if (this.typingThrottleMap.size > 10_000) { /* purge entries > 20s */ }
   ```
4. `clearTypingThrottle(userId)` — supprime toutes les clés `userId:*`

Dans `MeeshySocketIOManager` handler `disconnect` :
```typescript
this.statusHandler.clearTypingThrottle(disconnectedUserId);
```

**Impact :** Protection serveur contre spam typing. −96% broadcasts en cas d'abus.

---

## Statut

- [x] A — Élimination query currentUserParticipants (core.ts)
- [x] B — Typing throttle serveur 2s (StatusHandler + MeeshySocketIOManager)
