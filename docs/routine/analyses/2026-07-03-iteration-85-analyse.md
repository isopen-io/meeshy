# Iteration 85 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `3b1fcaf` (working tree propre, branche `claude/brave-archimedes-4zvl3o` alignée sur
`origin/main`, aucun commit non-mergé). PR ouvertes au démarrage : #1376/#1373 (audio/vidéo calls),
#1374 (affiliate cap TOCTOU — F47), #1372 (realtime profile `USER_UPDATED`), #1370 (iOS a11y),
#1367 (guard `message:edited`) — toutes gérées par d'autres sessions.

**Rupture de thème assumée.** Les itérations 79→84 ont épuisé le filon « races lost-update /
compteurs atomiques » du gateway (réactions, curseurs, stats, affiliation). Les résidus restants de
ce thème (F49 `ConversationStatsService` cache in-process TTL-self-healed, F50 agrégats JSON
`recompute()`-corrected) sont de sévérité basse et à rendement décroissant. Cette itération vise
délibérément un **bug de correction NON concurrentiel** dans une feature sociale récemment
développée, indépendant de toutes les PR ouvertes, et **vérifiable purement en jest** (l'env Linux
n'a ni toolchain Swift ni MongoDB live).

## Cible iter 85 — Fuite de visibilité FRIENDS dans `PostFeedService`

### Current state
`services/gateway/src/services/PostFeedService.ts` sert toutes les surfaces sociales. Le filtrage de
visibilité canonique vit dans `buildVisibilityFilter(viewerId, contactIds, communityCoMemberIds)`
(l.762) — une clause `OR` qui encode les 6 règles produit : posts de l'auteur lui-même, `PUBLIC`,
`COMMUNITY` (gaté aux co-membres), `FRIENDS` (gaté `authorId ∈ contacts`), `EXCEPT`, `ONLY`.

- `getStories` (l.223), `getStatuses` (l.278), `getReels` (l.388) : passent **tous** par
  `buildVisibilityFilter`. Corrects.
- `getFeed` (feed principal classé, l.89-99) : utilisait un filtre **plat**
  `visibility: { in: ['PUBLIC', 'FRIENDS'] }` **sans aucune garde auteur/ami**. `friendIds` n'était
  récupéré qu'**après** la requête (l.141) et servait **uniquement au scoring** (`affinityScore`).
- `getUserPosts` (profil d'un utilisateur, l.587-589) : hard-codait `where.visibility = 'PUBLIC'`
  pour tout viewer ≠ auteur.

### Problems identified
1. **FUITE DE CONFIDENTIALITÉ (critique)** : le feed principal — la surface sociale la plus
   consultée — servait **n'importe quel post FRIENDS de n'importe quel utilisateur à n'importe quel
   viewer**, indépendamment du lien d'amitié. Le post « Amis seulement » d'un inconnu apparaissait
   dans le home feed de tout le monde.
2. **SOUS-DIFFUSION (miroir)** : sur un profil, un **ami** ne voyait **jamais** les posts FRIENDS de
   l'auteur (seulement PUBLIC). Les vraies personnes autorisées étaient privées du contenu.

### Root cause
La règle de visibilité FRIENDS n'a jamais été appliquée de manière homogène dans `PostFeedService` :
`getFeed`/`getUserPosts` ont précédé (ou raté) l'extraction de `buildVisibilityFilter` en SSOT que
les 3 méthodes sœurs utilisent. C'est le motif « fix/règle appliqué à un sous-ensemble de siblings,
pas audité sur tous » (lessons #40/#42/#45/#50/#55) — cette fois sur la **visibilité** au lieu d'un
compteur.

### Business impact
- Fuite : un post « Amis seulement » exposé à des inconnus dans le feed principal = brèche de
  confidentialité réelle (pas cosmétique). GDPR/confiance produit.
- Sous-diffusion : les amis ratent légitimement du contenu friends-only sur le profil = feature gap.

### Technical impact
- `getFeed` : récupération de `friendIds` + `dmContactIds` + `communityCoMemberIds` déplacée **avant**
  la requête candidats ; `visibility: { in }` plat remplacé par `AND: [buildVisibilityFilter(...),
  {OR: expiry}, ...(cursor)]`. `friendIds` (amis acceptés seulement) reste passé à `affinityScore`
  (scoring inchangé) ; les contacts (amis ∪ partenaires DM) élargissent la garde FRIENDS —
  exactement comme getStories/getStatuses/getReels.
- `getUserPosts` : `viewer anonyme → PUBLIC` (préservé) ; `viewer === auteur → aucun filtre` (tous
  ses posts, préservé) ; `viewer authentifié ≠ auteur → buildVisibilityFilter` (voit PUBLIC + ce que
  l'auteur a partagé avec lui : FRIENDS si contact, COMMUNITY si co-membre, ONLY/EXCEPT si ciblé).
- Aucune signature publique modifiée. SSOT respectée (`buildVisibilityFilter`).

### Subtilité assumée
`getUserPosts` pour un viewer authentifié non-ami devient **strictement plus correct** : en plus de
PUBLIC, il expose désormais les posts `ONLY` où l'auteur l'a **explicitement ciblé** (`visibilityUserIds
has viewer`) — jamais une fuite (ONLY exige un ciblage explicite). Les branches FRIENDS/COMMUNITY/
EXCEPT avec `authorId: { in: [] }` ne matchent rien pour un non-contact.

### Risk assessment
FAIBLE. Le fix resserre la fuite (moins de posts servis au feed) et élargit la sous-diffusion (plus
de posts autorisés au profil) — les deux dans le sens de la correction. Les helpers
`getDirectConversationContactIds`/`getCommunityCoMemberIds` dégradent en `[]` sur erreur (pas de
nouvelle surface de panne). Comportement observable identique pour PUBLIC et self-view. Couverture :
suite dédiée `PostFeedService.visibility` (2→7 tests) + 220 tests des suites posts-feed vertes,
0 régression.

## Validation
- `jest PostFeedService.visibility` → 7/7 ✓ (3 régressions neuves + 4 conservées)
- `jest PostService|PostFeedService|posts-feed|posts/feed|posts-engagement-feed|error-format|postIncludes`
  → 10 suites / 220 tests ✓
- `tsc --noEmit` → 0 erreur nouvelle dans `PostFeedService.ts`

## Validation criteria (rappel)
- [x] `getFeed` n'émet plus de `visibility: { in: [...] }` plat ; la clause FRIENDS est gatée
  `authorId ∈ contacts`.
- [x] `getUserPosts` laisse un ami voir les posts FRIENDS de l'auteur ; anonyme → PUBLIC ; self → tout.
- [x] Aucune régression sur les 3 méthodes sœurs ni sur les routes feed.
