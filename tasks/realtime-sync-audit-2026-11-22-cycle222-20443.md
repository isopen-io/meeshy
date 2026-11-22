# Cycle 222 — `story:viewed` ne nomme plus personne (#20443)

**Date** : 2026-11-22 · **Branche** : `claude/exciting-planck-ohtvh6` · **Issue** : #20443

## Le défaut, et ce qui le rendait invisible

#20429 (cycle 221) a fermé `story:viewed` contre le **blocage**, dans les deux
sens, et son audit adversarial a trouvé dans le même mouvement que la même
donnée est gardée **plus strictement ailleurs** : la jumelle DURABLE de cet
événement — la liste « Vu par » servie au MÊME auteur — ne nomme un viewer que
si le niveau effectif de la paire atteint `views.identity` (**Communauté**), et
agrège tous les autres dans `publicViewCount`
(`services/gateway/src/services/posts/namedViewers.ts`).

Le DIRECT était donc strictement plus FAIBLE que le DURABLE, sur la charge la
plus nominative des huit familles d'activité — la seule qui porte un **pseudo**
en plus d'un id. Vecteur : A publie une story `PUBLIC`, B n'a aucune relation
avec A et aucun blocage, B ouvre la story ⇒ `story:viewed` part vers `feed:A`
avec l'id **et le pseudo** de B, que le REST anonymisait dans `publicViewCount`.

**Ce qui l'a tenu invisible un cycle entier** : le témoin de #20429 « un blocage
qui ne concerne PAS le viewer ne tait pas l'auteur » figeait ce cas comme
CORRECT. Il l'était — au regard de la loi du blocage. La loi applicable était
l'autre.

> **Deux lois peuvent gouverner la même donnée, et un témoin ne connaît que
> celle qu'on lui a nommée.** La question qui l'attrape n'est pas « cette garde
> est-elle posée ? » ni même « est-elle juste ? », mais **« la jumelle DURABLE
> de cette diffusion garde-t-elle la même donnée sous la même loi ? »** — car
> le direct et le durable servent le MÊME champ au MÊME lecteur, et c'est le
> plus FAIBLE des deux qui décide de ce qui fuit.

## La décision : retirer la DONNÉE, pas aligner la GARDE

L'issue laissait les deux branches ouvertes. Le choix est **« il ne nomme plus
personne »**, et il repose sur trois mesures, pas sur un goût.

**1. Aucun client ne lit ces deux champs** — remesuré dans ce lot, pas hérité de
l'issue :

| client | ce qu'il lit de `story:viewed` |
|---|---|
| web | son type de garde `isStoryViewedEvent` n'exige QUE `storyId` et `viewCount` (`publication-views-realtime.ts`) ; l'écouteur invalide ensuite `storyViewersQueryKey`, donc relit le REST, qui est gardé |
| iOS | `StoryTrayRules.applyViewed` → `storyId`, `viewCount` · `PublicationViewersSheet` → `storyId` |
| Android | `SocketEventNames.STORY_VIEWED` est DÉCLARÉ et n'a **aucun abonné** — la constante est sa seule occurrence hors tests |

**2. Aligner coûterait une lecture APRÈS l'écriture, pour un champ que personne
n'affiche.** `pairAccessAmong({ feature: 'views.identity' })` exige l'id de
l'AUTEUR, qui ne vient que de `getPostById` — donc **après** `recordView`. La
garde se poserait exactement dans l'`await` que la propriété d'ordre de #20429
refuse d'élargir (fenêtre de réordonnancement d'un compteur ABSOLU, #20414), sur
le chemin le plus chaud du social, par auteur distinct du lot.

**3. Le dépôt a un précédent exact** : #14319 — « une traduction en clair n'a
rien à faire dans une charge que personne n'affiche ». Et retirer ferme les
**deux** écarts (blocage ET cercle) en supprimant le besoin de la garde.

## La rétrocompatibilité est la moitié du lot (#9223)

Un retrait SEC était impossible, et c'est mesuré :
`SocketStoryViewedData` (`packages/MeeshySDK/.../SocialSocketEvents.swift:65-70`)
déclare `viewerId: String` et `viewerUsername: String` **non optionnels**.
Omettre les clés ferait échouer le décodage de l'événement **ENTIER** sur tout
client déployé — emportant `viewCount`, **le seul champ que les clients lisent**.
C'est le mécanisme du cycle 128 (un décodeur STRICT rend le rétrécissement plus
cher qu'il n'y paraît), par le plus discret des chemins : un `catch` de décodage
silencieux.

Les deux clés **restent donc présentes, à la chaîne vide**. Aucune identité ne
voyage ; aucun décodeur ne casse.

## Le type LITTÉRAL `''` porte les DEUX moitiés de la décision

C'est le point de conception du lot. `readonly viewerId: ''` interdit
simultanément :

| mutation | ce que le compilateur rend |
|---|---|
| remettre une identité (`viewerId: actor.userId`) | **TS2322** — `Type 'string' is not assignable to type '""'` |
| retirer les clés (bascule sèche) | **TS2345** — `missing the following properties: viewerId, viewerUsername` |

