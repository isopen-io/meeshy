# Analyse — Itération 4 (2026-06-08)

**Branche:** `claude/iter4-analytics-cache`  
**Basé sur:** main après merge de PR #349 (iter3-uissi) + PR #352 (iter3-xvj0l en cours)

---

## Ce qui est déjà implémenté (à ne pas répéter)

- React Query persistence IndexedDB (web)
- Tone.js lazy loading via dynamic import
- Admin dashboard Redis cache 600s TTL (séparation permissions/stats)
- Block list Redis cache par paire d'utilisateurs (5-min TTL)
- console.log → logger.debug structuré
- N+1 fix dans links/creation.ts (batch findMany)
- Prisma compound indexes
- MeeshyColors migration + i18n

## Problèmes identifiés

### P1 (HIGH) — analytics.ts: findMany + JS groupBy charge toute la mémoire

**Fichier:** `services/gateway/src/routes/admin/analytics.ts:99-138` (hourly-activity)  
**Fichier:** `services/gateway/src/routes/admin/analytics.ts:437-487` (volume-timeline)

Les deux endpoints chargent **tous** les messages des 24h / 7 jours en mémoire via `findMany`, puis aggrègent en JavaScript. Sur une instance à charge élevée (10k+ messages/jour), cela représente des centaines de Mo de données chargées pour calculer de simples compteurs.

**Fix:** Remplacer par des `COUNT` parallèles en tranches (8 buckets de 3h pour hourly, 7 buckets journaliers pour timeline).

### P2 (HIGH) — analytics.ts: activeConversations utilise un subquery lent

**Fichier:** `services/gateway/src/routes/admin/analytics.ts:58-67`

```typescript
conversation.count({ where: { messages: { some: { ... } } } })
```

Ce pattern force MongoDB à scanner toutes les conversations pour vérifier si elles ont des messages récents. C'est un scan complet de la collection.

**Fix:** `message.groupBy({ by: ['conversationId'], where: {...} }).then(g => g.length)` — beaucoup plus efficace car seule la collection messages est touchée.

### P3 (HIGH) — analytics.ts: 3-4 queries séquentielles sans Promise.all

**Fichiers:** `/realtime` (3 awaits séquentiels), `/user-distribution` (4 awaits séquentiels)

Chaque query attend la précédente au lieu d'être parallélisées.

**Fix:** Regrouper dans un seul `Promise.all`.

### P4 (MEDIUM) — analytics.ts: aucun cache sur 6 endpoints

Contrairement au dashboard (cache 600s implémenté en iter3), les 6 endpoints analytics font des requêtes MongoDB à chaque appel. Sur un dashboard avec 5+ admins qui rafraîchissent toutes les 30s, cela représente des dizaines de requêtes/minute inutiles.

**Fix:** Appliquer le pattern `getCacheStore()` déjà utilisé dans `dashboard.ts`:
- `/realtime` : 60s
- `/hourly-activity` : 300s
- `/volume-timeline` : 600s
- `/message-types` : 300s (par période)
- `/language-distribution` : 300s
- `/user-distribution` : 300s
- `/kpis` : 300s (par période)

---

## Hors scope de cette itération (à planifier ultérieurement)

- Web React.memo sur list items (manque de test E2E visuel)
- Zustand store slicing (26 usages, refactor complexe)
- iOS AnyView → @ViewBuilder (hors du cas documenté)
- Translation deduplication (client mutation ID)
