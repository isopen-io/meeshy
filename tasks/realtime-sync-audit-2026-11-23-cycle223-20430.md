# Cycle 223 — le CONTENU d'un post se tait dans la room du post (#20430)

**Date** : 2026-11-23 · **Branche** : `claude/post-contenu-separe-20430` · **Issue** : #20430

## Ce que ce cycle ferme

La dernière lacune de la famille que quatre lots ont fermée pièce à pièce :
#20216 le CONTENU d'un commentaire, #20236 ses quatre ACTIVITÉS, #20338 sept
familles de post / story / statut, #20429 la huitième. Restait le **contenu du
POST lui-même** — la charge la plus lourde des trois, le `Post` entier.

Vecteur : un lecteur ouvre le détail d'un post (il REJOINT la room), bloque
l'auteur, l'auteur édite ⇒ **le lecteur reçoit le nouveau contenu en direct**.

Ce qui rend la fenêtre réelle : **poser un blocage n'évince aucune socket d'une
room de post** (`routes/directory/blocks.ts` n'appelle que
`invalidateSeparationAround`, lignes 144 et 240), et la porte de `post:join`
juge au moment du JOIN. Le fichier de production écrivait déjà cette prémisse,
pour une autre raison — « si l'édition RESTREINT la visibilité, les membres déjà
joints à la post room reçoivent encore cette update ».

## L'issue se trompait sur les DEUX points qui décident du périmètre

C'est le cœur de ce cycle, et il faut le dire en premier : **le critère de fin
de l'issue était faux deux fois**, et le mesurer a changé le lot dans les deux
sens — réduit d'un côté, élargi de l'autre.

### Faux n°1 — « les six familles portent le Post vers `ROOMS.post` » : UNE seule le fait

`postRoomId` est **OPTIONNEL**, et seul `broadcastPostUpdated` le passe. Les
cinq autres (`post:created`, `story:created`, `story:updated`,
`status:created`, `status:updated`) tombent dans la branche `else` :
une boucle par feed room qui **n'adresse JAMAIS** la room du post.

