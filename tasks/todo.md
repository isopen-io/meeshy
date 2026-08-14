# Cycle 119 — Le retrait de réaction annonçait un ❤️ qu'il n'avait pas retiré

## Le défaut

`DELETE /posts/:postId/like` diffusait `emoji: '❤️'` **codé en dur** sur ses trois branches —
`story:unreacted`, `status:unreacted`, `post:unliked`. La route n'était pas en position de savoir
quel emoji partait : la ligne `PostReaction` n'est lisible qu'AVANT sa suppression, et le seul
endroit qui la lise est `PostService.unlikePost`, sous le nom `foundEmoji`, qui ne rendait que le
post.

Le défaut était **déjà écrit dans le code**. Le chantier des rétractations de notifications l'avait
rencontré et documenté sur place :

> « La route, elle, diffuse un '❤️' codé en dur, et un retrait câblé là-haut manquerait donc toute
> réaction d'un autre emoji. »

Il avait été contourné là où il gênait — jamais corrigé à sa source.

### Ce n'était pas latent

`StoryViewModel.applyStoryReactionDelta` (`apps/ios/.../StoryViewModel.swift:3057`) fait, sur
l'appareil de l'ACTEUR :

```swift
mine.removeAll { $0 == emoji }
```

Un 😂 retiré n'y retirait donc **rien**. La puce 😂 survivait à sa propre suppression, pendant que
`reactionCount` était bien décrémenté — « vous avez réagi 😂 » affiché sur un compteur à 0, jusqu'au
prochain fetch complet.

La fiche `rts-03` avait vu le mensonge et prescrit de le **contourner** côté client (« unreacted =
NO-OP — ne JAMAIS décrémenter sur ce payload »). Il est ici retiré à la source : le delta iOS
existant redevient correct **sans une ligne de Swift**.

### Deuxième défaut, même route

`unlikePost` est idempotent : sur un post que le lecteur n'a jamais aimé, il ne touche à rien. La
route diffusait quand même un `unreacted` — un événement qui décrit une transition qui n'a pas eu
lieu, et que les clients à delta appliquent en `-1`. Le rejeu `onDuplicate` du journal de mutation
tombait dans la même case, alors que le commentaire de la route affirmait l'inverse :

> « recording the mutation prevents the broadcast path from firing twice on replay »

L'affirmation était fausse. Elle est maintenant vraie.

### Troisième volet — le compteur absolu (rts-03, étapes 2-3)

Les quatre événements story/status ne portaient qu'`emoji` + `userId`, là où
`post:liked`/`post:unliked` portent `likeCount` + `reactionSummary` depuis toujours. Un consommateur
ne pouvait donc que compter en `±1` : ni idempotent sous double livraison, ni rattrapable après un
événement manqué. Le web l'avait acté **en renonçant** au temps réel sur ces compteurs —
`handleStoryReacted` : « no authoritative aggregation count — mutating the feed would drift ».

## Livré

- **`PostService.unlikePost`** rend une enveloppe `{ id, post, removedEmoji }`. `removedEmoji` est
  la réaction réellement retirée, `null` quand il n'y en avait aucune. L'enveloppe existe pour ce
  seul champ ; `id` y est repris du post parce que c'est l'identité que `withMutationLog`
  journalise (`T & { id: string }`).
- **`routes/posts/interactions.ts`** — l'emoji diffusé est `removedEmoji` sur les trois branches ;
  **rien retiré ⇒ rien annoncé**, le rejeu `onDuplicate` rendant `removedEmoji: null` par
  construction. L'acteur reste servi par l'état absolu de la réponse HTTP.
- **`packages/shared/types/post.ts`** — `likeCount` + `reactionSummary` sur les quatre types
  story/status, **requis**.
- **web** — `handleStoryReacted`/`handleStoryUnreacted` écrivent l'absolu dans `stories.feed()` via
  `patchStoryReactionCounts`. Le no-op documenté disparaît avec sa cause. Les handlers `status:*`
  gardent leur invalidation : elle est correcte, et la remplacer par un patch serait une
  optimisation distincte, hors périmètre.

### Écarts assumés vs la fiche rts-03

- **(a) champs REQUIS, pas optionnels.** La fiche prescrivait `reactionSummary?`. L'optionnalité en
  TypeScript n'achète rien ici : il y a **un seul** émetteur et il tient toujours la paire. Requis,
  le compilateur prouve l'invariant. La rétro-compatibilité est une propriété du **fil**, pas du
  type TS — elle est portée par les décodeurs, qui ignorent un champ qu'ils ne déclarent pas.
- **(b) `likeCount` en plus de `reactionSummary`.** La somme du résumé vaut le total, mais un
  consommateur ne devrait pas avoir à la redériver — et c'est la paire exacte que
  `PostLikedEventData` porte déjà.
- **(c) STORY inclus, pas seulement STATUS.** rts-03 ne visait que les statuts. C'est sur les
  **stories** que le mensonge avait un consommateur en production.

### Ce qui a été REFUSÉ

Remplacer l'invalidation `status:*` du web par un patch. Elle est correcte ; la changer est une
optimisation, pas un correctif, et elle n'a pas de défaut à fermer.

Rendre `emoji` optionnel sur le fil pour couvrir le cas « emoji inconnu ». Les décodeurs iOS le
déclarent non-optionnel (`SocketStoryUnreactedData.emoji: String`) : un payload sans emoji ferait
échouer le décodage et **droperait l'événement entier**. Quand l'emoji est inconnu, il n'y a rien à
annoncer — c'est la règle « rien retiré ⇒ rien annoncé », pas un champ à affaiblir.

## TDD

RED **vérifié en revenant la source seule**, les tests en place :

| Suite | Rouges contre l'ancienne source |
|---|---|
| `interactions2.test.ts` (gateway) | **11** |
| `use-post-socket-cache-sync.test.tsx` (web) | **3** |

Les rouges couvrent les trois volets : emoji fabriqué (STORY/STATUS/POST), diffusion sur un retrait
sans effet (dont le rejeu `onDuplicate`), et absence de la paire absolue.

## Gates

| Gate | Résultat |
|---|---|
| `prisma generate` + shared `bun run build` | OK (prérequis) |
| gateway `tsc --noEmit` | **0 erreur** |
| gateway jest **complet** | **710 suites / 17 387 tests verts** |
| web `tsc --noEmit` sur les fichiers touchés | **0 erreur** |
| web jest **complet** | **569 suites / 12 181 tests verts** (21 skipped) |

## Reste ouvert après ce cycle

- **Volet iOS de rts-03** — persistance des 4 sinks `StatusViewModel`, sink `statusUnreacted`,
  champs `reactionSummary` sur les `Socket*Data` du SDK. Non livrable depuis un runner Linux.
  **Le défaut de ce cycle ne l'attend pas** : il est fermé côté serveur, et le client iOS existant
  devient correct sans changement.
- **`bun run lint` (gateway) ne s'exécute pas** — aucun `eslint.config.js` dans `services/gateway/`.
  Antérieur, et la CI ne lance pas ce script : le gate lint n'existe pas pour la gateway.
- Hérités : volets iOS de `gwcontract-05` et `gwcontract-13` (à livrer ENSEMBLE), `net-02` (P1,
  iOS), `sync-01` (aucun client n'appelle encore `/sync`), fossile inerte
  `SocketNotificationEvent.isRead`.
