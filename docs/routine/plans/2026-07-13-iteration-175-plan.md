# Plan — Iteration 175 : centraliser la résolution du nom auteur dans story/status transforms

## Objectifs
Supprimer la bulle « auteur sans nom » (displayName vide/blanc) et l'`<img src="">`
parasite (avatar `''`) dans les mappers web story/status, en déléguant à la
SOURCE UNIQUE `getUserDisplayName`.

## Modules affectés
- `apps/web/lib/story-transforms.ts` (3 sites : `postToStoryItem`,
  `groupToStoryItem`, `postToStoryData`)
- `apps/web/lib/status-transforms.ts` (1 site : `postToStatusItem`)
- Tests : `apps/web/__tests__/lib/story-transforms.test.ts`,
  `apps/web/__tests__/lib/status-transforms.test.ts`

## Phases
1. **RED** — ajouter les tests displayName vide/blanc → username, avatar `''` →
   undefined (dont le premier test de `groupToStoryItem`, non couvert). ✅
2. **GREEN** — helper local `toDisplayAuthor` dans `story-transforms.ts`
   (délègue à `getUserDisplayName` + `|| undefined` sur l'avatar), branché aux
   3 sites ; délégation inline équivalente dans `status-transforms.ts`. ✅
3. **VALIDATION** — suites ciblées + `__tests__/lib` complet + `tsc --noEmit`. ✅

## Dépendances
Aucune. `getUserDisplayName` (`apps/web/utils/user-display-name.ts`) existe déjà
et est la résolution canonique du nom affiché.

## Risques / Rollback
Risque très faible : forme de retour `{ name, avatar }` inchangée → aucun
consommateur impacté. Rollback = revert du commit unique.

## Validation criteria
- 49/49 sur les deux suites transform ; 34 suites / 834 tests verts sur
  `__tests__/lib` ; 0 erreur tsc sur les fichiers touchés.

## Completion status
**COMPLETE** — RED→GREEN→VALIDATION effectués, docs écrits, prêt à pousser.

## Future improvements
- Traiter `resolveParticipantAvatar` (`packages/shared/utils/participant-helpers.ts`)
  qui partage la faiblesse chaîne-vide sur l'avatar (backlog itération future).
