# Itération 90 — Plan : SSOT visibilité posts (G5)

## Objectives
Éliminer la triple copie de la politique de visibilité en une source unique testée,
sans changement de comportement.

## Affected modules
- `services/gateway/src/services/posts/postVisibility.ts` (ajout politique canonique)
- `services/gateway/src/services/PostFeedService.ts` (délégation)
- `services/gateway/src/services/PostService.ts` (délégation)
- `services/gateway/src/__tests__/unit/services/postVisibility.test.ts` (nouveau, verrou)

## Implementation phases
1. **RED** — test important `buildPostVisibilityWhere`/`buildAnonymousVisibilityWhere`
   inexistants + table de vérité croisée avec `canUserViewPost`.
2. **GREEN** — `buildPostVisibilityWhere(ctx)` + `buildAnonymousVisibilityWhere()` dans le
   module SSOT.
3. **REFACTOR** — les deux services délèguent ; retrait des OR inline.
4. **Vérif** — suites visibilité + handlers + non-régression Post* + tsc.

## Dependencies
Aucune (gateway pur, pas de schéma, pas de client).

## Estimated risks
Très faibles (OR identiques). Piège : `PostVisibility` reste utilisé comme type dans
PostService (params) → import conservé.

## Rollback strategy
Revert du commit ; les services ré-embarquent leurs OR inline. Aucun état persistant touché.

## Validation criteria
Voir analyse it.90. 48 cas croisés verts + non-régression complète + tsc exit 0.

## Completion status
✅ COMPLET (it.41 du workstream story-sota). Poussé sur `claude/brave-archimedes-106vsp`.

## Progress tracking
- [x] RED / GREEN / REFACTOR
- [x] Non-régression 815/815 Post*
- [x] tsc --noEmit vert
- [x] État + analyse + plan committés

## Future improvements
- Unifier `getFriendIds` (caché) et `getFriendIdsForViewer` (non caché) — décision cache
  sur le fetch unitaire.
- Faire consommer `buildPostVisibilityWhere` par le chemin anonyme de `getUserPosts`
  (aujourd'hui `where.visibility = PUBLIC` inline — cohérent mais hors module).
