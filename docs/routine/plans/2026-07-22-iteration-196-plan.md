# Plan — Iteration 196 : recâbler `users.service.ts` sur les SSOT display-name / initials / presence-format

## Objectifs
Supprimer trois réimplémentations locales divergentes dans
`apps/web/services/users.service.ts` en déléguant aux SSOT existants, corrigeant
trois défauts utilisateur (nom vide, initiales emoji cassées, libellé présence
désaccordé de la pastille).

## Affected modules
- `apps/web/services/users.service.ts` (production, 1 fichier)
- `apps/web/__tests__/services/users.service.test.ts` (tests mis à jour + ajoutés)

## SSOT cibles (aucune modification)
- `apps/web/utils/user-display-name.ts` → `getUserDisplayName`
- `apps/web/utils/initials.ts` → `getInitials`
- `apps/web/utils/presence-format.ts` → `formatPresenceLabel`

## Implementation phases
1. **Imports** : ajouter `getUserDisplayName`, `getInitials`, `formatPresenceLabel`.
2. **getDisplayName** → `return getUserDisplayName(user, user.username)`.
3. **getDefaultAvatar** → `const initials = getInitials(getUserDisplayName(user, user.username))`
   (retirer `.split/.map/.charAt/.slice`), conserver la logique de couleur.
4. **getLastSeenFormatted** → `formatPresenceLabel({ lastActiveAt, isOnline: user.isOnline, t, locale })`.
5. **formatLastSeenLabel** → `formatPresenceLabel({ lastActiveAt, t, locale })`
   (isOnline indéfini = règle canonique 60 s).
6. **Tests** : mettre à jour les assertions encodant l'ancien comportement
   (clés `status.minutesAgo`→`lastSeenMinutes`, `'JP'`→`'JJ'`) et ajouter les cas
   défaillants (displayName blanc, nom emoji `🎨`, isOnline périmé, cross-minuit).

## Dependencies
Aucune nouvelle dépendance. Clés i18n canoniques déjà présentes dans les 4
locales (`contacts.status.lastSeen*`).

## Estimated risks
Faible. Refactor de délégation, signatures publiques inchangées. Seul risque :
tests figeant l'ancien comportement → mis à jour en connaissance de cause vers la
vérité SSOT.

## Rollback strategy
Révert du commit unique — helpers indépendants, aucun schéma / API / migration.

## Validation criteria
- `users.service.test.ts` vert.
- `use-profile-v2.test.tsx`, `ContactLastSeenLabel.test.tsx` verts.
- `tsc` web sans nouvelle erreur.

## Completion status
- [x] Phase 1 imports
- [x] Phase 2 getDisplayName → `getUserDisplayName`
- [x] Phase 3 getDefaultAvatar → `getInitials`
- [x] Phase 4 getLastSeenFormatted → `formatPresenceLabel`
- [x] Phase 5 formatLastSeenLabel → `formatPresenceLabel`
- [x] Phase 6 tests (users.service.test + ContactLastSeenLabel.test mis à jour, cas défaillants ajoutés)
- [x] Validation : 180/180 tests verts (6 suites usersService), `tsc` sans nouvelle erreur (3 erreurs pré-existantes hors périmètre : z-index-validator, push-token.service, connection.service)
- [ ] Merge + delete branch (en cours)

## Future improvements
- `apps/web/lib/contacts-utils.ts:formatLastSeen` est une 3ᵉ copie divergente
  **morte** (aucun importeur) — candidate à suppression dans un cycle dédié de
  chasse au code mort (hors scope ici pour rester focalisé).
- `app/(connected)/contacts/page.tsx:54` porte une 4ᵉ `formatLastSeen` locale
  active — à recâbler sur `formatPresenceLabel` dans un cycle suivant.
