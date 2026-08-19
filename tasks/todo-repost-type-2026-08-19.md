# Reposter crée toujours un POST — décision et correction

**Date** : 2026-08-19
**Statut** : décidé, à implémenter dès la fin du workflow `wcz2rprlg` (qui écrit dans
`PostService.ts` et `interactions.ts` — ne pas y toucher avant)
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
pas être dans les deux **au fetch**. Le « vu dans les deux » vient donc d'ailleurs :
piste principale, la **diffusion socket** d'un repost de type STORY sur le canal des
posts, qui le fait entrer dans le feed en direct jusqu'au prochain refresh. **À
confirmer** — non vérifié au moment d'écrire cette note.

## La règle retenue

**Reposter crée toujours un POST**, qui PORTE l'original dans `repostOf`, quel que
soit le type de celui-ci. C'est le modèle des réseaux à fil : partager une story la
fait entrer dans le fil, elle ne crée pas une story chez le repartageur.

**Republier sa propre story reste le chemin dédié** `POST /posts/:postId/republish` —
auteur uniquement, type STORY, échéance fraîche. Il n'est pas touché.

## Correction

1. `PostService.repostPost` : `const targetType = opts.targetType ?? PostType.POST`.
   Écrire d'abord le test rouge : reposter une STORY sans `targetType` produit un POST.
2. **Vérifier `computeExpiresAt(targetType)`** juste en dessous : un POST n'expire pas,
   donc un repost cesse de recevoir une échéance. C'est voulu — mais le vérifier
   plutôt que le supposer, et le verrouiller par un test.
3. **Confirmer la piste socket** : sur quel canal un repost est-il diffusé, et le
   client filtre-t-il par type avant d'insérer dans le feed ? Si le canal est choisi
   d'après le type, la correction du point 1 le règle mécaniquement.
4. `StoryViewerView.swift:879` et `:1280` passent `.post` explicitement : devient
   redondant. Le laisser est inoffensif ; le retirer est plus honnête. Ne pas retirer
   `targetType` du protocole pour autant — le chemin `republish` et un futur
   « reposter en story » en dépendent.
5. Corriger le commentaire de `FeedViewModel.swift:865`, qui documente le défaut comme
   une intention.

## Ce qu'on ne fait PAS

**Aucune migration des reposts STORY déjà en base.** Ils portent une échéance et
disparaîtront d'eux-mêmes des trays ; les réécrire en POST leur donnerait une vie
permanente que leur auteur n'a pas demandée, et les ferait surgir dans des fils des
semaines après coup.
