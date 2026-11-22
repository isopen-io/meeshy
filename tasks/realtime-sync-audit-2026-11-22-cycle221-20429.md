# Cycle 221 — `story:viewed` se tait chez l'auteur qu'un blocage sépare (#20429)

**Date** : 2026-11-22 · **Branche** : `claude/exciting-planck-5cw2og` · **Issue** : #20429

## Ce que ce cycle a livré

La **HUITIÈME** famille d'activité. #20338 en nommait six, son lot en a trouvé
sept, son audit adversarial celle-ci — et c'est la plus NOMINATIVE des huit :
là où les sept autres ne portent qu'un `userId`, la charge de `story:viewed`
nomme le viewer par son id **ET son pseudo** (`viewerUsername`). Elle partait
vers `ROOMS.feed(storyAuthorId)` **sans aucune exclusion**.

Vecteur étroit mais réel (relevé par lecture de source, pas supposé) : A publie
une story et y RÉFÉRENCE B, puis A bloque B — ou B bloque A. B ouvre la story,
`canUserConsumePost` l'admet (une story vivante référencée est `granted`), la
vue est comptée, et A — qui a bloqué B — se voit annoncer « B a vu ta story »,
avec son pseudo.

## Le point qui décide du correctif : UN sujet, pas deux

Les sept familles de #20338 passent par `activitySeparation(acteur, auteur)`.
Deux sujets, parce que leur audience contient des **TIERS** — la room du post,
les feed rooms des amis : il y faut taire aussi les lecteurs séparés de
l'AUTEUR.

**L'audience de `story:viewed` est UNE SEULE personne.** La seule question est
donc « l'auteur est-il séparé du viewer ? », et `roomsAround([viewerId])` y
répond exactement : l'auteur y figure si et seulement s'il a bloqué le viewer
ou si le viewer l'a bloqué. Sur cette audience, les deux formes rendent le
**MÊME verdict** — la forme à deux sujets n'y ajoute que « l'auteur séparé de
lui-même », qui est vide.

Ce qui les sépare est le **COÛT**, et c'est lui qui décide. La vue est un chemin
**CHAUD** : jusqu'à 120 événements par requête, la plupart sur des posts
ordinaires dont l'auteur n'est pas connu avant l'écriture. Par couple, c'est
deux lectures par AUTEUR DISTINCT du lot ; par sujet unique, **deux lectures
pour le lot entier**, sous une clé de cache **STABLE** (`[viewer]`) que les
requêtes suivantes du même lecteur retrouvent. Une lenteur est un bug
(dimension 2) : le témoin de coût gèle cette propriété, et il tombe sous la
forme à deux sujets.

> C'est une **déviation assumée** du critère de fin de l'issue, qui écrivait
> `activitySeparation(data.viewerId, storyAuthorId)`. L'équivalence de verdict
> est démontrée ci-dessus ; le coût, mesuré. Une loi unique n'oblige pas à une
> seule FORME d'appel — elle oblige à ce que la forme choisie se justifie contre
> l'audience qu'elle garde.

## L'ordre : ce que ce lot tient, et ce qu'il ne tient pas

