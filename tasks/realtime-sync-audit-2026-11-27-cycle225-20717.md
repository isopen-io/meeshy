# Cycle 225 — le verdict de LECTURE d'une publication lit le blocage (#20717)

**Date** : 2026-11-27 · **Branche** : `claude/exciting-planck-r9och7` · **Issue** : #20717

## Ce que ce cycle ferme

Une **délégation écrite qui désignait un domicile vide**.

`services/gateway/src/services/posts/viewerAudience.ts` porte depuis #7184 une
décision commentée sur le site :

> LE BLOCAGE N'EST PAS POSÉ ICI, ET C'EST UNE DÉCISION (#7184). […] Le blocage
> des accès unitaires appartient donc à `canUserConsumePost`, et c'est un lot à
> part.

Mesuré : **`postVisibility.ts` ne portait aucune lecture de blocage.** Les deux
moitiés de la phrase étaient vraies du code — le filtre ne posait pas la règle,
et le délégataire ne l'avait jamais reçue.

> **Une délégation ÉCRITE se vérifie chez le DÉLÉGATAIRE.** C'est la forme sous
> laquelle une règle devient le plus durablement invisible : chaque moitié
> renvoie à l'autre, et les deux disent vrai. Un commentaire qui ÉNONCE une
> contrainte est une affirmation (cycle 94) ; un commentaire qui DÉLÈGUE une
> contrainte en est deux, et c'est la seconde que personne n'ouvre.

Huit portes gouvernées par ce verdict s'ouvraient à un lecteur séparé dès que la
publication était `PUBLIC` : `post:join` et sa salle temps réel,
`post:reaction-request-sync`, le fil de commentaires, le favori, l'impression,
le partage, la réponse à une story, l'éligibilité d'une notification, le verdict
de modération, et `GET /posts/:postId`. Les trois portes VOISINES — commenter
(`commentHome:69`), réagir (`PostReactionService:141`), republier
(`contentAuthorBlock`) — et le fil de LISTE (`feedVisibility:63`) l'appliquaient
depuis longtemps, chacune par `isBlockedWithAny`, chacune fermée sur l'échec.

### CORRECTION (audit adversarial du lot, le jour même) — `GET /posts/:postId` n'est PAS fermé

L'énumération ci-dessus comptait `GET /posts/:postId` parmi les portes fermées.
**Mesuré faux**, et vérifié deux fois :

- `PostService.ts` n'importe de `postVisibility` que `isEphemeralPostType` et
  `RepostPassage` — il n'appelle **aucun** verdict de consommation ;
- son filtre est `buildViewerVisibilityFilter`, qui passe `blockedAuthorIds = []`
  (`viewerAudience.ts:44`), et `buildPostVisibilityOrFilter` court-circuite sur
  une liste vide (`postVisibility.ts:165` : `if (blockedAuthorIds.length === 0)
  return audience;`).

Restent donc ouverts à un lecteur séparé : **lire la publication**
(`GET /posts/:postId`), **compter une vue** (`recordView`, qui le fait en outre
APPARAÎTRE dans la liste des vues de l'auteur), **télécharger ses médias**
(`recordMediaDownloads`) et `recordEngagementBatch`.

> **Le lot a commis, dans son propre commit, l'erreur dont il est le correctif.**
> Il a mesuré qu'une délégation écrite désignait un domicile vide — puis a
> compté parmi ses portes fermées une porte qui ne visite pas ce domicile, sur
> la foi de la même délégation. Et il ÉCARTE explicitement, dans ses
> alternatives, la seule modification qui l'aurait fermée (« poser le blocage
> dans `buildViewerVisibilityFilter` »), tout en affirmant fermée la porte
> qu'elle sert : les deux phrases vivent dans le même fichier.
>
> C'est mot pour mot la mise en garde du `CLAUDE.md` de la passerelle —
> *« écrire une règle ne l'applique pas au lot qui l'écrit : la relire contre
> son propre diff est une étape, pas une évidence »* — et c'est la seconde fois
> que le dépôt la paie au même endroit.

**Et le commentaire fautif de `viewerAudience.ts` n'est PAS réparé par ce lot** :
il continue de nommer `getPostById`, `recordView` et `deletePost` comme les
accès unitaires dont `canUserConsumePost` porte le blocage — trois accès qui ne
l'appellent jamais. La délégation est désormais plus CRÉDIBLE qu'avant, puisque
le délégataire applique enfin la règle : c'est un piège aggravé, pas réduit.

Périmètre réel de ce lot : les portes qui passent par `canUserConsumePost`,
`canUserConsumeThread`, `mayConsumePost`, `resolveConsumptionTarget`,
`filterConsumablePostIds` et `consumablePostAuthors`. Suivi : **#20720**.

## Comment il a été trouvé — en instruisant un suivi, pas en cherchant un défaut

Le cycle 223 avait laissé #20458 (« poser un blocage n'évince d'aucune room de
post »). En l'instruisant, deux mesures ont changé le lot :

