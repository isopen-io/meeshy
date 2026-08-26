# Plan — Itération 249 : canonicaliser les comparaisons de langue du scoring de réels

## Objectives

Router les deux signaux linguistiques du scoring d'affinité des réels
(`seedSameLanguage`, `viewerLanguage`) par la SSOT `normalizeLanguageForDedup`,
comme les surfaces déjà durcies (it. 243/246/247/248), afin qu'un réel dont
`Post.originalLanguage` est stocké sous forme taguée/3-lettres reçoive les poids
de langue qu'il mérite.

Suivi #2 nommé par l'itération 247 (repris par la PR #3352 de l'it. 248).

## Contexte anti-doublon

L'itération 248 (porte d'accès `allowedLanguages` de `anonymous.ts`) est
**déjà livrée par la PR #3352** (compte `jcnm`, ouverte plus tôt le 22/08). Ce
lot NE la redouble PAS : il traite le suivi SUIVANT, un fichier différent
(`reelAffinity.ts` / `PostFeedService.ts`), sans conflit avec #3352.

## Affected modules

- `services/gateway/src/services/posts/reelAffinity.ts` — 2 comparaisons + import
  + doc du champ `viewerLanguages`.
- `services/gateway/src/services/PostFeedService.ts` — `getViewerLanguages`
  construit un `Set` canonicalisé + import.
- `services/gateway/src/services/posts/__tests__/reelAffinity.test.ts` — 5
  témoins ajoutés (3 admission + 2 contre-épreuves).

## Implementation phases

1. **RED** — 5 témoins sur `seedSameLanguage` et `viewerLanguage` (candidat/seed
   région-tagués vs canonique ⇒ poids attribué ; langues distinctes taguées ⇒ 0).
   Vérifier que les 3 admissions tombent avant le fix. ✅
2. **GREEN** — canonicaliser les atomes candidat/seed dans la fonction pure ;
   canonicaliser le `Set` `viewerLanguages` à la source (`getViewerLanguages`). ✅
3. **Validation** — suites reelAffinity + PostFeedService vertes, `tsc` exit 0. ✅

## Dependencies

Aucune. `normalizeLanguageForDedup` importé dans les deux fichiers.

## Estimated risks

Très faible. Fonction idempotente sur codes canoniques ; élargit les
correspondances légitimes sans jamais franchir entre langues distinctes. Le
score est un tri d'affichage (curseur figé avant tri) ⇒ aucun réel sauté/dupliqué.

## Rollback strategy

Revert du diff. Aucun schéma, aucune migration, aucun contrat wire touché.

## Validation criteria

- `reelAffinity.test.ts` (les deux) : 47/47.
- `PostFeedService.test.ts` : 81/81.
- `tsc --noEmit` gateway : exit 0.

## Completion status

**COMPLETE.** Fix + témoins + docs livrés. Validation locale verte.

## Progress tracking

- [x] Sync `main`, audit anti-doublon (#3352 = it. 248, non redoublé).
- [x] Témoins RED posés et vérifiés rouges (3/5).
- [x] Fix appliqué (fonction pure + source du set), témoins verts.
- [x] tsc exit 0, suites voisines vertes.
- [x] Analyse + plan.
- [ ] Commit + push.

## Future improvements

Suivis restants : #3 `_findUsersForLanguage` (P1 prochaine itération), lot web,
backfill base — détaillés dans l'analyse jointe.