La charge porte `viewCount`, un compteur **ABSOLU** : idempotent sous double
livraison, jamais sous réordonnancement. La séparation est donc résolue **AVANT
la première écriture** (`separationAroundActor` en tête d'`applyViews`), et non
entre l'écriture et l'émission.

**Mais la fenêtre de réordonnancement n'est pas fermée par ce lot, et il faut le
dire.** Mesuré sur le parent `102d8bd0bc` : `broadcastStoryViewed` lit
`viewCount` par `getPostById` **APRÈS** `recordView`. Il y avait donc déjà un
`await` entre la mutation et l'émission, et il y est encore — deux vues
concurrentes peuvent toujours s'émettre dans l'ordre inverse de leurs écritures.
Ce lot **n'élargit pas** cette fenêtre ; il ne la referme pas. Suivi : #20414.

> Le cycle 220 a affirmé une fenêtre préexistante sans la mesurer, et son audit
> l'a trouvée fausse. Ici la mesure a été faite sur le parent AVANT d'écrire la
> phrase — et elle dit « préexistante » **plus** « non fermée », ce qui est deux
> affirmations, pas une.

## On NE DIFFUSE PAS, plutôt que de diffuser en excluant

Le premier jet émettait par `exceptSeparated(ROOMS.feed(auteur), separated)`,
et son doc-comment affirmait que l'exclusion « vide l'audience sans dépendre de
qui peuple la feed room ». **Mon propre témoin l'a mesuré faux** — celui qui
exige que ni l'id ni le pseudo ne partent voyait la charge complète remise à la
couche de diffusion.

La raison est dans `AuthHandler` :

```ts
await Promise.allSettled([
  socket.join(ROOMS.user(user.id)),
  socket.join(ROOMS.feed(user.id)),
]);
```

`allSettled` ne rejette jamais, et **ses résultats sont jetés** : un join de
`user:X` qui échoue est **silencieux**, et le socket reste dans `feed:X`. Une
exclusion `except(ROOMS.user(X))` le manquerait alors — exactement le socket
qu'il fallait taire. S'y ajoute que sous l'adaptateur Redis, `.except()`
sérialise la charge vers les autres nœuds **avant** que quiconque ne filtre.

L'audience n'ayant qu'UN destinataire, le taire c'est se taire : même forme que
`emitCommentActivity` (#20236), et ici c'est une mesure, pas un goût.

> **« Diffuser en excluant » n'est pas « ne pas diffuser ».** La première repose
> sur une appartenance de room qu'il faut avoir PROUVÉE ; la seconde ne repose
> sur rien. Ce que ce lot a trouvé dépasse son périmètre : **toute** exclusion
> `except(ROOMS.user(id))` du dépôt — #20236, #20338 — hérite du même trou.
> Issue : **#20439**.

## Preuve

9 témoins neufs — 7 sur le handler (`story-viewed-separe-20429.test.ts`), 2 sur
le producteur (dans le harnais de route EXISTANT, qui exerce la vraie route).
Le couple `(événement, charge)` est relevé tel qu'il part sur le fil.

| mutation | ce qui tombe |
|---|---|
| fail-OPEN sur la lecture impossible | 2 rouges |
| ne plus taire l'AUTEUR séparé | 4 rouges |
| forme à DEUX sujets (coût) | 1 rouge (le témoin de coût) |
| séparation résolue APRÈS la mutation | 1 rouge |
| une résolution PAR VUE au lieu d'une par lot | 1 rouge |
| producteur fail-OPEN (`null` traité comme vide) | 1 rouge |

`tsc --noEmit` (gateway) : 0. Suites touchées : 76/76, 1521 témoins. Les 8
cliquets verts.

## Le témoin que le CACHE rendait muet

Le témoin « ni l'id ni le pseudo ne partent » itère sur trois configurations —
l'auteur a bloqué, le viewer a bloqué, la lecture tombe en panne. Sous la
mutation fail-open, il restait **VERT**, et c'est l'inspection du verdict
témoin par témoin (et non le compte de rouges) qui l'a montré.

La cause : le cache de séparation est **PARTAGÉ par le processus**, et les trois
itérations résolvent la **même clé** `[viewer]`. La première écrivait l'entrée ;
la troisième, celle de la panne, était servie par elle — elle n'ouvrait donc
jamais la lecture qui échoue. Le témoin portait le nom du cas qu'il n'exerçait
pas.

> **`beforeEach` ne suffit pas à un témoin qui ITÈRE à travers un résolveur
> caché.** Le vidage appartient à la BOUCLE, pas à la suite. Et ce qui l'attrape
> n'est pas le compte de rouges d'une mutation — c'est de lire QUELS témoins
> tombent, et de comparer à ceux qu'on attendait. Leçon :
> `tasks/lessons/2026-11-22-un-cache-partage-rend-muet-le-cas-d-erreur-d-un-temoin-qui-itere.md`.

## Les doubles qui ont dû suivre

`separated` est un paramètre **REQUIS** : dix harnais déclaraient un double
`socialEvents` sans `separationAroundActor`, et quatre appelaient
`broadcastStoryViewed` à deux arguments. **Deux de ces fichiers sont HORS
BUDGET** (`unit/SocialEventsHandler.test.ts` 1132 lignes,
`interactions2.test.ts` 1039) : la règle 3 du cliquet interdit d'y ajouter une
ligne, donc les douze corrections sont posées **sur des lignes existantes** —
croissance nette mesurée à **zéro** sur les dix fichiers.

`POST /posts/:postId/view` a l'air d'être un second producteur (son témoin le
nomme) : c'est un **ALIAS** qui délègue à `ingestSocialEvents`. Le producteur
est bien unique, et l'issue disait vrai — vérifié, pas supposé.

## Ce que ce lot ouvre, et ne corrige pas

- **#20439** — un join de room personnelle qui échoue est SILENCIEUX
  (`Promise.allSettled` dont les résultats sont jetés), et toute exclusion
  `except(ROOMS.user(id))` du dépôt le manque.
- **#20440** — `SocialEventsHandler.ts` est à **998 lignes** pour un plafond de
  1000 : le prochain lot qui y touche est bloqué avant d'écrire. À découper par
  responsabilité, pas par tranche.
- **#20414** — la fenêtre de réordonnancement de `story:viewed`, préexistante et
  non fermée (`viewCount` lu après l'écriture).
