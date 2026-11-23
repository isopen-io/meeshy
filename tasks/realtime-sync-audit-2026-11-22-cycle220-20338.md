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

## Deuxième tour — ma justification d'ordonnancement était FAUSSE

Le premier jet résolvait la séparation DANS la diffusion et le justifiait ainsi :

> « sur ces sept familles, la diffusion est déjà détachée après la mutation **et
> déjà précédée d'une lecture en base** […] La fenêtre de réordonnancement que le
> critère veut éviter préexiste et est déjà large. »

**Mesuré FAUX sur SIX des SEPT familles** par l'audit adversarial, et vérifié par
moi sur le parent (`git show af4b5ac41c`) :

| famille | lecture avant l'emit, AVANT le lot | verdict |
|---|---|---|
| `post:liked` / `-unliked` | oui (`getVisibilityFilteredRecipients`) | la fenêtre préexistait ; le lot l'élargissait |
| `story:reacted` / `-unreacted` | **aucune** — la méthode était `void`, l'emit synchrone | fenêtre **NEUVE** |
| `status:reacted` / `-unreacted` | **aucune** — idem | fenêtre **NEUVE** |
| `post:reaction-added` / `-removed` | **aucune** sur le chemin non-cœur : le `findUnique` vivait DANS `if (emoji === HEART_EMOJI)` | fenêtre **NEUVE**, et la justification était **CIRCULAIRE** — la « lecture qui préexiste » est celle que J'AVAIS sortie du `if` |

> **Le lot ne constatait pas une fenêtre : il en OUVRAIT quatre.** Et le cache de
> séparation rend l'inversion quasi déterministe — pour un même couple (acteur,
> auteur), la première diffusion paie deux lectures et la seconde un hit, donc
> **la seconde écriture double la première**. L'audit l'a reproduit sur
> `status:reacted`/`-unreacted` et sur `post:reaction-added`/`-removed`.
> La charge étant ABSOLUE, le dernier événement reçu gagne : le lecteur garde un
> compteur que la base contredit, et iOS le PERSISTE. Un agrégat absolu est
> idempotent sous DOUBLE livraison, **jamais sous RÉORDONNANCEMENT**.

