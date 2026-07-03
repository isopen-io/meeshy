# Iteration 89 — Plan d'implémentation (2026-07-03)

## Objectives
Câbler côté web les deux événements realtime de cycle de vie des stories que le gateway diffuse déjà
au feed room mais que le web ignore (W4) :
- `story:translation-updated` — appliquer la traduction NLLB d'un `textObject` en direct dans le
  cache feed (parité Prisme iOS ↔ web).
- `story:deleted` — retirer la story supprimée du cache feed en direct.

## Affected modules
- `apps/web/hooks/social/use-social-socket.ts` — option `onStoryDeleted` + listener
  `STORY_DELETED` (production). `onStoryTranslationUpdated` est déjà exposé/enregistré.
- `apps/web/hooks/social/use-stories-realtime.ts` — 2 handlers `useCallback` + helper pur
  `mergeStoryTextObjectTranslations` (production).
- `apps/web/__tests__/hooks/social/use-stories-realtime.test.tsx` — tests neufs.

## Implementation phases
1. **RED** — tests dans `use-stories-realtime.test.tsx` :
   - `onStoryTranslationUpdated` merge `translations` dans `storyEffects.textObjects[index]` de la
     story `postId` (préserve les autres langues déjà présentes, ne touche pas les autres stories).
   - no-op si `postId` inconnu / `storyEffects` absent / index hors borne.
   - `onStoryDeleted` retire la story `storyId` du feed ; no-op si absente / cache vide.
   Vérifier : échecs sans les handlers prod (RED prouvé).
2. **GREEN** — handlers + helper immuables (retour de la même référence si rien à muter) ;
   option + listener `STORY_DELETED` dans `use-social-socket`.
3. **REFACTOR** — helper pur exporté pour testabilité directe ; narrowing défensif de `unknown`.

## Dependencies
Aucune. Types déjà présents : `StoryTranslationUpdatedEventData`
(`@meeshy/shared/types/socketio-events`), `StoryDeletedEventData` (`@meeshy/shared/types/post`),
`SERVER_EVENTS.STORY_DELETED`. Chaîne viewer live déjà en place (`useStoriesFeedQuery` →
`postToStoryData` → `resolvePrismeText`).

## Estimated risks
TRÈS FAIBLE. Mutations de cache immuables gardées par change-detection ; aucune requête réseau ;
signature publique de `useStoriesRealtime` inchangée.

## Rollback strategy
Revert du commit (3 fichiers). Aucune migration, aucun état persistant, aucun changement de schéma.

## Validation criteria
- [x] `use-stories-realtime.test.tsx` : 17/17 verts (9 tests neufs inclus : 4 translation, 3 delete
      + les 2 no-op couverts).
- [x] RED prouvé : sans les handlers prod (stash), 4 tests échouent (merge translation + 3 delete
      « No listener for story:deleted »).
- [x] `use-social-socket.test.tsx` : 9/9 verts (non-régression).
- [x] Suites `hooks/social` + `lib/story` : 192/192 verts (10 suites, 0 régression).
- [x] `tsc --noEmit` web : baseline identique 1198→1198 (0 nouvelle erreur ; 0 erreur dans mes
      2 fichiers). Les 1198 sont pré-existantes (client Prisma non généré dans le sandbox).
- [~] ESLint : outillage cassé dans le sandbox (résolution flat-config ESLint 10 circulaire,
      indépendant du diff) ; code aligné 1:1 sur le style des handlers voisins.

## Completion status
✅ **COMPLÉTÉ** — implémenté, testé (RED→GREEN), tsc sans régression, prêt à merger.

## Progress tracking
- [x] Analyse rédigée (`…-iteration-89-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] RED → GREEN → validation.
- [ ] Commit + push.

## Future improvements
- **W5 (P3)** : préchargement du média du slide suivant dans `StoryViewer.tsx`.
- **W3 (P2)** : composer web — visibilités COMMUNITY/EXCEPT/ONLY.
