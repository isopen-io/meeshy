# Cycle 223 — `story:viewed` ne nomme plus personne (#20443)

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
| Android | **s'y abonne** (`SocialSocketManager.kt:303` → `_storyViewed`) et son unique collecteur lit `storyId` + `viewCount` (`StoriesViewModel.kt:173`) ; son `SocketStoryViewedData` ne DÉCLARE pas `viewerUsername` |

> **Cette ligne a d'abord été publiée FAUSSE, et c'est la mesure qui l'a
> corrigée, pas une relecture.** Le premier relevé disait « Android déclare le
> nom de l'événement sans y abonner aucun décodeur » : un `grep STORY_VIEWED`
> tronqué par `head -10` sur une liste que les fichiers de test dominaient (dix
> correspondances `MARK_STORY_VIEWED`, un OutboxKind sans rapport) n'avait rendu
> que la déclaration de la constante. **Un `head` sur un relevé d'exhaustivité
> transforme une propriété du dépôt en propriété de la commande** — exactement
> la leçon 261, par l'instrument le plus banal qui soit. Le second relevé, sans
> `head` et ancré sur `SocketEventNames.STORY_VIEWED`, a rendu l'abonné en une
> ligne.
>
> La conclusion du lot ne change pas — **aucun client ne LIT ces champs** — mais
> la raison de garder les clés se renforce : ils sont désormais DEUX à exiger
> leur présence, et le second le fait par une mécanique différente.

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

Un retrait SEC était impossible, et c'est mesuré. **DEUX clients déployés
exigent la PRÉSENCE de `viewerId`, chacun par sa propre mécanique** :

| client | la déclaration | ce qu'une clé absente produit |
|---|---|---|
| iOS | `SocketStoryViewedData` (`MeeshySDK/.../SocialSocketEvents.swift:65-70`) — `viewerId: String`, `viewerUsername: String`, non optionnels | `Decodable` échoue ⇒ événement ENTIER perdu |
| Android | `SocketStoryViewedData` (`core/model/.../SocketEvents.kt:751`) — `viewerId: String` **sans défaut** (et `viewerUsername` non déclaré du tout) | `MissingFieldException` de kotlinx ⇒ événement ENTIER perdu |

Dans les deux cas, ce qui part avec l'événement est `viewCount` — **le seul champ
que ces deux clients lisent**. C'est le mécanisme du cycle 128 (un décodeur
STRICT rend le rétrécissement plus cher qu'il n'y paraît), par le plus discret
des chemins : un `catch` de décodage silencieux.

> **Ne pas LIRE un champ et ne pas EXIGER sa présence sont deux propriétés
> distinctes, et c'est la SECONDE qui interdit la bascule sèche.** Le relevé
> « qui lit ces champs ? » autorise le retrait de la VALEUR ; seul le relevé
> « qui exige cette CLÉ ? » décide du retrait de la clé. Un lot qui ne pose que
> la première question conclut « personne ne s'en sert, je retire » — et casse
> les deux clients qui ne s'en servaient effectivement pas.

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

## Ce que l'audit adversarial a changé

**Verdict : non bloquant.** Il a reproduit les deux cliquets de type
(`TS2322` / `TS2345`, exit 2 dans les deux sens) et fait tomber le témoin
réécrit (fail-open du handler ⇒ 5 rouges sur 8). Six constats, dont deux de la
famille exacte que le doc-comment de ce lot dénonce.

**La portée du cliquet n'était pas écrite, et c'est là que deux harnais ont
survécu.** `services/gateway/jest.config.json` amnistie `2322` et `2345` dans
`ignoreCodes` — EXACTEMENT les deux codes que ce lot publie comme sa garde — et
`tsconfig.json` exclut `__tests__`. **Aucun fichier de test n'est tenu par ce
type.** Et un `as any` sur l'argument remis au diffuseur passe le compilateur :
`sweepErasingEmitArgumentCasts` ne garde que les arguments de `.emit(`. Ce qui
retient ce trou est un témoin de COMPORTEMENT, pas un type.

> **Un cliquet dont la portée n'est pas écrite se lit comme une garde
> complète.** Celui-ci est juste et son énoncé était littéralement exact — « le
> `tsc` de la passerelle les porte » — ce qui le rendait d'autant plus
> trompeur : rien dans la phrase ne disait où il NE porte pas, et c'est
> précisément là que vivaient les deux résidus ci-dessous.

**Deux familles de harnais attestaient le contrat que ce lot déclare mort** —
dont les quatre sites web, sans aucune pression du compilateur (charges `unknown`
ou non annotées, `tsc apps/web` à 0) : ce sont ceux qu'un prochain lot aurait
copiés. Anonymisés, avec la raison écrite sur place.

