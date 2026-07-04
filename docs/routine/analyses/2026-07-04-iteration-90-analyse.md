# Itération 90 — Analyse : SSOT de la politique de visibilité des posts (G5)

## Current state
La politique « qui peut voir quel post » (PUBLIC / COMMUNITY / FRIENDS / EXCEPT / ONLY /
PRIVATE + auteur) existe en **trois implémentations manuellement recopiées** :

1. `PostFeedService.buildVisibilityFilter(viewerId, friendIds, communityCoMemberIds)`
   (`services/PostFeedService.ts:820`) — fragment Prisma `where` (feed, stories, statuses,
   reels, user posts).
2. `PostService.buildVisibilityFilter(viewerUserId?)` (`services/PostService.ts:522`) —
   même fragment `where` pour les fetches de post unitaire ; le commentaire admet
   explicitement « Mirrors PostFeedService.buildVisibilityFilter ».
3. `canUserViewPost(prisma, post, userId)` (`services/posts/postVisibility.ts:27`) —
   booléen ACL post-fetch (handlers socket réaction/commentaire).

Les OR des deux fragments `where` (1) et (2) sont **byte-identiques** (6 clauses).

## Problems identified
- Duplication d'une règle **sécurité/privacy** sans source unique.
- Dérive silencieuse : modifier une copie (nouveau type de visibilité, changement de
  sémantique EXCEPT) sans les autres → fuite de posts privés ou sur-restriction.
- Aucun test ne garantit que le filtre requête et le booléen ACL s'accordent.

## Root causes
Extraction historique incomplète : `postVisibility.ts` a été créé comme SSOT pour le seul
chemin booléen (handlers) ; les deux chemins `where` sont restés inline dans leurs services.

## Business impact
La visibilité gouverne la confidentialité du contenu social (surface la plus consultée).
Une divergence = fuite de vie privée — incident de confiance utilisateur majeur.

## Technical impact
Trois points de maintenance pour une règle ; risque de régression à chaque évolution du
modèle de visibilité.

## Risk assessment
Refactor à comportement constant (les OR sont identiques) → risque d'exécution faible.
Le verrou par table de vérité neutralise le risque futur de dérive.

## Proposed improvements
1. Politique canonique dans le module SSOT `postVisibility.ts` :
   `buildPostVisibilityWhere(ctx)` + `buildAnonymousVisibilityWhere()`.
2. Les deux services délèguent (aucune clause inline restante).
3. Test de table de vérité (4 relations × 6 visibilités × 2 états de liste = 48 cas)
   prouvant `where` ⇄ `canUserViewPost` cohérents.

## Expected benefits
Une seule définition de la politique ; toute dérive future casse la CI ; base propre pour
un futur type de visibilité.

## Implementation complexity
Faible : extraction pure + délégation + suite de tests. Aucun changement de schéma, aucune
dépendance client, rétro-compatible.

## Validation criteria
- `postVisibility.test.ts` vert (48 cas croisés + formes des clauses).
- Suites existantes PostService.visibility / PostFeedService.visibility inchangées et vertes.
- Non-régression complète Post* + `tsc --noEmit` exit 0.

## Résultat
✅ Livré it.41 (voir `tasks/story-sota-state.md`) : 64/64 postVisibility, 815/815 sur
33 suites Post*, tsc vert. Reliquat noté : fetchers d'IDs amis dupliqués (cache vs non-cache).
