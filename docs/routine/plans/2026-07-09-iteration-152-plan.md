# Iteration 152 — Plan d'implémentation (2026-07-09)

## Objectives
Corriger F118 : aligner `formatPresenceLabel` sur la règle de présence canonique
(`getUserPresenceStatus`) déjà utilisée par `presenceColorClass`, pour que le
libellé de présence ne contredise plus sa couleur quand `isOnline === true` avec
un heartbeat périmé.

## Affected modules
- `apps/web/utils/presence-format.ts` (production, 1 branche)
- `apps/web/utils/__tests__/presence-format.test.ts` (2 tests)

## Implementation phases
1. **RED** — Ajouter deux tests à `presence-format.test.ts` :
   - `isOnline=true`, `lastActiveAt = NOW-10min` → attendu `status.online`
     (échoue avant fix : renvoie `status.lastSeenMinutes`).
   - `isOnline=true`, `lastActiveAt = NOW-45min` → attendu `status.lastSeenMinutes`
     (décroissance conservée ; passe déjà).
2. **GREEN** — Remplacer `if (minutesAgo < 1) return o.t('status.online')` par un
   garde délégué à `getUserPresenceStatus({ isOnline, lastActiveAt }, nowMs) === 'online'`,
   placé avant l'échelle relative. `getUserPresenceStatus` est déjà importé.
3. **REFACTOR** — Aucun (déplacement du calcul `minutesAgo` après le garde online,
   inutile pour la branche online).

## Dependencies
Aucune. `getUserPresenceStatus` déjà importé depuis `@meeshy/shared/utils/user-presence`.

## Estimated risks
Très faibles. Cas non-online inchangés (`getUserPresenceStatus` ne renvoie
`'online'` que pour `isOnline===true` en fenêtre away ou activité < 60 s). Léger
décalage de frontière à exactement 60 000 ms (`< 1 min` → `<= 60 s`), négligeable
et plus cohérent avec la couleur.

## Rollback strategy
Revert du commit unique — changement isolé à un seul fichier de production + son
test. Aucune migration, aucun état persistant.

## Validation criteria
- `presence-format.test.ts` : 14/14 verts (12 existants + 2 nouveaux).
- Aucune régression sur `presenceColorClass` (5 tests) ni sur les branches
  minutes/heures/hier/avant-hier/date de `formatPresenceLabel`.
- `tsc` : aucun nouvel erreur référençant `presence-format.ts` ou `u/[id]/page.tsx`.

## Completion status
✅ Implémenté et validé (14/14). Commit sur `claude/brave-archimedes-itvak7`.

## Progress tracking
- [x] Fan-out Explore (gateway + web/shared)
- [x] Cible retenue F118
- [x] RED (2 tests)
- [x] GREEN (1 branche production)
- [x] Suite verte 14/14
- [x] Typecheck : aucun nouvel erreur sur fichiers touchés
- [x] Analyse + plan documentés
- [ ] Commit + push

## Future improvements
- **F119 (réservé, gateway)** : `onMessageDeleted` reçoit `sender?.userId ?? ''`
  au lieu de `?? senderId` → bucket stats anonyme jamais décrémenté. Fix au site
  d'appel (route) ; nécessite test d'intégration route ou refactor du contrat.
- Option B (cycle antérieur, réservé) : mapper le garde « max 1 réaction » de
  `PostReactionService` vers un `409 CONFLICT` au lieu d'un `500` sur changement
  d'emoji post/story.
