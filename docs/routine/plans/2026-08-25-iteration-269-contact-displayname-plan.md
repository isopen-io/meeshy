# Itération 269 — Plan : aligner `contact-identifiers.normalizeDisplayName` sur sa jumelle exportée

## Objectifs

Fermer deux défauts indépendants de `normalizeDisplayName` (privée,
`services/gateway/src/utils/contact-identifiers.ts`) et supprimer la divergence
structurelle qui les a produits :

1. Troncature UTF-16 sûre (pas de substitut orphelin) — jumelle it. 268.
2. Jeu complet des séparateurs de ligne — jumelle it. 266b.
3. Extraire le jeu de séparateurs en source unique pour empêcher la re-divergence.

## Modules affectés

- `services/gateway/src/utils/normalize.ts` — extraction de
  `LINE_BREAKING_CHARS_SOURCE` ; `normalizeDisplayName` (exportée) dérive sa regex
  de la constante (comportement byte-identique).
- `services/gateway/src/utils/contact-identifiers.ts` — importe la constante,
  remplace le jeu complet par un espace, coupe sûre en UTF-16.
- `services/gateway/src/__tests__/unit/utils/contact-identifiers.test.ts` —
  3 témoins ajoutés.

## Phases d'implémentation

1. **RED** — ajouter les témoins (substitut à la frontière, coupe propre,
   séparateurs Unicode complets). Prouver le ROUGE. ✅
2. **Extraction** — `LINE_BREAKING_CHARS_SOURCE` dans `normalize.ts`, consommée
   par les deux normaliseurs. ✅
3. **GREEN** — corriger `contact-identifiers.normalizeDisplayName`. ✅
4. **Validation** — suites `contact-identifiers` + `normalize`, puis tout
   `utils`, `tsc`, grep anti-troisième-copie. ✅

## Dépendances

Aucune. `contact-identifiers.ts` importait déjà `./normalize.js`.

## Risques estimés

Très faibles (voir analyse § Évaluation du risque). Le seul site à comportement
inchangé garanti est la jumelle exportée : mesuré byte-identique et couvert.

## Stratégie de rollback

`git revert` du commit unique. Aucun schéma, aucune migration, aucun état
persistant. Un nom sans séparateur exotique et ≤ 200 unités est normalisé
exactement comme avant.

## Critères de validation

Voir analyse § Critères de validation — tous cochés.

## Statut d'achèvement

**TERMINÉ.** 40 suites / 1154 tests `utils` verts ; `tsc` 0 erreur ; témoins RED
prouvés puis verts.

## Améliorations futures

- Auditer les autres normaliseurs de texte servi à l'affichage (titres, aperçus)
  qui bornent une longueur par `.slice`/`.substring` : le même piège de substitut
  vit partout où une longueur UTF-16 borne du contenu utilisateur.
- Envisager, si un TROISIÈME normaliseur de nom apparaît, un helper partagé
  `singleLine(value, { replaceWith })` plutôt qu'un troisième dérivé de la source.