Et leurs feed rooms sont déjà filtrées **DANS LES DEUX SENS** —
`getVisibilityFilteredRecipients` → `withoutBlockedRecipients` →
`getBlockedUserIdsAmong`, qui lit « qui m'a bloqué » **et** « qui j'ai bloqué »
parmi les candidats (mesuré ; l'issue annonçait « seulement les blocages de
l'AUTEUR »). Elles ne fuient donc pas.

**Les sites qui atteignent vraiment la room du post sont QUATRE**, pas neuf :
`post:updated`, et les trois traductions via `emitToFeedsAndPostRoom`.

### Faux n°2 — « les trois traductions ne nomment personne, donc exemptées »

**Mesuré : les trois portent `translation.text`** — le contenu du post dans une
autre langue. « Ne nommer personne » et « ne porter aucun contenu » sont deux
propriétés différentes, et c'est la seconde qui décide : #20216 n'a pas tu le
contenu d'un commentaire parce qu'il nommait quelqu'un, mais parce qu'il EST du
contenu.

Et l'asymétrie était à **CINQ LIGNES d'intervalle, dans la même méthode** : sur
`media:caption-translation-updated` comme sur `media:alt-translation-updated`,
la branche `if (data.commentId)` passe par `commentEmitter` — gardée depuis
#20216 — et la branche du POST par `NOTHING_TO_SILENCE`. **Le même texte traduit
était tu pour un commentaire et servi pour un post.**

> C'est le motif récurrent du dépôt dans sa forme la plus pure : le défaut est
> dans la branche VOISINE, écrite par la même main, invisible parce que la forme
> JUSTE est juste à côté. La question qui l'attrape n'est pas « ce site
> applique-t-il la règle ? » mais **« qu'est-ce que la branche d'en face fait
> différemment, et pourquoi ? »**.

## Le correctif

`contentSeparation(postAuthorId)` — **un seul sujet**, celui qui a ÉCRIT (une
diffusion de contenu n'en a qu'un, #20236), et **cachée** cette fois, à
l'inverse de `separationAroundActor` (#20429, `cached: false`) : la clé
`[auteur]` est exactement l'entrée STABLE pour laquelle ce cache a été écrit —
une traduction diffuse une fois PAR LANGUE CIBLE, chaque résultat arrivant
séparément du pipeline, sans boucle où passer le résultat.

`PostRoomTarget = { id, separated }` fait voyager la room du post et son verdict
**ENSEMBLE** : l'adresser sans verdict **ne compile pas**. C'est la forme que le
dépôt préfère — « un champ REQUIS couvre les sites à écrire demain, qu'un
cliquet d'énumération ne voit pas ».

`separated === null` ⇒ on n'adresse pas la room du post ; les feed rooms partent
seules, et **l'auteur reçoit TOUJOURS son propre contenu**.

> **Ce n'est PAS le fail-closed partiel que #20236 interdit**, et la différence
> se mesure : là, deux adresses servaient la MÊME audience non filtrée, et n'en
> garder qu'une ne gardait rien. Ici les feed rooms portent un filtre
> **INDÉPENDANT et déjà appliqué**, et la room du post est la **seule** surface
> non gardée. La fermer est donc le fail-closed COMPLET de ce qui fuyait ;
> fermer les feed rooms en plus ne protégerait personne et priverait l'audience
> légitime sur une panne de lecture.

## Le cliquet, et ce qu'il NE prouve pas

Quatre lots ont trouvé la famille suivante **à la main**. C'est la leçon 261
dans sa forme pure, et un cliquet remplace la question :
`socketio/__tests__/post-room-separation-sweep.ts`.

Tout site de production citant `ROOMS.post(` déclare sa **NATURE** parmi quatre,
et un site absent de l'inventaire est un ROUGE — **le silence n'est pas une
cinquième valeur** (même forme que `root-mounted-surfaces.ts`) :

| nature | ce qu'elle engage |
|---|---|
| `emission-gouvernee` | émet, et prend un verdict de séparation |
| `fabrique-de-rooms` | construit des noms, n'émet rien : ses appelants gouvernent |
| `adhesion` | `socket.join` / `socketsLeave` — ni charge, ni audience à taire |
| `exemption-motivee` | émet sans séparation, et la RAISON est écrite |

Un second inventaire garde les appelants de `NOTHING_TO_SILENCE`, parce que
**c'est là qu'une fuite NEUVE se poserait** : un lot qui ajoute une diffusion et
recopie la constante chez le voisin. Un seul y figure — `post:deleted`, dont la
charge est `{ postId, authorId }`.

**Ce qu'il ne prouve PAS, écrit sur place** : il ne lit pas le flot de données,
donc il ne peut pas montrer qu'un site gouverné passe le BON verdict, seulement
qu'il en prend un. Et il est clé par FICHIER : un site neuf NON gardé ajouté
dans un fichier déjà déclaré `emission-gouvernee` passerait au vert. La preuve
de justesse reste aux témoins.

## Preuve

23 témoins neufs, **RED prouvé 7/23** — et le premier relevé de ce rouge était
TROMPEUR, ce qui vaut d'être dit : il annonçait « 12 rouges », dont plusieurs sur
le cas NOMINAL de familles qui n'adressent aucune room de post. Leurs témoins de
blocage passaient donc **vacuement** (zéro reçu, assertion satisfaite). Lire la
LISTE au lieu du compte a montré que mon tableau de témoins affirmait une
uniformité que je n'avais pas mesurée — d'où le rangement par ce que chaque
famille **ATTEINT**, et cinq familles gelées sur « n'adresse aucune room de
post » pour qu'un lot qui leur ajouterait `postRoomId` sans séparation fasse
rougir ce fichier.

| mutation | ce qui tombe |
|---|---|
| fail-OPEN : room du post adressée malgré `null` | 1 rouge |
| séparation non appliquée à la room du post | 3 rouges |
| une traduction revient à `NOTHING_TO_SILENCE` | 1 rouge |
| l'auteur est tu lui aussi | 1 rouge |
| une des cinq familles reçoit une room de post | 1 rouge |
| **le cliquet** : un site neuf non déclaré | 1 rouge |
| **le cliquet** : un appelant `NOTHING_TO_SILENCE` neuf | 1 rouge |

`tsc --noEmit` : 0. Suites touchées : **358/358, 5821 témoins**.

## Le piège qui a failli livrer ce lot SANS ses témoins

`.gitignore` portait `post-*` — **non ancré**, donc matchant par **BASENAME à
toute profondeur**. Mes trois fichiers neufs
(`post-contenu-separe-20430.test.ts`, `post-room-separation-sweep.ts`, son
`.test.ts`) étaient **invisibles à `git status`**.

Sans la vérification avant commit, ce lot de sécurité aurait livré son
correctif **sans un seul témoin et sans son cliquet, avec une CI VERTE** — des
témoins absents ne rougissent pas.

Le piège avait **déjà frappé** le 2026-08-19
(`packages/shared/types/post-reference.ts`), et la note laissée alors demandait
de ne pas resserrer le motif **à l'aveugle**, son intention n'étant pas
documentée. Voici la mesure qu'elle réclamait :

- **aucun** fichier `post-*` à la racine : l'intention supposée n'a aucun sujet ;
- les **seuls** fichiers ignorés étaient mes trois témoins ;
- des **dizaines** de sources suivies portent déjà un basename `post-…`, qui
  survivent parce qu'elles sont dans l'index — mais tout fichier NEUF à côté
  d'elles était masqué.

Ancré en `/post-*`. La négation de 2026-08-19 est conservée bien que redondante :
elle redeviendrait la seule garde si quelqu'un désancrait le motif.

> **Un gate qui ment le fait rarement en rougissant à tort ; il le fait en ne
> voyant pas ce qui n'est pas là.** Un témoin absent, un fichier non suivi, une
> suite non enregistrée : trois formes du même angle mort, et aucune ne se
> signale. La seule défense est de regarder ce que le commit CONTIENT, pas ce
> que la suite rend.

## Ce que ce lot ouvre

- **#20458** — poser un blocage n'évince d'aucune room de post, alors que le
  retrait d'une publication le fait déjà (`socketsLeave`, le SEUL du dépôt sur
  une room de post) et pour le danger exactement analogue. L'exclusion garde
  l'instant ; l'éviction garderait la durée, y compris les familles qu'un lot
  futur ajouterait sans y penser. L'issue #20430 affirmait qu'aucun
  `socketsLeave` n'existait : mesuré faux.
- **#20443**, **#20414**, **#20415**, **#20393** — inchangés.
