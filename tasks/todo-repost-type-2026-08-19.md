# Reposter crée toujours un POST — décision et correction

**Date** : 2026-08-19
**Statut** : LIVRÉ 2026-08-19 — `a40bb9e04` (gateway) et `99a8604ec` (iOS + web + SDK)
**Rapporté par** : le porteur du produit — « les story public républiés étaient vues
dans le Feed de poste ET de story, ce qui est bizarre »

## Le défaut

`PostService.repostPost`, ~ligne 2160 :

```ts
const targetType = opts.targetType ?? original.type;
```

Un repost **hérite du type de l'original**. Or presque tous les sites d'appel passent
`nil` — `FeedViewModel.swift:865` le commente même comme un choix (« nil = server
defaults to original post type ») :

| Chemin d'appel | `targetType` | Type créé | Où il atterrit |
|---|---|---|---|
| `StoryViewerView.swift:879`, `:1280` | `.post` | POST | feed ✓ |
| `FeedViewModel.swift:865` | `nil` | **STORY** | tray seulement |
| `ProfileUserPostsList.swift:969` | `nil` | **STORY** | tray seulement |
| `PostDetailView.swift:296` | `nil` | **STORY** | tray seulement |
| `ReelsViewModel.swift:430` | `nil` | hérité | selon l'original |
| `RootViewComponents.swift:323`, `FeedView.swift:444` | `nil` | hérité | selon l'original |

Les deux filtres serveur sont disjoints — `getFeed` prend `[POST, REEL]`
(`PostFeedService.ts:133`), `getStories` prend `STORY` (`:271`) — donc un post ne peut
pas être dans les deux **au fetch**. Le « vu dans les deux » venait donc d'ailleurs :
la **diffusion socket**. **CONFIRMÉ**, et plus large que la piste initiale.

`broadcastPostReposted` (`SocialEventsHandler.ts:277`) émet `post:reposted` sans
regarder le type — alors que la CRÉATION aiguille, elle, par type
(`routes/posts/core.ts:236` : `story:created` / `status:created` / `post:created`).
Et **trois** surfaces clientes insèrent ce qu'on leur pousse sans appliquer le
filtre que leur propre lecture REST applique :

| Surface | Lecture REST | Handler socket |
|---|---|---|
| Fil iOS | `getFeed` → `[POST, REEL]` | `FeedViewModel:1189` insérait tout |
| Fil web | idem | `use-post-socket-cache-sync.ts:137` insérait tout |
| Grille profil iOS | `getUserPosts` → `[POST, REEL]` | `applyRepost:1198` insérait tout |

La correction serveur tarit la source ; les trois gardes clientes ferment la
classe de défaut. Règle unique dans le SDK (`APIPost.belongsToStoryTray`),
miroir web (`feedServesType`), formulée par EXCLUSION — `type` est un `String?`,
une liste blanche ferait disparaître en silence une valeur hors nomenclature
(une suite iOS en envoie justement une, `"REPOST"`).

## La règle retenue

**Reposter crée toujours un POST**, qui PORTE l'original dans `repostOf`, quel que
soit le type de celui-ci. C'est le modèle des réseaux à fil : partager une story la
fait entrer dans le fil, elle ne crée pas une story chez le repartageur.

**Republier sa propre story reste le chemin dédié** `POST /posts/:postId/republish` —
auteur uniquement, type STORY, échéance fraîche. Il n'est pas touché.

## Correction

1. `PostService.repostPost` : `const targetType = opts.targetType ?? PostType.POST`.
   Écrire d'abord le test rouge : reposter une STORY sans `targetType` produit un POST.
   FAIT — test rouge d'abord (`type: "STORY"`, `expiresAt` posé), puis la ligne.
2. **`computeExpiresAt(targetType)`** : vérifié, pas supposé. Un POST n'est pas
   éphémère, donc `ephemeralExpiresAt` rend `undefined` et le repost ne reçoit plus
   d'échéance. Verrouillé par un second test qui lit `created.data.expiresAt`.
3. **Piste socket** : confirmée et corrigée aux trois surfaces (voir tableau
   ci-dessus). Elle n'était PAS réglée mécaniquement par le point 1 — le canal
   n'est pas choisi d'après le type, et `RepostSchema` accepte encore
   `targetType: 'STORY'`.
4. `StoryViewerView.swift:879` et `:1280` : `.post` **LAISSÉ** en place. Un site
   d'appel qui affirme son intention vaut mieux qu'un site qui dépend d'un défaut.
   `targetType` reste au protocole — `republish` et un futur « reposter en story »
   en dépendent.
5. FAIT — et un second commentaire trouvé au passage : le rail du viewer
   (`StoryViewerView+Sidebar.swift`) annonçait encore un `targetType .story` que le
   bouton ne fait plus depuis qu'il ouvre le composeur.

## Ce qu'on ne fait PAS

**Aucune migration des reposts STORY déjà en base.** Ils portent une échéance et
disparaîtront d'eux-mêmes des trays ; les réécrire en POST leur donnerait une vie
permanente que leur auteur n'a pas demandée, et les ferait surgir dans des fils des
semaines après coup.

## Vérification

- gateway : 780 suites / 18 458 tests. Deux suites ont flaké sous la contention
  d'un build iOS concurrent (`route-auth-coverage`, `UploadProcessor` — timeout) ;
  relancées isolément, 82/82 vertes. Aucune ne touche ce diff.
- web : `use-post-socket-cache-sync.test.tsx` 111/111, dont le rouge d'abord
  (une STORY entrait bien dans le fil).
- iOS : les 4 bundles du gate (`meeshy.sh test`), EXIT=0. Les 4 tests neufs
  vérifiés PRÉSENTS et `Passed` dans les xcresult, pas déduits du total.
- Le test iOS a été vu ROUGE avec la garde retirée (2 posts au lieu de 1), puis
  la garde restaurée et la classe revérifiée verte — la garde mord réellement.