**Corrigé** : la séparation est résolue **AVANT la mutation**, chez l'appelant
(patron de #20236 à `comments.ts:691`), et passée en paramètre **REQUIS** aux
sept diffusions. Story et statut **redeviennent synchrones** — donc aucune
fenêtre, et leurs témoins n'ont plus besoin d'`await`. Le `findUnique` revient
DANS le `if` du cœur.

> **Et ce faux a une forme reconnaissable : j'ai cité comme preuve une lecture
> que mon propre diff venait d'ajouter.** Devant une justification du type « la
> fenêtre préexiste », la question est : *préexiste-t-elle sur l'arbre d'AVANT,
> famille par famille ?* — elle se répond par `git show <parent>`, jamais en
> lisant le code qu'on vient d'écrire.

## Deux gates que je n'avais PAS lancés, et les deux étaient rouges

1. **`src/__tests__/unit/SocialEventsHandler.test.ts`** — la suite JUMELLE, 66
   témoins sur le même objet, **8 rouges**. Mon périmètre était
   `src/socketio` + `unit/socketio` + `routes/posts` ; elle vit à la RACINE de
   `unit/`. J'avais corrigé sa sœur `socketio/handlers/__tests__/` et jamais
   lancé celle-là.
2. **`gateway-test-file-size-budget` règle 3** — j'ajoutais 30 lignes à deux
   fichiers de témoins **déjà hors budget**, ce que le `CLAUDE.md` interdit
   explicitement (« on extrait d'abord, on ajoute ensuite »).

> **C'est la DEUXIÈME fois dans la même session que je filtre mes gates sur le
> nom de la feature.** Au cycle 219, le cliquet de la porte d'émission vivait
> sous `src/socketio/__tests__/` et mon filtre disait `comment*`. Ici la suite
> jumelle vivait un répertoire plus haut que mon filtre. La règle que je n'avais
> pas encore tirée : **la suite COMPLÈTE est le seul périmètre qui ne dépende pas
> de ce que je crois avoir touché** — et je l'avais lancée, sans lire son
> verdict avant d'annoncer « 367 suites vertes » depuis un run filtré.

La résolution pré-mutation a réglé le second gate **par construction** : story et
statut redevenant synchrones et la septième famille recevant sa séparation en
paramètre, les quatre `await` et les six vidanges de microtâches n'ont plus de
raison d'être. Les deux fichiers hors budget retrouvent leur compte exact (1482
et 1040 lignes), et les deux ajouts qui restaient nécessaires
(`activitySeparation` dans leurs doubles) tiennent sur une ligne existante.

## `separated` est REQUIS, et « rien à taire » se déclare

L'audit a relevé que le paramètre était OPTIONNEL sur les deux seams partagés —
« une garde dont le défaut est l'OUVERTURE n'est pas une garde » : la prochaine
famille branchée là serait non gardée en silence. Il est désormais requis, et
`NOTHING_TO_SILENCE` rend l'absence de sujet **déclarative** là où elle est
légitime (`post:deleted`, qui ne nomme que l'auteur, et les trois diffusions de
traduction, qui ne nomment personne). Le compilateur a nommé les onze sites.

## Les harnais, après la correction

La résolution pré-mutation a ANNULÉ la plupart des retouches du premier jet :
story et statut redevenant synchrones, leurs témoins n'ont ni `await` ni vidange
de microtâches à apprendre. Ce qui reste est mécanique et honnête :

- **les doubles de `socialEvents` reçoivent `activitySeparation`** (sept
  fichiers) : la route et les deux handlers l'appellent AVANT leur mutation, donc
  un double qui l'omet fait répondre **500** à la route — pas échouer une
  assertion. C'est l'anti-patron du double PARTIEL, et le cycle 218 l'avait déjà
  payé sur `comments-like-delete.test.ts` ;
- **les appels et les expectations reçoivent l'argument** (32 sites) : le
  paramètre étant REQUIS, `tsc` a nommé les sites de production et les témoins
  ont suivi. `[]` y veut dire « personne à taire », ce que ces suites testaient
  déjà — le filtrage a sa propre suite.

> **Rendre un paramètre REQUIS coûte une passe de harnais, et c'est ce qu'on
> achète** : la prochaine famille branchée sur ces seams ne pourra pas l'omettre.
> Un défaut permissif aurait coûté zéro ligne aujourd'hui et un trou silencieux
> plus tard.

Un reste à instruire, relevé par l'audit : `SocialNotificationsP4B.test.ts`
RÉIMPLÉMENTE le routage de la route dans un helper local (`routeLikeEvent`), ce
que le dépôt interdit (« ne JAMAIS ré-implémenter le corps d'une méthode de
production dans un helper de test »). Pré-existant, non touché par ce lot.

## Gates

| gate | résultat |
|---|---|
| témoins du lot | **41 / 41** ; ROUGE prouvé à **28 rouges / 13 verts**, les 13 étant les témoins de contrôle |
| `src/socketio` + `__tests__/unit/socketio` + `routes/posts` + cliquet des promesses détachées + `routes/__tests__` | **367 suites / 5 279 témoins, 0 rouge** |
| `tsc --noEmit` (gateway) | **exit 0** |


## Ce que l'audit a trouvé SAIN, et qui compte

- **`keep: actorId` est SÛR ici**, vérifié champ par champ ET au producteur
  runtime sur les sept charges : `getEmojiAggregation` construit littéralement
  `{ emoji, count }`, et `reactionSummary` n'a qu'un producteur
  (`updatePostReactionSummary`, un `groupBy(['emoji'])`) ⇒ `{emoji: nombre}`.
  Aucun `userId`, aucun roster. **Je n'ai pas refait l'erreur du cycle 219** : la
  distinction avec `CommentReactionAggregation` (qui porte `userIds`) est réelle.
- **Le chemin du cœur est intact** au caractère près, et un `post === null` prend
  le même chemin qu'avant.
- **Le fail-closed est COMPLET, pas partiel**, sur les sept : le `return` précède
  tout `io.to`, et le témoin assert sur TOUTES les émissions du faux `io` — donc
  un fail-closed partiel rougirait.
- **Les `.catch` de la route sont corrects** (attachés à la promesse,
  `enhancedLogger` en portée, `warn` ne jette pas) — et le cliquet des promesses
  détachées est vert.
- **La déduplication est préservée** : `io.to([a, b]).except([c])` reste UNE
  émission, donc le `+2` du compteur de l'auteur-viewer de story ne revient pas.
- **Le canal NOTIFICATION était déjà fermé** : `post_like`, `story_reaction`,
  `status_reaction` ∈ `ACTOR_CONTENT_TYPES`, et `refusesActorContent` refuse sur
  blocage dans les deux sens, fermé sur panne.
- **Et une honnêteté sur la portée de ce lot** : sur ces sept chemins, la moitié
  « auteur » de la loi est **défensive seulement** — POST comme DELETE passent par
  `resolveInteractionTarget` → `canUserInteractWithPost`, qui refuse déjà un
  blocage acteur↔auteur. Contrairement aux commentaires (où `DELETE …/like` n'a
  pas cette porte, le vecteur vivant de #20236), **seule la moitié « tiers » est
  vivante ici**. Le lot ferme donc une fuite réelle, par une loi dont une moitié
  est redondante sur ce chemin — ce qui reste juste, et se dit.

## Suivi ouvert par l'audit

- **#20429** — `story:viewed` est la HUITIÈME famille, et sa charge nomme le
  viewer par son id **et son pseudo** ; elle part au fil de l'auteur sans
  exclusion.
- **#20430** — le CONTENU d'un post part à `ROOMS.post` sans séparation
  (pré-existant, six événements + trois traductions), et **il n'existe aucun
  cliquet d'ÉNUMÉRATION de la loi** : quatre lots consécutifs ont découvert la
  famille suivante à la main.
- **#20415** (élargi) — le cache de séparation reçoit maintenant le torrent des
  likes avec une clé nouvelle par couple, et son éviction est un `cache.clear()`
  total, pas un LRU.
- Relevé, non ouvert : `SocialNotificationsP4B.test.ts` réimplémente le routage
  de la route dans un helper local, ce que le dépôt interdit ; et
  `AuthHandler` joint `ROOMS.user` sous `Promise.allSettled`, donc la doctrine
  « `except` porte sur `user:`, dont un socket est TOUJOURS membre » n'est pas
  garantie à la lettre.
