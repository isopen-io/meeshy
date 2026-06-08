# Plan d'Implémentation — Itération 4 (2026-06-08)

**Référence:** `docs/routine/analyses/2026-06-08-iteration-4-analyse.md`  
**Branche:** `claude/iter4-analytics-cache`

---

## Phase A — Analytics performance (services/gateway)

### A1 — Paralléliser les queries séquentielles ✅

**Fichier:** `services/gateway/src/routes/admin/analytics.ts`

- `/realtime` : 3 `await` séquentiels → `Promise.all([count1, count2, groupBy])`
- `/user-distribution` : 4 `await` séquentiels → `Promise.all([...])`

### A2 — Remplacer activeConversations subquery ✅

**Fichier:** `services/gateway/src/routes/admin/analytics.ts:58-67`

```typescript
// AVANT (scan de toutes les conversations)
const activeConversations = await fastify.prisma.conversation.count({
  where: { messages: { some: { createdAt: { gte: oneHourAgo }, deletedAt: null } } }
});

// APRÈS (groupBy sur messages — collection plus petite, index sur createdAt)
const activeConversationsGroups = await fastify.prisma.message.groupBy({
  by: ['conversationId'],
  where: { createdAt: { gte: oneHourAgo }, deletedAt: null }
});
const activeConversations = activeConversationsGroups.length;
```

### A3 — Remplacer findMany + JS groupBy ✅

**Fichier:** `services/gateway/src/routes/admin/analytics.ts`

`/hourly-activity` : 8 COUNT parallèles (buckets de 3h)
```typescript
const buckets = await Promise.all(
  Array.from({ length: 8 }, (_, i) => {
    const bucketEnd = new Date(now.getTime() - i * 3 * 60 * 60 * 1000);
    const bucketStart = new Date(bucketEnd.getTime() - 3 * 60 * 60 * 1000);
    return fastify.prisma.message.count({
      where: { createdAt: { gte: bucketStart, lt: bucketEnd }, deletedAt: null }
    }).then(activity => ({ hour: `${String(bucketStart.getHours()).padStart(2, '0')}h`, activity }));
  })
);
```

`/volume-timeline` : 7 COUNT parallèles (buckets journaliers)

### A4 — Ajouter Redis cache à tous les endpoints analytics ✅

TTLs:
- `admin:analytics:realtime` : 60s
- `admin:analytics:hourly-activity` : 300s
- `admin:analytics:volume-timeline` : 600s
- `admin:analytics:message-types:{period}` : 300s
- `admin:analytics:language-distribution:{limit}` : 300s
- `admin:analytics:user-distribution` : 300s
- `admin:analytics:kpis:{period}` : 300s

---

## Statut

- [x] A1 — Paralléliser queries séquentielles
- [x] A2 — Remplacer subquery activeConversations
- [x] A3 — Remplacer findMany + JS groupBy
- [x] A4 — Redis cache sur tous les endpoints
