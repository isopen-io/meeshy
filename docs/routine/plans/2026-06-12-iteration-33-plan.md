# Iteration 33 — Plan d'implémentation (2026-06-12)

## Objectif
API conversations & pagination (suite désignée par le plan iter 32 : F1+F6) : capper et filtrer
les participants du détail, supprimer le calcul de stats mort (payload strippé du wire), unifier
les 10 implémentations de `validatePagination` avec garde d'offset. Gateway uniquement, zéro
changement de contrat consommé par les clients.

## Étapes (TDD : RED → GREEN)

### Phase 1 — `validatePagination` unifié + clamp offset (A3 + F6)
- [ ] RED : `__tests__/unit/utils/pagination.test.ts` — defaults, `defaultLimit`, `maxLimit`,
      clamp `maxOffset` (défaut 100 000), entrées non numériques/négatives
- [ ] GREEN : `utils/pagination.ts` — signature
      `validatePagination(offset?, limit?, { defaultLimit, maxLimit, maxOffset }?)`,
      export `MAX_PAGINATION_OFFSET = 100_000`
- [ ] Migrer le call site existant `conversations/messages.ts:415`
      (`validatePagination(o, l, 50)` → `{ maxLimit: 50 }`)
- [ ] Supprimer les 9 copies et migrer leurs call sites vers l'util partagé :
      `routes/admin/types.ts` (consommé par admin/content, users, reports, posts, invitations,
      anonymous-users), `routes/communities/types.ts` (search, members, core),
      `routes/communities.ts`, `routes/users/{devices,profile,preferences}.ts`,
      `routes/{conversation-preferences,community-preferences,friends}.ts`, `routes/affiliate.ts`
- [ ] Vert : jest ciblé + `tsc --noEmit` gateway

### Phase 2 — Détail conversation : cap participants + memberCount (A1)
- [ ] RED : `__tests__/unit/routes/conversation-detail-participants.test.ts` — le `include`
      exporté du détail filtre `isActive`, ordonne `joinedAt asc`, cappe à 100, et le `_count`
      filtré `isActive` est présent (pattern du test T17 existant)
- [ ] GREEN : `routes/conversations/core.ts` — export `conversationDetailInclude` (constante
      utilisée par la route), `take: CONVERSATION_DETAIL_PARTICIPANTS_CAP (100)`,
      `where: { isActive: true }`, `orderBy: { joinedAt: 'asc' }`,
      `_count: { select: { participants: { where: { isActive: true } } } }`
- [ ] Réponse : `memberCount: conversation._count.participants` (champ déjà déclaré dans
      `conversationSchema` → passe fast-json-stringify)

### Phase 3 — Suppression du travail mort stats (A2)
- [ ] Retirer `conversationStatsService.getOrCompute(...)` + le bloc `meta.conversationStats`
      du handler `GET /conversations/:id` (strippé du wire par le serializer ; clients servis par
      l'event Socket.IO `conversation:stats`)
- [ ] Vérifier qu'aucun import/var ne devient orphelin

### Phase 4 — Vérification & livraison
- [ ] `npx tsc --noEmit` gateway sans erreur
- [ ] Suite jest unitaire gateway verte (ciblée + globale unit)
- [ ] Commit + push `claude/inspiring-euler-ubvxlg`, PR vers `main`, CI verte, merge

## Hors périmètre (consigné dans l'analyse)
- F2 : flip `SOCKET_LANG_FILTER` (validation staging — activer la mesure `[lang-filter]` d'abord)
- F3-F5 : lot web (selectors Zustand, pollings admin → socket, lazy recharts/mermaid)
- F7 : dénormalisation `conversationId` sur Notification
- F8 : trim des champs participant du détail (équivalent T17)

## Continuité
Iter 34+ : lot web F3-F5 (commencer par F5, le moins risqué), puis F7/F8 gateway,
F2 quand la mesure staging est disponible.

## Statut (mis à jour en fin d'itération)
- [ ] Phase 1 — pagination unifiée + clamp offset
- [ ] Phase 2 — cap participants détail + memberCount
- [ ] Phase 3 — suppression stats mortes
- [ ] Phase 4 — CI verte, mergé dans main
