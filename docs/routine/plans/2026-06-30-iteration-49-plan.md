# Iteration 49 — Plan d'implémentation (2026-06-30)

## Objectif
Lot « Source unique du nom d'affichage utilisateur (F26) » : faire déléguer les 2 réimplémentations
exportées au niveau `lib/` de `getUserDisplayName` (`avatar-utils.ts`, `contacts-utils.ts`) au
canonique testé `apps/web/utils/user-display-name.ts`. Byte-identique en usage réel, strictement
plus correct aux bords (trim displayName).

## Pré-requis runner (parité CI)
- [x] `packages/shared` `dist/` présent.
- [ ] Baseline : web jest `__tests__/utils/user-display-name.test.ts` vert.

## Étapes (délégation à une SSOT déjà testée — pas de nouveau RED)

### Phase A — `apps/web/lib/avatar-utils.ts`
- [ ] Remplacer le corps de `getUserDisplayName` (l.66-97) par une délégation :
      `import { getUserDisplayName as resolveDisplayName } from '@/utils/user-display-name';`
      puis `return resolveDisplayName(user);` (signature `User | null | undefined` inchangée,
      fallback par défaut `'Utilisateur inconnu'` identique).
- [ ] Vérifier que `getInitials`/autres exports d'avatar-utils ne dépendent pas du corps local
      supprimé (ils appellent la fonction, pas son implémentation interne).

### Phase B — `apps/web/lib/contacts-utils.ts`
- [ ] Remplacer le corps de `getUserDisplayName` (l.3-6) par une délégation au canonique
      (signature union inchangée).

### Phase C — Vérification & livraison
- [ ] `node_modules/.bin/jest __tests__/utils/user-display-name.test.ts` → vert.
- [ ] Suites web jest touchant avatar-utils / contacts-utils (importeurs) vertes.
- [ ] `tsc --noEmit` web : aucune nouvelle erreur sur les 2 fichiers touchés.
- [ ] Commit + push `claude/sharp-wozniak-kthrl5` ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
F26b (`getUserDisplayName` divergents : `user.ts` name-first, `MemberSelectionStep` username-first,
copies locales à fallback distinct), F26c (`getInitials`), F25b (téléphone), F24b, F2/F10/F21.

## Continuité
Iter 50+ : **F26b** (décision produit sur la priorité canonique, puis bascule des divergents +
copies locales) ; sinon **F26c** (`getInitials` canonique + tests par composant) ou nouveau scout
(slug/url, sanitize, date-relative). F25b dès qu'une façade est conçue. F2/F10/F21 dès qu'une
fenêtre staging/backfill existe.

## Incidents de merge (parallélisme multi-agents)
- À surveiller : un commit parallèle pourrait réintroduire un corps local dans `avatar-utils` /
  `contacts-utils`. En cas de conflit, restaurer les délégations au canonique.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — `avatar-utils.getUserDisplayName` délègue au canonique (corps local supprimé,
      import `resolveDisplayName`). 5 importeurs intacts.
- [x] Phase B — `contacts-utils.getUserDisplayName` délègue au canonique
      (`resolveDisplayName(user, user.username)` pour préserver le fallback username).
- [x] Phase C — web jest : `user-display-name` **33/33**, `avatar-utils` + 3 tests d'importeurs
      **112/113** (1 skip pré-existant) ; `tsc --noEmit` web : **aucune** erreur sur les fichiers
      touchés ; commit + push + PR + merge squash.
