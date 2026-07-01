# Iteration 52 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique du nom d'affichage (déjà displayName-first) — F26b-a » : converger les 4 copies
locales de `getUserDisplayName` dont l'ordre est **déjà identique** au canonique
(`utils/user-display-name.ts`) vers celui-ci par **délégation**, en préservant le fallback local.
Dédup pur, zéro changement de comportement visible.

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Baseline : `use-contacts-filtering.test.ts` vert.

## Étapes (délégation → vérification)

### Phase A — Converger G1–G4 par délégation
- [ ] `components/v2/FriendRequestCard.tsx` : importer `getUserDisplayName as resolveDisplayName` ;
      corps du local → `return resolveDisplayName(user, '?');`.
- [ ] `hooks/use-contacts-filtering.ts` : importer le canonique ; corps du `useCallback` →
      `return resolveDisplayName(user, user.username);`.
- [ ] `app/u/[id]/page.tsx` : importer le canonique ; corps du local →
      `return resolveDisplayName(userData, userData.username || 'User');`.
- [ ] `app/search/SearchPageContent.tsx` : importer le canonique ; corps du local →
      `return resolveDisplayName(user, user.username);`.

### Phase B — Vérification & livraison
- [ ] `jest __tests__/hooks/use-contacts-filtering.test.ts` → vert (attend `'John Doe'`).
- [ ] `tsc --noEmit` web : aucune nouvelle erreur sur les fichiers touchés.
- [ ] Commit + push `claude/sharp-wozniak-kekt10` ; PR vers `main` ; CI verte ; **merge squash**.

## Hors périmètre (consigné dans l'analyse)
- F26b-b (G5 `utils/user.ts` name-first → décision produit + test), F26b-c (G6/G7 username-first →
  correctif comportemental), F26c-c, F25b, F2, F10, F21.

## Continuité
Iter 53 : **F26b-c** (G6/G7 username-first → canonique, correctif affichant le vrai nom au lieu du
`username` dans les titres auto de conversation et la sélection de membres) ; puis **F26b-b** (G5
`utils/user.ts`, flip d'ordre + réécriture test) ; sinon F26c-c ou nouveau scout.

## Incidents de merge (parallélisme multi-agents)
- Si un commit parallèle réintroduit une copie locale de résolution de nom, restaurer la délégation
  au canonique `utils/user-display-name`.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — G1–G4 convergés par délégation au canonique `utils/user-display-name`
      (`FriendRequestCard` fallback `'?'`, `use-contacts-filtering` fallback `username`,
      `app/u/[id]/page` fallback `username`→`'User'`, `SearchPageContent` fallback `username`).
      Aucune logique d'ordre/trim locale résiduelle.
- [x] Phase B — jest `use-contacts-filtering.test.ts` **6/6** (`'John Doe'` préservé) ;
      `tsc --noEmit` web : **aucune** erreur sur les 4 fichiers touchés ; commit + push + PR + CI +
      merge.
