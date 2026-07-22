# Plan — Iteration 197 : recâbler la dernière copie active + supprimer la copie morte du libellé « dernière connexion »

## Objectifs
Fermer la classe « libellé de présence divergent » sur ses deux derniers sites :
recâbler `contacts/page.tsx` sur le SSOT `formatPresenceLabel` (via un nouveau
wrapper tolérant `formatLastSeenLabel`) et supprimer la copie morte jumelle
`lib/contacts-utils.ts`. Continuation explicite de l'itération 196.

## Affected modules
- `apps/web/utils/presence-format.ts` (production — ajout `formatLastSeenLabel`)
- `apps/web/app/(connected)/contacts/page.tsx` (production — recâblage)
- `apps/web/lib/contacts-utils.ts` (**supprimé** — code mort)
- `apps/web/__tests__/utils/presence-format.test.ts` (test nouveau)

## SSOT cibles (source de vérité, réutilisés)
- `apps/web/utils/presence-format.ts` → `formatPresenceLabel`
- `@meeshy/shared/utils/user-presence` → `getUserPresenceStatus` (règle 1/3/5)
- `@meeshy/shared/utils/calendar-date` → `calendarDayDiff`

## Implementation phases
1. **`formatLastSeenLabel`** dans `presence-format.ts` : nullable/illisible
   tolérant, délègue à `formatPresenceLabel` pour le cas valide.
2. **`contacts/page.tsx`** : `import { formatLastSeenLabel }` ; supprimer
   `formatLastSeen` local + type `TFn` inutilisé ; call-site l.230 →
   `formatLastSeenLabel({ isOnline, lastActiveAt, t, locale })`.
3. **`lib/contacts-utils.ts`** : `git rm` (zéro importeur).
4. **Tests** : `presence-format.test.ts` — 11 cas (gardes + règle canonique +
   paliers calendaires), `now` injecté (déterministe, aucune horloge réelle).

## Dependencies
Aucune. Clés i18n `contacts.status.*` déjà présentes dans les 4 locales.

## Estimated risks
Faible. SSOT purs et testés ; migration de clés transparente ; suppression sans
importeur. Seul écart de comportement = corrections voulues (isOnline périmé,
sous-minute, heure exacte, jour calendaire).

## Rollback strategy
Révert du commit unique — helpers indépendants, aucun schéma / API / migration /
clé i18n ajoutée.

## Validation criteria
- `presence-format.test.ts` vert (11/11).
- `users.service.test.ts` + `ContactLastSeenLabel.test` + `UserPresenceLabel.test`
  + `use-contacts-filtering.test` verts (63/63).
- Aucune erreur `tsc` sur les fichiers modifiés.

## Completion status
- [x] Phase 1 `formatLastSeenLabel` (presence-format.ts)
- [x] Phase 2 recâblage `contacts/page.tsx` (helper local + TFn supprimés)
- [x] Phase 3 suppression `lib/contacts-utils.ts`
- [x] Phase 4 tests (11/11 verts)
- [x] Validation : suites présence/contacts 63/63 vertes ; fichiers modifiés
      sans erreur tsc (bruit `TS7031` pré-existant hors périmètre)
- [ ] Merge + delete branch (en cours)

## Future improvements
- `apps/web/components/contacts/ContactsList.tsx` (+ barrel `components/contacts/
  index.ts`) : composant mort (jamais monté, jamais importé hors barrel) portant
  une prop `formatLastSeen` — candidat à suppression dans un cycle dédié de
  chasse au code mort (hors scope ici pour rester minimal).
- `apps/web/components/admin/user-detail/UserMediaSection.tsx:formatSize` :
  réimplémente le formatage de taille de fichier, plafonné à **MB** (un fichier
  ≥ 1 Go rend « 2048.0 MB » au lieu de « 2 GB ») ; SSOT existant
  `packages/shared/types/attachment.ts:formatFileSize`. Cible convergence
  indépendante (domaine différent) — itération suivante.
- `apps/web/utils/date-format.ts:formatRelativeDate` : buckets minute/heure
  encore hand-rolled (délégables à `classifyRelativeTime`) — sans bug observé,
  polissage DRY optionnel.
