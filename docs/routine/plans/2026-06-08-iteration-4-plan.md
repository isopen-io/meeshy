# Plan d'Implémentation — Itération 4 Analytics (2026-06-08)

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

---

# Plan d'Implémentation — Itération 4 Perf/iOS (2026-06-08)
> Basé sur analyse `docs/routine/analyses/2026-06-08-iteration-4-audit.md`
> Branche : `claude/brave-archimedes-2c1TP`

---

## Phase A — Gateway (TypeScript)

### A1 — Réécrire getUnreadCountsForConversations ✅
**Fichier :** `services/gateway/src/services/MessageReadStatusService.ts:219-244`

Méthode `getUnreadCountsForUser(userId, conversationIds)` :
1. `participant.findMany` — 1 query
2. `conversationReadCursor.findMany` — 1 query
3. `Promise.all(participants.map(async p => message.count(...)))` — N queries parallèles

**Ancien :** 4 × N requêtes séquentielles | **Nouveau :** 2 + N requêtes parallèles

### A2 — Index Prisma manquant ✅
**Fichier :** `packages/shared/prisma/schema.prisma` (modèle Conversation)

```prisma
@@index([isActive, lastMessageAt]) // Optimisation iter-4: tri post-filtre participants
```

---

## Phase B — iOS Swift

### B1 — Isoler typingUsernames via ConversationStateStore ✅
**Fichiers :** `ConversationViewModel.swift`, `ConversationView.swift`, `MessageListViewController.swift`

- `@Published var typingUsernames` retiré du ViewModel principal → computed property vers `stateStore`
- `ConversationView` ajoute `@ObservedObject private var typingObserver: ConversationStateStore`
- `MessageListViewController` utilise `vm.typingUsernamesPublisher`

### B2 — URLSession cache HTTP ✅
**Fichier :** `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift`

```swift
config.urlCache = URLCache(memoryCapacity: 10_MB, diskCapacity: 50_MB, diskPath: "meeshy_http_cache")
config.requestCachePolicy = .useProtocolCachePolicy
```

---

## Phase C — Translator Python

### C1 — Timeout par inférence NLLB ✅
**Fichier :** `services/translator/src/services/zmq_pool/translation_processor.py`

`asyncio.wait_for(..., timeout=45.0)` sur chaque appel `translate_with_structure` et `_ml_translate_batch`

---

## Checklist de Validation

- [x] A1: `MessageReadStatusService.ts` — méthode `getUnreadCountsForUser` ajoutée
- [x] A1: `core.ts` — appel mis à jour vers `getUnreadCountsForUser`
- [x] A1: `search.ts` — appel mis à jour vers `getUnreadCountsForUser`
- [x] A2: `schema.prisma` — index `(isActive, lastMessageAt)` ajouté sur Conversation
- [x] B1: `ConversationViewModel.swift` — `typingUsernames` routé via stateStore
- [x] B2: `APIClient.swift` — `urlCache` configuré
- [x] C1: `translation_processor.py` — `asyncio.wait_for` 45s ajouté
