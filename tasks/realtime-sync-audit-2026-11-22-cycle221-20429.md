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

Le premier jet émettait par `exceptSeparated(ROOMS.feed(auteur), separated)`.
**Mon propre témoin l'a mesuré faux** — celui qui exige que ni l'id ni le pseudo
ne partent voyait la charge complète remise à la couche de diffusion. Le choix
retenu est donc de ne rien émettre, même forme que `emitCommentActivity`
(#20236).

**La raison que ce lot a d'abord publiée était FAUSSE, et l'audit adversarial
l'a cassée.** Elle disait : `AuthHandler` joint les deux rooms personnelles sous
`Promise.allSettled`, donc un socket peut être dans `feed:X` alors que son join
de `user:X` a échoué, et l'exclusion le manquerait. Mesuré, trois fois :

- `Adapter.addAll` (`socket.io-adapter/dist/in-memory-adapter.js:46`) est une
  mutation de `Map` **synchrone qui ne rend rien**, et
  `@socket.io/redis-adapter@8.3.0` **ne la surcharge pas** (0 occurrence dans
  son `dist`). `socket.join()` ne rend donc **aucune promesse** : le
  `allSettled` du site est inerte, et il n'y a rien à rejeter.
- Le seul `throw` concevable viendrait d'un écouteur d'adaptateur sur
  `join-room` / `create-room` — le dépôt n'en a **aucun**.
- Et même sous un throw synchrone, **l'asymétrie est INVERSÉE** : le littéral
  évalue `socket.join(ROOMS.user(id))` **avant** `socket.join(ROOMS.feed(id))`,
  donc un échec du premier empêcherait le second. Le seul socket possible serait
  « dans `user:X`, hors de `feed:X` » — qui ne reçoit rien du tout. Celui que la
  phrase décrivait **ne peut pas exister**.

Ce qui reste, et qui suffisait tout seul : sous l'adaptateur Redis, `.except()`
**encode le paquet ENTIER, charge comprise**, et le publie vers les autres
nœuds, qui ne filtrent qu'à l'arrivée. Le pseudo du viewer traverserait le bus
pour n'être écarté qu'au bout. Plus la raison de forme : une audience à UN
destinataire n'a aucune exclusion à calculer.

> **Une justification fausse coûte plus qu'une justification absente** — c'est
> la règle que `services/gateway/CLAUDE.md` écrit du cliquet de la table des
> routes, et ce lot l'a payée sur lui-même. Elle était publiée **trois fois**
> (doc-comment de production, ce journal, et une issue ouverte sur sa foi), et
> elle envoyait réparer, sur onze sites d'exclusion multi-destinataires, un trou
> qui n'existe pas — avec un remède (« se taire ») qui n'existe pas pour eux.
> **#20439 est donc FERMÉE avec sa mesure**, et non laissée ouverte.
>
> Ce qui l'a produite : le témoin a montré un vrai défaut, j'ai cherché
> *pourquoi* et j'ai trouvé une mécanique plausible dans le fichier voisin —
> sans ouvrir le `dist` de la dépendance qui décide. **Une prémisse tirée d'un
> `Promise.allSettled` n'est une prémisse que si l'on a vérifié qu'il y a des
> promesses.**

## Preuve

10 témoins neufs — 8 sur le handler (`story-viewed-separe-20429.test.ts`), 2 sur
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
| cache REMIS sur ce chemin | 1 rouge (le témoin de non-pollution) |

`tsc --noEmit` (gateway) : 0. Suites touchées, après le tour d'audit :
**84/84, 1586 témoins**, les 8 cliquets compris. Suite gateway COMPLÈTE :
**3030/3036 suites, 45 125 témoins** — les 6 rouges sont les suites de codec
connues (HEIF/AVIF/EXIF), et leur cause est mesurée, pas supposée : `sharp
0.35.5` / `libvips 8.18.7` n'a **aucune entrée de format AVIF**
(`sharp.format.avif` absent), et le diff du lot ne touche aucun fichier que ces
suites exercent.

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

## Ce que l'audit adversarial a changé

Sept constats. Le bloquant (la justification fausse) est traité ci-dessus ;
voici les trois qui ont modifié le CODE, et les deux qui restent des
arbitrages écrits.

**Le cache partagé n'est plus peuplé depuis ce chemin (`cached: false`).** La
clé est `[viewer]` : sa cardinalité est le nombre de **lecteurs actifs**, et ce
cache vide ses 512 entrées **ENTIÈREMENT** au plafond. Le peupler depuis la vue
— le chemin le plus chaud de la télémétrie — éviderait en boucle les clés
STABLES des sept diffusions de CONTENU pour lesquelles il a été écrit, ce que
l'audit de #20337 avait laissé en avertissement **sur place** et que ce lot
n'avait pas lu. Et la conséquence n'est pas que de la latence : plus de défauts
de cache ⇒ plus de lectures ⇒ plus d'occasions qu'une lecture tombe ⇒ **plus de
diffusions silencées par leur propre fail-closed**. Un témoin gèle la
non-pollution. Le gain renoncé est le second lot du même lecteur dans la fenêtre
de TTL ; bornage LRU : #20415.

> J'avais écrit « sous une clé de cache STABLE » comme un ARGUMENT du choix.
> Elle est stable, et c'est précisément ce qui la rend coûteuse : stable **par
> lecteur**, donc une entrée par lecteur actif. **« Stable » qualifie la clé,
> pas sa cardinalité**, et c'est la seconde qui décide d'un cache borné.

**`keep` est retiré : il était INERTE et aucun témoin ne le tenait.** Avec un
seul sujet, `read([acteur])` ne peut rendre l'acteur que s'il s'est bloqué
lui-même, et le destinataire n'est jamais l'acteur. L'audit a muté la ligne et
**132 témoins sont restés verts**. Une option qu'un doc-comment présente comme
porteuse de sens et qu'aucune garde ne tient est un piège : le jour où cette
fonction sert une audience qui CONTIENT l'acteur, l'inversion passerait au vert.

**Un `socialEvents` PARTIEL ne perd plus le lot de vues.** L'appel était hors
de tout `try/catch`, **avant la première écriture** : un throw y faisait
répondre `sendInternalError` et perdait les 120 vues, l'inverse exact de ce que
promet la ligne « la vue est DÉJÀ enregistrée » trente lignes plus bas. Le site
TESTAIT déjà `socialEvents ?` — donc il ne faisait pas confiance au type qui le
déclare non optionnel ; si l'absence est plausible au point d'être gardée, une
forme partielle l'est autant. `?.` porte maintenant sur la MÉTHODE, et
`undefined` vaut `null`, donc le silence.

**Ce qui reste arbitré, pas corrigé :**

- **Le coût du hissage.** Un lot sans aucune story paie quand même ses deux
  lectures, là où le parent n'en payait zéro. L'audit propose une résolution
  PARESSEUSE au premier `type === 'STORY'` — mais ce verdict vient de
  `getPostById`, donc **après** `recordView` : c'est exactement l'`await`
  supplémentaire entre l'écriture et l'émission que la propriété d'ordre
  refuse. Ce n'est donc pas une domination mais un **arbitrage**, et il est
  écrit sur le site. Le témoin de coût gèle la forme hissée ; le rouvrir fait
  partie du prix si l'arbitrage change.
- **La séparation est résolue une fois pour un lot qui peut durer des
  secondes** (jusqu'à ~120 itérations portant chacune une écriture et la
  lecture LOURDE du détail). Un blocage posé pendant le lot n'est pas vu, même
  si `invalidateSeparationAround` tourne : l'ensemble est déjà en main. Fenêtre
  bornée par la durée du lot, non par le TTL. Contrepartie assumée du hissage,
  désormais écrite.

**Les six axes sur lesquels l'audit n'a rien trouvé**, dits explicitement parce
qu'un silence se lit comme un angle mort : l'équivalence à un sujet (vérifiée
contre `read`), « l'audience est l'auteur et lui seul » (un seul site joint une
feed room, et `handleFeedSubscribe` ne joint que la sienne), la fenêtre d'ordre
préexistante et non élargie (vérifiée sur le parent), l'absence de canal
NOTIFICATION pour une vue, la leçon 275 (`markPostNotificationsAsRead` ne
touche que le viewer, les crédits d'engagement créditent le viewer, les
compteurs sont des agrégats sans identité), et le chemin ANONYME
(`ingestAnonymous` ne diffuse aucun `story:viewed`).

## Ce que ce lot ouvre, et ne corrige pas

- **#20443** — `story:viewed` nomme le viewer sous la loi du **BLOCAGE**, quand
  sa jumelle REST (« Vu par ») le nomme sous `views.identity` (**Communauté**) :
  le direct est plus FAIBLE que le durable, sur la charge la plus nominative du
  dépôt. Aucun client ne lit ces deux champs — le retrait est le candidat, et
  c'est un lot de rétrocompatibilité (le décodeur iOS les veut non optionnels).
- **#20440** — `SocialEventsHandler.ts` est à **996 lignes** pour un plafond de
  1000, et ce lot a touché le plafond en cours de route : le premier jet des
  doc-comments l'a porté à 1019, qu'il a fallu resserrer. Le prochain lot qui y
  touche est bloqué avant d'écrire. À découper par responsabilité.
- **#20414** — la fenêtre de réordonnancement de `story:viewed`, préexistante et
  non fermée (`viewCount` lu après l'écriture), plus l'arbitrage hissage /
  paresse ci-dessus.
- **#20415** — le bornage du cache de séparation : ce lot l'a CONTOURNÉ
  (`cached: false`) parce qu'une éviction par `clear()` total ne supporte pas un
  producteur à forte cardinalité. Une LRU rendrait le cache utilisable ici.
- **#20439 est FERMÉE, pas livrée** : sa prémisse — un join de room qui échoue
  en silence — a été mesurée fausse le jour même (voir § « On NE DIFFUSE PAS »).