**Et un témoin de la passerelle portait le NOM du code que ce lot a supprimé.**
`interactions.views.test.ts` ouvrait un bloc « STORY viewer has no username uses
`?? empty string` (line 279) » qui n'assertait qu'un `statusCode === 200` — le
`?? ''` est parti avec le `username` de l'acteur, et le témoin est resté VERT en
passant par le chemin nominal. Ce qu'il peut attester a survécu au retrait et
vaut mieux : **un acteur SANS pseudo diffuse la même charge anonyme que les
autres.** Il assert désormais sur le couple remis au diffuseur.

> Trois règles maison d'un coup : « un témoin d'écriture assert sur l'EFFET,
> jamais sur le statut », « une clé de ligne dérive à la première édition » (le
> `(line 279)` du titre était déjà faux), et le journal de ce lot affirmait
> « zéro lecteur après ce lot » — vrai de la PRODUCTION, **non balayé dans les
> tests**. Un relevé de lecteurs qui s'arrête à `src/` ne dit rien des harnais,
> et ce sont les harnais qui propagent une forme morte.

**Une jambe de la justification était surévaluée, et elle est retirée.** Ce lot
écrivait que l'alignement sur `views.identity` aurait « élargi la fenêtre de
réordonnancement de #20414 ». Mesuré : cette fenêtre PRÉEXISTE et elle est déjà
large — `applyViews` appelle la diffusion DANS sa boucle, et chaque appel y fait
déjà `getPostById`, que son propre doc-comment nomme « la lecture LOURDE du
détail ». Une lecture `pairAccess` de plus est marginale devant celles-là : le
coût réel est un coût de **DÉBIT**, pas d'ordonnancement. La décision tient sur
ses deux autres jambes — aucun lecteur mesuré, et le précédent #14319.

> **C'est la faute du cycle 221 sous sa forme douce** : une justification
> publiée plus forte que ce qu'elle mesure. Le commentaire voisin, écrit par
> #20429, la contredisait déjà noir sur blanc douze lignes plus haut
> (« cette fenêtre PRÉEXISTE et ce lot ne la ferme pas »). **Une affirmation de
> coût se mesure contre ce que le site paie DÉJÀ**, et le paragraphe qui le
> disait était sous mes yeux.

**Les quatre axes sur lesquels l'audit n'a RIEN trouvé**, dits parce qu'un
silence se lit comme un angle mort : aucune autre identité sur un fil temps réel
de story (`feed:<id>` n'est rejointe que par son propriétaire, un seul `join` du
dépôt ; les sept autres familles de #20338 ne portent qu'un acteur de geste
délibéré et **n'ont aucune jumelle REST plus stricte** — `views.identity` est la
SEULE feature d'identité de `RELATION_FEATURE_MIN_LEVEL`, donc l'asymétrie que
ce lot ferme n'a pas de sœur) ; la chaîne vide jamais prise pour une identité
(aucune carte clé par viewer, aucun `== selfId` alimenté par cette charge, aucun
chemin push ni service worker, aucun journal qui imprime la charge) ; aucun
autre lecteur de `SocialEventsActor.username` (l'acteur n'est jamais étalé — le
relais V2 le reconstruit explicitement) ; et aucune perte produit (les deux
clients qui affichent la liste la RELISENT sur l'événement, donc les noms
viennent du REST gardé, et ils en venaient déjà).

**Ce que l'audit n'a PAS pu vérifier, et qui reste donc raisonné** : aucune
compilation iOS ni Android dans ce conteneur — les deux affirmations sur les
décodeurs sont LUES dans les sources ; et le PARC déployé n'est mesuré par
personne (#20453 le reconnaît).

## Ce que ce lot ouvre, et ne corrige pas

- **#20453** — le RETRAIT des deux clés : rendre les décodeurs tolérants sur
  les DEUX clients qui exigent la clé (`viewerId: String?` sur iOS,
  `viewerId: String? = null` sur Android, l'optionnel côté type partagé),
  mesurer les versions déployées, puis retirer les clés du fil. Ce lot a fait l'étape 1 sur
  trois ; les deux autres attendent une mesure de parc, pas un cycle.
- **#20457** — iOS pose `isViewed = true` à chaque `story:viewed`, un événement
  qui ne part JAMAIS pour soi : la story de l'auteur se marque « vue » dès qu'un
  TIERS l'ouvre, et descend au tri. Relevé par l'audit, hors périmètre. Et la
  réparation n'est pas de comparer le viewer à soi — ce test aurait toujours été
  vrai, même avant ce lot : **la ligne n'est pas mal gardée, elle n'a pas lieu
  d'être.**
- **#20414**, **#20415** — deux des trois suivis du cycle 221, intacts.
  **#20440 est LIVRÉ** par une autre session pendant ce lot (le socle de
  diffusion quitte `SocialEventsHandler`), et c'est elle qui a pris le numéro de
  cycle 222 : ce journal est le 223.
