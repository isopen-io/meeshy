# Analyse Optimisation — Itération 8 (2026-06-08)

**Branche :** `claude/brave-archimedes-7D4kb`

## Contexte

Construit sur les itérations 1–7 mergées dans main. Cette itération cible trois points
chauds non adressés : une query DB inutile dans GET /conversations, du logging console.log
sur le hot-path de production, et des headers HTTP manquants sur des endpoints immutables.

---

## Analyse

### Issue #1 — GET /conversations : query `memberUsers` inutile (HAUTE)

**Fichier :** `services/gateway/src/routes/conversations/core.ts:397–453`

Le handler GET /conversations exécute trois queries en parallèle :
1. `prisma.conversation.findMany(...)` — conversations avec `participants: { take: 5 }`
2. `prisma.user.findMany({ where: { id: { in: allMemberUserIds } } })` — **membersUsers** : données user complètes pour tous les participants
3. `prisma.conversation.count(...)` + `readStatusService.getUnreadCountsForUser(...)` — comptes

**Problème :** La query `memberUsers` (2) récupère `id, username, displayName, firstName, lastName, avatar, isOnline, lastActiveAt`. Or `conversationListParticipantSelect.user.select` sélectionne déjà `id, username, displayName, avatar, isOnline, lastActiveAt` — il manque uniquement `firstName` et `lastName`.

**Fix :** Ajouter `firstName: true, lastName: true` dans `conversationListParticipantSelect.user.select`. Cela rend `m.user` complet et permet d'**éliminer entièrement la query `memberUsers`** ainsi que la construction du `Set<allMemberUserIds>` et du `Map<userMap>`.

**Impact :** −1 query DB par GET /conversations. Pour un utilisateur actif (100 convs × 2 pages/jour) = ~200 queries DB économisées par jour/utilisateur. Réduction de la latence d'environ 10–30ms selon la charge Redis.

---

### Issue #2 — console.log en hot-path de production (HAUTE)

**Fichier :** `services/gateway/src/routes/conversations/core.ts:540–545`

```
console.log('===============================================');
console.log('[CONVERSATIONS_PERF] Query performance breakdown (OPTIMIZED v2)');
console.log(`  - conversationsQuery: ${perfTimings.conversationsQuery?.toFixed(2)}ms`);
console.log(`  - parallelQueries (users+unread+count): ${perfTimings.parallelQueries?.toFixed(2)}ms`);
console.log(`  TOTAL: ${totalTime.toFixed(2)}ms`);
console.log('===============================================');
```

5 `console.log` sur **chaque requête GET /conversations** en production. Ce logging :
- Bloque l'event loop (I/O synchrone vers stdout)
- Empêche toute analyse structurée des logs (pas de niveau, pas de JSON)
- Génère du bruit inutile en production

**Fix :** Remplacer par `logger.debug(...)` avec un seul appel JSON structuré, conditionné à `LOG_LEVEL=debug` (désactivé en prod par défaut).

**Impact :** Réduction de la charge event loop Node.js. Amélioration de la lisibilité des logs de prod.

---

### Issue #3 — Attachment metadata : headers de cache manquants (MOYENNE)

**Fichier :** `services/gateway/src/routes/attachments/metadata.ts`

GET `/attachments/:attachmentId/metadata` ne retourne aucun header `Cache-Control` ni `ETag`.

Les métadonnées d'un attachment sont **immutables après création** (mimeType, fileSize, dimensions, etc.). Chaque visite de la conversation refetch inutilement ces données.

**Fix :** Ajouter :
- `Cache-Control: private, max-age=3600, stale-while-revalidate=86400`
- `ETag` basé sur le hash des métadonnées (ou `attachment.updatedAt`)
- Réponse `304 Not Modified` sur `If-None-Match` match

**Impact :** −100% de bande passante sur les rechargements de conversations pour les pièces jointes déjà vues. Réduit la charge DB sur les clients actifs.

---

### Issue #4 — Mise à jour du test conversationListParticipantSelect (LOW)

**Fichier :** `services/gateway/src/__tests__/unit/routes/conversation-list-participant-select.test.ts`

Le test vérifie que `user.select` contient `id, username, displayName, avatar, isOnline` mais ne teste PAS `firstName` et `lastName`. Après l'ajout de ces champs (issue #1), le test doit être mis à jour pour documenter le comportement attendu.
