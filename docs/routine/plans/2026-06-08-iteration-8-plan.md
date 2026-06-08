# Plan d'Implémentation — Itération 8 (2026-06-08)

**Référence :** `docs/routine/analyses/2026-06-08-iteration-8-analyse.md`
**Branche :** `claude/brave-archimedes-7D4kb`

---

## Phase A — Éliminer query `memberUsers` dans GET /conversations

**Fichier :** `services/gateway/src/routes/conversations/core.ts`

### A1 — Ajouter firstName/lastName à conversationListParticipantSelect.user.select

```typescript
user: {
  select: {
    id: true,
    username: true,
    displayName: true,
    firstName: true,   // AJOUTÉ — élimine memberUsers query
    lastName: true,    // AJOUTÉ — élimine memberUsers query
    avatar: true,
    isOnline: true,
    lastActiveAt: true
  }
}
```

### A2 — Supprimer la collecte allMemberUserIds

Supprimer le bloc :
```typescript
const allMemberUserIds = new Set<string>();
for (const conv of conversations) {
  for (const member of (conv as any).participants) {
    if (member.userId) {
      allMemberUserIds.add(member.userId);
    }
  }
}
```

### A3 — Supprimer memberUsers de Promise.all

Remplacer :
```typescript
const [memberUsers, totalCount, unreadCountMap] = await Promise.all([
  allMemberUserIds.size > 0
    ? prisma.user.findMany({ where: { id: { in: Array.from(allMemberUserIds) } }, select: { ... } })
    : Promise.resolve([]),
  // ...
```

Par :
```typescript
const [totalCount, unreadCountMap] = await Promise.all([
  // ...
```

### A4 — Simplifier le merge dans conversationsWithUnreadCount.map

Remplacer la logique `userMap` par usage direct de `m.user` :
```typescript
const membersWithUser = conversation.participants
  .slice(0, 5)
  .map((m: any) => {
    const liveOnline = presenceChecker?.isOnline(m.userId ?? m.id);
    return {
      ...m,
      isOnline: liveOnline === undefined ? m.isOnline : liveOnline,
      user: m.userId
        ? { ...m.user, isOnline: liveOnline === undefined ? m.user?.isOnline : liveOnline }
        : null
    };
  });
```

Et supprimer la construction `userMap` :
```typescript
// SUPPRIMER:
const userMap = new Map(memberUsers.map(u => { ... }));
```

---

## Phase B — Remplacer console.log hot-path par logger.debug

**Fichier :** `services/gateway/src/routes/conversations/core.ts:540–545`

Remplacer :
```typescript
console.log('===============================================');
console.log('[CONVERSATIONS_PERF] Query performance breakdown (OPTIMIZED v2)');
console.log(`  - conversationsQuery: ${perfTimings.conversationsQuery?.toFixed(2)}ms`);
console.log(`  - parallelQueries (users+unread+count): ${perfTimings.parallelQueries?.toFixed(2)}ms`);
console.log(`  TOTAL: ${totalTime.toFixed(2)}ms`);
console.log('===============================================');
```

Par :
```typescript
logger.debug('[CONVERSATIONS_PERF]', {
  conversationsQuery: perfTimings.conversationsQuery?.toFixed(2),
  parallelQueries: perfTimings.parallelQueries?.toFixed(2),
  total: totalTime.toFixed(2)
});
```

---

## Phase C — Cache-Control sur GET /attachments/:id/metadata

**Fichier :** `services/gateway/src/routes/attachments/metadata.ts`

Après récupération de l'attachment, ajouter :
```typescript
const etag = `"${attachment.id}-${attachment.updatedAt?.getTime() ?? 0}"`;

if (request.headers['if-none-match'] === etag) {
  return reply.code(304).send();
}

reply.header('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400');
reply.header('ETag', etag);
```

---

## Phase D — Mise à jour du test participant select

**Fichier :** `services/gateway/src/__tests__/unit/routes/conversation-list-participant-select.test.ts`

Ajouter dans le test "keeps the nested user fallback fields" :
```typescript
expect(conversationListParticipantSelect.user.select.firstName).toBe(true);
expect(conversationListParticipantSelect.user.select.lastName).toBe(true);
```

Et mettre à jour le commentaire pour noter que firstName/lastName permettent d'éliminer la query memberUsers.

---

## Statut

- [ ] A — Éliminer query memberUsers (firstName/lastName dans select, remove Promise.all branch)
- [ ] B — Remplacer console.log par logger.debug
- [ ] C — Cache-Control sur attachment metadata
- [ ] D — Mise à jour test conversationListParticipantSelect