Les deux sont portés par le `tsc` de la passerelle, **bloquant en CI** depuis le
cycle 105 bis. Un `viewerId?: string` optionnel n'aurait tenu ni l'une ni
l'autre : il autorise l'identité ET l'omission. `ANONYMOUS_STORY_VIEWER`
(`packages/shared/types/post.ts`) est le site unique qui compose la paire — un
producteur la RÉPAND, il ne l'écrit pas, et il n'a aucune identité à aller
chercher.

## Le `username` de l'acteur est retiré, pas laissé en place

`SocialEventsActor` portait `username`, et ce site était son **unique lecteur**
du dépôt. Trois sites le CONSTRUISAIENT (`routes/social/events.ts`,
`routes/posts/impressions.ts`, `routes/posts/interactions.ts`), zéro le lisait
après ce lot.

> **Un champ en écriture seule qui porte une identité n'est pas neutre : c'est
> une invitation.** Le laisser sur l'acteur, à portée de la couche de diffusion,
> c'est laisser le prochain lot le remettre sur un fil sans qu'aucun témoin ne
> tombe. La seule façon de ne pas renommer le viewer est de ne pas transporter
> son nom jusque-là. Même famille que « un champ de protection présent au modèle
> et absent de toute requête est un piège armé » (cycle 125), dans l'autre sens.

## Le gate de #20429 RESTE, et sa raison change

La raison qui l'a motivé — une charge nominative — a disparu. Le gate reste,
pour une raison qu'il faut écrire parce qu'elle n'est plus la même : **le MOMENT
où un compteur bouge est lui-même un signal d'activité**, et c'est la définition
des huit familles de #20338. Une personne bloquée ne doit pas faire bouger le
compteur que l'auteur regarde en direct.

Ce lot ne retourne donc pas une décision livrée la veille ; il est **monotone** —
strictement moins de données qu'avant, sur strictement les mêmes conditions.

## Le témoin qui serait devenu VACUEUX, et ce qu'il est devenu

`story-viewed-separe-20429.test.ts` portait « ni l'id NI LE PSEUDO du viewer ne
partent quand un blocage sépare », assert sur la CHARGE. La charge ne les
portant plus, ce témoin serait resté **VERT sous n'importe quel fail-open** — il
aurait attesté la décision de CE lot au lieu de la garde de l'autre.

Il est réécrit sur ce que le handler **DÉCIDE** : `expect(emissions).toHaveLength(0)`
— rien ne part, sur aucune room, pas même la charge anonyme et son compteur.
Forme strictement plus forte, et qui tombe toujours.

> **Anonymiser une charge peut rendre VACUEUX un témoin de non-fuite posé sur
> elle.** Le lot qui retire la donnée hérite donc de tous les témoins qui
> l'exerçaient : chacun doit être relu pour savoir s'il atteste encore quelque
> chose, ou s'il n'atteste plus que le correctif qui vient de le vider. Même
> famille que « un témoin de retrait ne peut pas vivre derrière le sérialiseur
> qui supprime déjà la clé », avec l'inversion : ici c'est le CORRECTIF, et non
> le sérialiseur, qui rend le témoin muet.

Le `charge()` du harnais a suivi pour la même raison : un double qui compose une
charge nominative atteste **un contrat que plus aucun émetteur ne respecte**.

## Preuve

RED prouvé AVANT la correction : 2 rouges, nommant exactement le vecteur de
l'issue (`viewerId` et `viewerUsername` sur le fil pour un viewer `PUBLIC` sans
blocage). Le troisième témoin neuf — « sert TOUJOURS le compteur » — était VERT
avant comme après : c'est un témoin de NON-RÉGRESSION, et le dire évite de le
compter comme une preuve de correction.

| mutation | ce qui tombe |
|---|---|
| remettre l'identité sur la charge | **3 rouges** (les 2 nouveaux + l'alias REST) **et** `tsc` TS2322 |
| retirer les clés (bascule sèche) | **2 rouges** (dont « les DEUX clés PRÉSENTES ») **et** `tsc` TS2345 |

Trois témoins neufs sur le producteur (dans le harnais de route EXISTANT, qui
exerce la vraie route) : le vecteur, la présence des clés, et le compteur.

**Le SECOND producteur s'est signalé tout seul** : `POST /posts/:postId/view`
(l'ALIAS qui délègue à `ingestSocialEvents`) portait son propre témoin
assertant `viewerId: USER_ID`. Le cycle 221 avait établi que le producteur est
unique ; il l'est — mais sa SURFACE ne l'est pas, et c'est le témoin de l'alias
qui l'a rappelé. Converti en témoin #20443.

`tsc --noEmit` (gateway) : **0**. Suite gateway COMPLÈTE : voir le commentaire
de clôture de l'issue. Suite web `publication-views-realtime` : 5/5.

## Ce que ce lot ouvre, et ne corrige pas

- **#20453** — le RETRAIT des deux clés : rendre les décodeurs tolérants
  (`viewerId: String?` sur iOS, l'optionnel côté type partagé), mesurer les
  versions déployées, puis retirer les clés du fil. Ce lot a fait l'étape 1 sur
  trois ; les deux autres attendent une mesure de parc, pas un cycle.
- **#20414**, **#20415**, **#20440** — les trois suivis du cycle 221, intacts.