1. **Le lot de #7416 existe, il est AUDITÉ, et il est PERDU.** Son commentaire du
   2026-11-25 décrit `socketio/postRoomAccess.ts`, 12 témoins, `tsc` vert, et une
   fusion à blanc sur `origin/dev` sans conflit — « commit local, **non
   poussé** ». Le fichier n'existe pas sur `dev` (mesuré), le SHA `bf72ca4c6e`
   n'est joignable par aucune ref distante, et le conteneur qui le portait est
   réclamé. Un lot de sécurité relu a disparu faute d'un `git push` — la doctrine
   « la branche poussée tôt » (#5243) est écrite pour exactement ça, et elle se
   paie au moment où on ne la suit pas.
2. **L'éviction que #20458 demande ne garde rien tant que la porte réadmet.**
   Le commentaire de #7416 le dit lui-même : « le verdict rejoué, c'est celui de
   la LECTURE (`canUserConsumePost`), qui ne lit pas le blocage sur un post
   PUBLIC ». Évincer un lecteur d'une salle dont `post:join` le réadmet ne garde
   que l'instant — or l'instant est déjà gardé par l'exclusion à l'émission
   (#20430). **L'éviction sans la porte est net-nulle.**

> **Un suivi hérité est une AFFIRMATION** (cycle 107), et l'instruire déplace le
> lot plutôt que de le confirmer. Ici elle l'a déplacé en AMONT : la question
> n'était pas « comment faire sortir ceux qui sont entrés ? » mais **« qu'est-ce
> qui les laisse entrer ? »**.

## Le correctif

`canUserConsumePost` lit la séparation, **avant** l'audience — une séparation
refuse quelle que soit la visibilité, et il n'y a rien à apprendre du graphe
d'un lien qu'un blocage vient de couper. À frais neufs : un verdict de lecture
est une AUTORISATION, et le cache de `separatedRooms.ts` déclare explicitement
ne servir que des AUDIENCES.

**La séparation est une question par LECTEUR, pas par publication**, et c'est ce
qui décide la forme. `consumablePostAuthors` est appelé à chaque défilement sur
jusqu'à cinquante publications, et son en-tête promet qu'« un post PUBLIC ou
dont on est l'auteur ne coûte aucune requête de plus ». Il lit donc l'ensemble
UNE fois pour tous les auteurs distincts (`getBlockedUserIdsAmong`, deux
requêtes bornées) et le passe au verdict. Une garde juste qui coûte N requêtes
sur un chemin de défilement est une lenteur, donc un bug.

**La POLARITÉ du paramètre est la moitié de sa raison d'être.** `separatedAuthorIds`
est optionnel, et son ABSENCE fait LIRE. Ce n'est pas le « paramètre dont
l'absence désactive une garde » que le dépôt refuse : omettre coûte une requête
de plus, jamais une règle de moins — et c'est le motif que `feedVisibility.ts`
emploie déjà pour la même valeur.

Le verdict d'INTERACTION n'est pas touché, et un témoin gèle la frontière :
l'asymétrie « voir ⊇ interagir » (2026-07-08) reste, et ses appelants portent
déjà leur lecture de blocage — y ajouter la règle ferait payer deux lectures aux
deux chemins les plus chauds du dépôt.

## Le 0 ROUGE qui disait « ma mutation ne casse rien »

La mutation « l'auteur n'est plus exempté » (retrait de
`if (authorId === userId) return false`) a rendu **0 rouge**, et le témoin qui
prétendait la garder était vert.

La cause n'était pas un témoin faible : **`isBlockedWithAny` filtre lui-même les
ids égaux à l'acteur**, donc la mutation ne changeait AUCUN comportement. Le
témoin assertait « aucune lecture de séparation » — ce qui restait vrai, par le
court-circuit du collaborateur.

> **Devant un 0, vérifier d'abord que la mutation CASSE quelque chose**
> (cycle 223). Mais il y a une suite : quand elle ne casse rien, la question
> n'est pas « faut-il retirer la ligne ? » — c'est **« où cette ligne
> décide-t-elle SEULE ? »**. Ici c'est le chemin du LOT : si l'ensemble fourni
> contenait l'auteur, le verdict refuserait à quelqu'un son PROPRE contenu.
> `getBlockedUserIdsAmong` ne le produit pas aujourd'hui — et c'est exactement
> pourquoi l'invariant doit vivre À LA PORTE plutôt que dans la discipline de
> ses appelants. Le témoin réécrit sur ce chemin fait tomber la mutation.

## Les dix rouges de harnais qui ont PROUVÉ le câblage

Poser la garde a fait rougir **10 témoins existants dans 4 suites** — tous parce
que leur double Prisma n'avait pas de délégué `user`, donc la lecture levait et
la garde refusait (fermée sur l'échec). Ces rouges sont la meilleure preuve de
câblage du lot : ils nomment un par un les chemins que le verdict gouverne
réellement — `post:join`, `handleRequestSync`, `resolveConsumptionTarget`, le
compteur d'impressions, la porte de favori.

Un des quatre méritait un regard de plus : sur
`postConsumptionGate-malformed-id.test.ts`, c'est le **contrôle POSITIF** du
témoin d'identifiant malformé qui tombait (« admet un post public bien formé »).
Sans le délégué, il aurait passé pour un échec de la règle d'identifiant.

> **Un double PARTIEL perd en silence ce que le module GAGNE** (cycle 93), et la
> perte se signale d'autant plus tard que le double est vieux. Les quatre ont
> été PROLONGÉS — un délégué `user` qui sert « aucun blocage », le cas nominal
> de ces témoins — jamais remplacés, et chacun porte sur place la raison de sa
> présence, pour que le prochain lecteur sache que le retirer ferme la porte au
> lieu de l'ouvrir.

## Preuve

19 témoins neufs ; `tsc --noEmit` passerelle : 0.

| mutation | ce qui tombe |
|---|---|
| la garde retirée de `canUserConsumePost` | 10 |
| l'ensemble fourni ABSENT vaut « non séparé » (garde désarmée) | 8 |
| fail-OPEN sur l'échec de lecture | 1 |
| l'auteur n'est plus exempté à la porte | 1 |
| la passe unique du lot retirée (le verdict lit lui-même) | 1 |
| le lot sert le reste quand la lecture échoue (fail-closed partiel) | 1 |

## Ce que ce lot ouvre

- **#20458 est à RÉDUIRE, pas à livrer tel quel.** Son critère de fin demandait
  « un témoin que `post:join` refuse le retour tant que le blocage tient » :
  c'est fait ici. Ce qui reste est l'ÉVICTION, et elle appartient au module de
  #7416 — qui n'existe plus.
- **#7416 est à REFAIRE.** Le lot audité du 2026-11-25 n'a jamais été poussé.
  Son commentaire décrit assez précisément le module (`fetchSockets` à travers
  l'adaptateur, lecteur lu dans sa room `user:<id>`, fail-closed sur un socket
  sans identité, les trois points de câblage) pour servir de spécification.
- **#20576** — les quatre façons de perdre l'accès qui ne rejugent pas les
  salles — reste intégralement ouvert, et dépend de #7416.
- **La branche de secours d'un lot non poussé n'existe pas.** À verser aux
  leçons : un lot de sécurité relu et prouvé a coûté une session entière pour
  rien. La doctrine #5243 demande de pousser AVANT d'écrire la logique ; ce
  cycle-ci l'a fait, et c'est la seule raison pour laquelle il survivrait à une
  coupure.
- **#20204**, **#20461**, **#20443**, **#20414**, **#20415**, **#20393** —
  inchangés.
