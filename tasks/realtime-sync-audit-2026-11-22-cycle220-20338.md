# Cycle 220 — six familles de diffusion d'ACTIVITÉ taisent ce qu'un blocage sépare (#20338)

Réservation de branche. Suivi du cycle 218 (audit adversarial de #20236,
constat 6), et suite directe du cycle 219 (#20337), qui a fermé la CHARGE des
réactions de commentaire.

## Le périmètre

#20236 a fermé les quatre événements d'activité d'un **commentaire**. La question
« quels AUTRES sites d'activité ne filtrent rien ? » en a rendu six, toutes sur
des posts, des stories et des statuts.

| événement | site |
|---|---|
| `post:liked` / `post:unliked` | `SocialEventsHandler.broadcastPostLiked` / `…Unliked` |
| `story:reacted` / `story:unreacted` | `SocialEventsHandler` |
| `status:reacted` / `status:unreacted` | `SocialEventsHandler` |
| `post:reaction-added` / `post:reaction-removed` | `PostReactionHandler` |

`post:liked` est la **jumelle exacte** de `comment:liked` — même forme, même
défaut, laissée de côté par #20236 qui s'arrêtait au commentaire.

## Ce qui est déjà en place

La loi est écrite et partagée : `socketio/separatedRooms.ts` (#20236, étendu par
#20337 avec son option `cached`). Ces six familles n'ont qu'à l'appeler avec leur
propre couple de sujets.

**Et `keep: actorId` est ici le bon choix**, contrairement au cycle 219 : ces
charges ne portent **aucun roster** (`PostReactionAggregation` est
`{ emoji, count }`, « NO userIds, count only »), donc rien ne nomme un TIERS.
L'acteur reste dans l'audience de son propre geste — décision porteur du
2026-09-13, « le like n'est pas synchronisé entre les différentes vues ».

À mesurer et à livrer dans ce lot.

## Ce que le lot a livré

La loi de #20236 est **généralisée** : `SocialEventsHandler.activitySeparation`
(dont `commentActivitySeparation` n'est plus qu'une projection) sert les SEPT
familles. Chacune résout ses deux sujets — l'ACTEUR que la charge nomme et
l'AUTEUR de la cible — et `null` ⇒ on n'annonce rien, sur aucune adresse.

| famille | site | adresse qui ne filtrait rien |
|---|---|---|
| `post:liked` / `-unliked` | `broadcastPostLiked` / `…Unliked` | `ROOMS.post` (les feed rooms étaient partiellement gardées) |
| `story:reacted` / `-unreacted` | `broadcastStoryReacted` / `…Unreacted` | `ROOMS.post(storyId)` |
| `status:reacted` / `-unreacted` | `broadcastStatusReacted` / `…Unreacted` | `ROOMS.post(statusId)` |
| `post:reaction-added` / `-removed` | `PostReactionHandler.broadcastReactionChange` | `ROOMS.post` |

**`except` porte sur les rooms `user:`**, dont un socket est toujours membre :
une seule exclusion retire donc le lecteur de TOUTES les adresses d'un même
emit — feed comme post. C'est ce qui permet de garder le `io.to([...])` unique
dédoublonné que story et statut exigent (sans lui, l'auteur qui regarde sa
propre story comptait son emoji deux fois).

**`keep: actorId` est conservé, et c'est une décision, pas une reprise.** Ces
charges ne portent **aucun roster** (`PostReactionAggregation` est
`{ emoji, count }`), donc rien n'y nomme un TIERS — ce qui les sépare du cycle
219, où le roster faisait de l'acteur un lecteur à filtrer. L'acteur reste dans
l'audience de son propre geste (décision porteur du 2026-09-13). Un témoin le
garde explicitement, dans les deux sens du blocage.

## Ce que le lot NE fait pas, et il faut le dire

Le critère de fin de l'issue demande que **la séparation soit résolue AVANT la
mutation**, par analogie avec #20236. **Ce lot la résout dans la diffusion**, et
voici la mesure qui le justifie plutôt qu'une commodité :

- sur ces sept familles, la diffusion est **déjà détachée après la mutation** et
  **déjà précédée d'une lecture en base** — `getVisibilityFilteredRecipients`
  pour `post:liked`, le `post.findUnique` de `broadcastReactionChange` pour
  `post:reaction-*`. La fenêtre de réordonnancement que le critère veut éviter
  **préexiste et est déjà large** ;
- la résoudre pré-mutation exigerait de la faire remonter à travers cinq sites
  d'appel (trois routes REST, deux handlers) qui n'ont pas l'`authorId` en main
  au bon moment.

C'est la même tension que le cycle 219 a rencontrée, et elle a déjà son issue :
**#20414**, qui doit trancher la doctrine d'ordonnancement pour TOUTE la famille
d'activité. Ce lot y ajoute sept sites et ne prétend pas la régler — il le dit,
au lieu de contredire le critère en silence.

## Trois harnais corrigés, et les trois sont le même anti-patron

Rendre ces méthodes asynchrones a fait rougir dix témoins existants, et **aucun
ne nommait un défaut du lot** :

1. **Quatre témoins synchrones** (`SocialEventsHandler.test.ts`) n'attendaient
   pas une méthode devenue `async` : l'emit n'avait pas encore eu lieu quand
   l'assertion tombait. Passés en `async` / `await`, assertions inchangées.
2. **Deux doubles de `socialEvents` PARTIELS** (`PostReactionHandler`, les deux
   suites) n'avaient pas `activitySeparation` : l'appel JETAIT dans un lot
   détaché, la diffusion n'avait jamais lieu, et le rouge accusait le code.
3. **Quatre doubles de diffusion rendaient `undefined`** là où la route attend
   une promesse à `.catch` (règle `void p`) ⇒ `undefined.catch` ⇒ **500**, pas un
   échec d'assertion. C'est le défaut exact que le cycle 218 avait déjà payé sur
   `comments-like-delete.test.ts`.

> **Rendre une méthode asynchrone casse ses témoins de TROIS façons, et aucune
> n'est une erreur de production** : un témoin qui n'attend pas, un double qui
> n'a pas la méthode neuve, un double qui ne rend pas de promesse là où
> l'appelant en détache une. Les trois rougissent en nommant le lot.

## Gates

| gate | résultat |
|---|---|
| témoins du lot | **41 / 41** ; ROUGE prouvé à **28 rouges / 13 verts**, les 13 étant les témoins de contrôle |
| `src/socketio` + `__tests__/unit/socketio` + `routes/posts` + cliquet des promesses détachées + `routes/__tests__` | **367 suites / 5 279 témoins, 0 rouge** |
| `tsc --noEmit` (gateway) | **exit 0** |
