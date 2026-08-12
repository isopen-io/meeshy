# Iteration 161 — Plan d'implémentation (2026-07-10)

## Objectives
Corriger F121 : le handler socket `notification:read` doit maintenir le champ load-bearing
`pages[0].unreadCount` (le seul que le badge affiche) et être idempotent face au self-echo /
redelivery, en réutilisant le contrat garde-`wasUnread` des mutations sœurs.

## Affected modules
- `apps/web/hooks/queries/use-notifications-manager-rq.tsx` (prod, `handleNotificationRead`).
- `apps/web/__tests__/hooks/queries/use-notifications-manager-rq.test.tsx` (nouveau, 3 tests).

## Implementation phases
1. **RED** — nouveau fichier de test du manager socket-driven : seed page `unreadCount:2`
   (2 non-lues, 1 lue) ; assert que `onNotificationRead('notif-1')` fait passer
   `unreadCount` 2 → 1 ; idempotence sur re-fire ; no-op sur notif déjà lue. → 2 échecs.
2. **GREEN** — dans `handleNotificationRead` : calculer `foundUnread` par page + `wasUnread`
   global, décrémenter `page.unreadCount` sous garde `foundUnread`, guarder le décrément de
   la query `unreadCount()` sur `wasUnread`. → 3/3 verts.
3. **REFACTOR** — aucun (motif déjà minimal, aligné sur `useDeleteNotificationMutation`).

## Dependencies
Aucune. Isolé au cache React Query côté web ; aucun changement gateway/shared/types.

## Estimated risks
Très faibles. Comportement identique pour notifs déjà lues (garde `false`). Le seul
changement de comportement observable est la correction du badge sur le chemin socket +
l'idempotence de la query autonome (strictement meilleure).

## Rollback strategy
Revert du commit unique. Aucune migration, aucun état persisté impacté.

## Validation criteria
- [x] RED : 2 tests échouent avant le fix (badge reste 2).
- [x] GREEN : 3/3 verts après le fix.
- [x] Suite sœur `use-notifications-query.test.tsx` : 19/19 verts (inchangée).
- [x] `tsc --noEmit` : fichiers touchés sans erreur (erreurs préexistantes hors périmètre
      dans `__tests__/admin/...`, non introduites par ce cycle).

## Completion status
**COMPLETE** — implémenté, testé (RED→GREEN), documenté. Prêt à pousser sur
`claude/brave-archimedes-2zhlza`.

## Progress tracking
- Analyse : `docs/routine/analyses/2026-07-10-iteration-161-analyse.md`.
- Commit unique regroupant prod + test + docs routine.

## Future improvements
- **F122 (backlog)** : `useMessageStatusDetails` key collision — inclure `filter` dans
  `queryKeys.messages.statusDetails(messageId, filter)` (latent aujourd'hui, à activer si un
  appelant passe un `filter` non-défaut).
