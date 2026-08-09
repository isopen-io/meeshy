# Cycle 33 — Les cycles précédents ont câblé « le transport primaire d'iOS ». Aucun n'avait câblé celui d'iOS.

Le « Reste ouvert » du cycle 32 proposait la file d'attente de fan-out, sous réserve que « rien de
plus grave n'apparaisse ». Quelque chose de plus grave est apparu, à l'étage d'en dessous : les
obligations d'une édition de message dépendent encore du transport employé — et les deux transports
que les clients emploient RÉELLEMENT sont ceux qui n'en portent aucune.

## Le décompte

L'édition d'un message a **quatre** points d'entrée. Ce qu'ils faisaient avant ce cycle :

| entrée | fichier | liens traçables | mentions | qui l'appelle |
|---|---|---|---|---|
| socket `message:edit` | `MessageHandler` | oui | oui | web (composer) |
| `PUT /conversations/:id/messages/:messageId` | `messages-advanced.ts` | oui | oui | **personne** |
| `PUT /messages/:messageId` | `routes/messages.ts` | **non** | **non** | **iOS** (`MessageService.editMessage`) |
| `PATCH /messages/:messageId` | `messages-advanced.ts` | **non** | **non** | **web** (`messages.service.ts`) |

Les deux unités partagées existaient déjà, écrites par les cycles précédents, et elles étaient
justes. Elles avaient simplement été branchées sur la mauvaise route. Deux commentaires — dans
`emitMentionCreated.ts` et dans `messages-advanced.ts` — désignaient « le transport PRIMAIRE du
client iOS, qui édite via `PUT /messages/:id` » **au-dessus du câblage de
`PUT /conversations/:id/messages/:messageId`**. Le chemin nommé et le chemin câblé n'étaient pas
le même. Le commentaire, lui, se lisait comme une preuve que le trou était fermé.

## Ce que l'utilisateur voyait

Éditer « salut @alice » en « salut @bob » **depuis un iPhone** : Alice reste mentionnée (ligne
`Mention`, `validatedMentions`, inbox `/mentions`, surlignage), Bob n'est nommé nulle part, ne reçoit
ni notification ni `mention:created`. Le même geste depuis le composer web (socket) fait tout
correctement. Idem pour `[[url]]` : envoyé, le texte produit un lien traçable ; **édité** depuis iOS
ou depuis `messages.service.ts`, les crochets restent en dur dans le message, définitivement.

## Lot A — `PUT /messages/:messageId`, le transport d'iOS

`processExplicitLinks` AVANT l'écriture, `reconcileEditedMentions` + `emitMentionCreated` après, et
le contenu traité devient le SEUL en circulation : base, mentions, retraduction, payload diffusé.

Une différence assumée avec le sibling PUT : la réconciliation précède le `findUniqueOrThrow` de
relecture. Elle écrit `validatedMentions` en base, donc la relecture rend l'état réconcilié sans
recopiage conditionnel — et quand elle n'a RIEN pu établir, la ligne porte toujours la valeur
précédente, qui est la bonne. Le garde-fou `if (reconciled)` du sibling existe parce qu'il tient un
objet rendu par l'écriture ; ici il n'y a rien à garder.

La réconciliation est bien APRÈS le `updateMany` gardé : un `DELETE` concurrent rend `count === 0`,
la route répond 404 et ne réconcilie rien sur un message que le client a déjà retiré.

## Lot B — `PATCH /messages/:messageId`, le transport du web

Même traitement, avec le garde-fou `if (reconciled)` du sibling puisqu'il tient lui aussi l'objet
rendu par `update`.

## Lot C — le `content.trim()` qui plantait sur le seul cas que la garde autorise

`content` est OPTIONNEL dans `UpdateMessageBodySchema`, et l'omettre est précisément la façon de
retirer la légende d'un message à pièce jointe — un cas que la garde d'entrée autorise
explicitement (`(!content || …) && !messageHasAttachments`). L'écriture faisait ensuite
`content.trim()` : TypeError, traduit en 500 par le catch. Le seul cas explicitement permis était le
seul que l'écriture ne savait pas traiter. `content?.trim() ?? ''`.

## Lot D — les commentaires qui nommaient la mauvaise route

Corrigés aux deux endroits, et `broadcastMessageMutation.ts` — dont l'affirmation était JUSTE, elle,
puisque cette unité-là est bien câblée sur `routes/messages.ts` — reçoit le chemin complet, l'ambiguïté
entre les deux `PUT` étant exactement ce qui a permis la confusion. La leçon du 2026-08-07 (3) — « une garantie énoncée dans un commentaire
n'est pas une garantie du système » — se double ici d'un corollaire : un commentaire qui nomme le
chemin qu'il ne câble PAS ne se contente pas de ne rien garantir, il **détourne activement** le
prochain audit. Les cycles suivants ont relu ces lignes et conclu que le cas iOS était traité.

## Vérification

- **10 tests neufs**, **8 rouges observés** avant correctif :
  - `message-edit-mention-parity.test.ts` (6, dont 5 rouges) — réconciliation, `mention:created` aux
    seuls entrants, traitement des liens avant écriture, contenu traité en circulation unique,
    légende retirée sans 500 ; plus le cas qui doit RESTER muet (course de suppression : `count === 0`
    → 404 et aucune réconciliation).
  - `conversation-messages-advanced.test.ts` (4, dont 3 rouges) — mêmes obligations sur le PATCH, plus
    le `validatedMentions` qui ne doit PAS être écrasé quand la réconciliation n'établit rien.
- **Suite gateway complète : 613 suites, 15 799 tests, tout vert.** `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Quatre points d'entrée pour une édition, dont un que personne n'appelle**
  (`PUT /conversations/:id/messages/:messageId`). Les quatre partagent désormais les mêmes unités,
  mais chacun réimplémente ses propres gardes de permission — et elles DIVERGENT : le PATCH n'a pas
  la fenêtre de 24h ni le bypass modérateur, le `PUT /messages/:messageId` filtre par
  `sender: { userId }` (donc aucun bypass du tout). **Tête du prochain cycle** : une seule unité
  d'admission à l'édition, nommée, plutôt que quatre tests d'admission qui ont déjà prouvé qu'ils
  dérivent. C'est le motif exact des cycles 30-31, un étage plus bas.
- **La file d'attente de fan-out** (héritée du cycle 32, D1). La troncature est mesurable depuis le
  cycle 32 ; il faut regarder ce qu'elle mesure avant de choisir.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas.
- **`@Display Name` reste inextractible dans le domaine social** — septième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29.

---

# Cycle 32b — Addendum d'une session parallèle

Deux sessions ont livré le cycle 32 en parallèle, sur la même tête (« la troncature est muette »).
Le cycle 32 ci-dessous est **le plus large** — il porte en plus les lots B et C sur les défauts
permissifs — et sa forme sur la troncature est la meilleure sur deux points, gardés tels quels :
le type nommé (`FanoutBucket` / `StoryNotificationRecipients`), et le log placé **dans**
`getStoryNotificationRecipients` plutôt que chez un appelant, ce qui le rend vrai pour tous.
Cette session s'aligne dessus et n'apporte que ce qui manquait. (Leçon d'intégration du cycle 23,
reprise au 25b : comparer défaut par défaut, jamais « qui est arrivé en premier ».)

## Ce que l'addendum ajoute — 1. la borne payait ses exclus sur son propre budget

Défaut que le cycle 32 n'a pas touché, et qui est **antérieur** à la question de la troncature :
deux des trois requêtes écartaient des gens **après** le `take`, pas dedans.

| requête | écarté par la requête | écarté après coup |
|---|---|---|
| `postComment` | `commenterId` | **`authorId`** |
| `postReaction` | `commenterId` | **`authorId`** |
| `friendRequest` | — | `authorId` (structurel, voir plus bas) |

Une ligne écartée après coup a quand même consommé sa place sous la borne. Et l'auteur n'est pas un
engagé quelconque de son propre fil : **c'est le plus prolifique**, parce que répondre à chacun de
ses commentateurs est le comportement normal d'un auteur. Sur un post où l'auteur a répondu à tout
le monde, ses propres réponses évinçaient donc, une pour une, des destinataires réels — en silence,
et d'autant plus fort que le post marchait bien. La borne annonçait 500 destinataires et en servait
moins, sans que rien ne le dise.

**Correctif.** `authorId: { notIn: [commenterId, authorId] }` dans le `where`. La borne compte
désormais des destinataires, plus des lignes dont une partie était jetée d'avance.

**Les `filter` en aval RESTENT, et ce n'est pas une garde en double.** Le `notIn` protège le
**budget** ; les `filter` tiennent la **postcondition** de la méthode publique — « ni l'auteur ni le
commentateur ne sortent d'ici », vrai quelle que soit la clause `where` du jour. C'est ce qui
distingue ce cas du `COMMUNITY` décoratif retiré au cycle 31 : là c'était une branche de décision
inatteignable, ici c'est ce dont une méthode répond. Les deux tests qui l'encodaient sont tombés
quand je les avais retirés — ils avaient raison, ils sont restés.

Sur `friendRequest` l'auteur ne peut PAS sortir par la requête : il ancre **chaque** ligne
d'amitié. Sa présence y est structurelle, pas budgétaire — rien à corriger.

## Ce que l'addendum ajoute — 2. la ligne témoin, parce que `>=` crie au loup à la borne

Le cycle 32 déduit la troncature de « la requête a rendu **autant** de lignes que la borne »
(`length >= FANOUT_ROW_CAP`). C'est un signal juste dans l'esprit, faux au point exact où son propre
commentaire promet de trancher : un seau de **très exactement** 500 engagés est COMPLET, et il est
déclaré tronqué. Sur le seau des amis, la conséquence n'est pas théorique — un auteur à exactement
500 amis émet un `warn` de troncature à **chacune** de ses publications, pour toujours.

**Correctif : `take: FANOUT_ROW_CAP + 1`.** La ligne excédentaire est un **témoin**, jamais un
destinataire — lue, comptée, puis jetée par un `slice`. La borne de diffusion ne bouge pas d'un
destinataire ; seul le verdict devient exact, et le test passe de `>=` à `>`.

**Portée du témoin, dite honnêtement.** Sur `friendRequest` (pas de `distinct`) il est **exact** :
une 501e ligne existe si et seulement si la base en avait plus de 500. Sur les deux requêtes
`distinct`, il reste un signal **suffisant** — jamais déclenché à tort, mais capable de se taire sur
une troncature que la déduplication a repliée en deçà de la borne. Ce n'est pas gênant là où ça
compte : le seau où la troncature est de loin la plus probable est celui des amitiés — un auteur à
plus de 500 amis est banal, un post à plus de 500 commentateurs distincts ne l'est pas — et c'est
précisément celui où le compte est exact.

## Vérification de l'addendum

- **15 tests neufs**, dont **13 rouges observés** avant implémentation (le 15e — « sous la borne, on
  se tait » — était vert d'emblée : il n'y avait alors aucun `warn` du tout, ce qui est exactement le
  cas à verrouiller contre un futur `warn` trop bavard).
- **Les 4 tests du cycle 32 qui nourrissaient exactement `FANOUT_ROW_CAP` lignes** passent à
  `FANOUT_ROW_CAP + 1` : sous la sémantique du témoin, 500 lignes veut dire « complet ». Le cas
  « exactement 500 → aucune troncature » devient un test à part entière — c'est le point que `>=`
  manquait.
- Le témoin est éprouvé sur ses **trois** régimes : 500 pile → pas de troncature ; 501 → troncature
  signalée ; et dans les deux cas la 501e n'est jamais notifiée.

## Reste ouvert après l'addendum

- **La file d'attente de fan-out** reste la tête du prochain cycle, telle que le cycle 32 la pose
  (D1) — inchangé, et mieux instrumenté : le verdict de troncature ne remonte plus de faux positifs,
  donc ce que les logs mesureront sera lisible tel quel.
- Tout le reste ouvert du cycle 32 ci-dessous est inchangé.

---

# Cycle 32 — Une troncature muette, et les défauts permissifs que le cycle précédent n'avait pas atteints

Deux têtes prises ensemble, parce qu'elles se sont révélées être la même question posée à deux
étages. Celle laissée par le cycle 31 (livré en parallèle par une autre session, mergé en premier,
et repris tel quel ici — sa forme était la bonne) : « **`getStoryNotificationRecipients` plafonne à
500 lignes par seau** sans le dire au destinataire ni au log. Sur un post viral, un fan-out
silencieusement tronqué ressemble à un fan-out complet. **Tête du prochain cycle.** »

Et ce que ce cycle 31 n'avait pas atteint : il a rendu `visibility` requis sur un lot, mais le
défaut permissif vivait aussi chez l'appelant, dans trois autres lots, et sur huit méthodes de
diffusion temps réel.

## Lot A — la borne était légitime, son silence ne l'était pas

Quatre lectures bornées à 500 alimentent les fan-out de notification. Une liste rendue à la borne
exacte est **indiscernable** d'une liste complète : le seau paraît entier, et le 501e destinataire
n'apprend jamais rien. Le cas le plus net n'est même pas le post viral mais
`createFriendContentNotificationsBatch` : tri `updatedAt desc`, borne fixe, donc chez un auteur qui
dépasse durablement la borne ce sont **toujours les mêmes** — les contacts les plus anciens — qui
n'apprennent aucune de ses publications. Un silence structurel, pas un incident.

Correctif dans la ligne du corollaire du cycle 27 (« une valeur vide *établie* et une valeur vide
*qu'on n'a pas pu établir* doivent être DISTINGUABLES dans le type de retour ») : la borne devient
`FANOUT_ROW_CAP`, partagée par les quatre `take` — une constante ne peut pas dériver du test qui la
surveille — la saturation entre dans le type de retour (`truncatedBuckets: FanoutBucket[]`) et dans
le log (`postId`, `authorId`, seaux, borne).

## Lot B — le défaut permissif ne vit pas que dans la signature

`SocialEventsHandler` portait `visibility: string = 'PUBLIC'` et `visibilityUserIds: string[] = []`
sur **huit** méthodes de diffusion et sur l'énumérateur `getVisibilityFilteredRecipients` lui-même.
Un appelant qui les omettait diffusait un post `PRIVATE` à tous les amis de l'auteur, ou un `EXCEPT`
sans sa liste noire.

Aucun appelant de production ne les omettait — et c'est exactement l'argument : le retrait ne coûte
rien, la conservation coûte le premier oubli. Les deux paramètres deviennent requis ; le build a
lui-même désigné les deux harnais qui s'appuyaient sur le défaut.
`createFriendContentNotificationsBatch` reçoit le même traitement que ses trois lots voisins.

## Lot C — et il se réinstalle chez l'appelant

Le cycle 31 a rendu `visibility` requis sur `createStoryCommentNotificationsBatch` ; son unique
appelant passait `post.visibility ?? 'PUBLIC'`. Le défaut avait simplement changé d'étage, hors de
vue du build. Même motif dans `routes/posts/interactions.ts`, deux fois, avec un cast en prime :
`(post as { visibility?: string }).visibility ?? 'PUBLIC'` — alors que `postAcl`, la tranche ACL
autoritative, est chargée **trois lignes plus haut** pour la garde d'interaction. Le cast disait que
la forme rendue par `likePost` n'était pas sûre de porter le champ ; la réponse n'était pas de
deviner une valeur, mais de lire celle qu'on avait déjà.

## D1 — pourquoi le lot A ne va pas jusqu'à la file d'attente

Le commentaire du code propose depuis longtemps « a background queue for fan-out ». Ce cycle ne la
construit pas : une file change le modèle de livraison (ordre, reprise, idempotence) et mérite son
propre cycle. Rendre la troncature **observable** est ce qui manquait pour pouvoir décider — on ne
sait aujourd'hui ni à quelle fréquence la borne est atteinte, ni sur quels seaux.

## D2 — ce qui n'a PAS été refait après la session parallèle

Le cycle 31 a été livré deux fois, en parallèle. La branche arrivée première portait la meilleure
forme sur trois points (le contrat `Set | null` de la lecture DM, qui distingue la panne de
l'absence ; le refus du seul résidu plutôt que de tout le lot ; les 14 fixtures qui verrouillent
l'accord des deux formes cas par cas), et son choix assumé de relire les co-membres plutôt que de
recopier une règle d'admission localement est défendable. Elle est gardée telle quelle : ce cycle ne
réécrit rien de ce qu'elle a livré, il prend la suite là où elle s'arrête.

## Vérification

- **6 tests neufs** (`__tests__/unit/services/NotificationService.fanouttruncation.test.ts`),
  **5 rouges observés** : la saturation de chacun des trois seaux, le log qui nomme le post et le
  seau, la borne du graphe ami côté publication — et les deux cas sous la borne qui ne doivent RIEN
  consigner (sans eux, un log inconditionnel passerait les autres).
- **Suite gateway complète : 612 suites, 15 789 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,67 %** (95,66 % avant).
- Le lot B et le lot C ne changent aucun comportement observable : ils déplacent au build ce qui
  n'était protégé que par la discipline des appelants. Aucun test neuf ne peut en témoigner — la
  suite existante sert de filet, et les deux harnais que le compilateur a fait tomber sont la preuve
  que la garde mord.

## Reste ouvert après ce cycle

- **La file d'attente de fan-out** (cf. D1). La troncature est désormais mesurable ; le prochain pas
  est de regarder ce qu'elle mesure avant de choisir entre file, pagination et borne relevée.
  **Tête du prochain cycle si rien de plus grave n'apparaît.**
- **`getVisibilityFilteredRecipients` et `filterPostConsumers` traitent une visibilité inconnue de la
  même façon (retomber sur les amis), mais par deux chemins qui ne se citent pas.** L'un est un
  énumérateur, l'autre un test d'admission — les fusionner serait la faute du cycle 28 ; les faire
  se référencer mutuellement suffirait.
- **`@Display Name` reste inextractible dans le domaine social** — sixième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.

---

# Cycle 31 — Deux tests d'admission pour une seule question, et le seau qui n'en avait aucun

Tête laissée par le cycle 30 : « **Deux tests d'admission coexistent** : `filterPostAudience`
(amis stricts) et `canUserConsumePost` (amis ∪ contacts DM). Un contact DM non-ami reçoit donc une
notification de réponse mais pas de mention. **Candidat sérieux pour le prochain cycle.** »

Pris tel quel. Le défaut annoncé était réel — et en le corrigeant, l'outil qu'il a fallu construire
a rendu visible un second trou, plus grave, dans le même fichier.

## Lot A — les deux tests d'admission avaient divergé

Une seule question, « celui-là a-t-il le droit de LIRE ce post ? », posée sous trois formes :

| forme | qui | audience AVANT |
|---|---|---|
| clause `where` | `buildPostVisibilityOrFilter` (feed, post unique) | amis ∪ contacts DM |
| destinataire unique | `canUserConsumePost` (fil, notifications unitaires) | amis ∪ contacts DM |
| lot de candidats | `filterPostAudience` (mentions) | **amis stricts** |

Trois formes imposées par la manière dont la question se pose — pas par l'audience. La troisième
avait dérivé, et la conséquence est observable par l'utilisateur : un contact DM non-ami voit le
post dans son feed, peut en ouvrir le fil, reçoit une notification quand on répond à son
commentaire — et **rien** quand on le nomme dans ce même post. Sous-livraison silencieuse.

**Correctif.** `filterPostAudience` → **`filterPostConsumers`**. Le renommage n'est pas cosmétique :
la doctrine posée au cycle 29 (D1) veut qu'un point d'entrée choisisse son audience en la
**nommant**, et l'ancien nom ne disait pas laquelle des deux il appliquait — c'est précisément ce
qui a permis la dérive. La branche `FRIENDS`/`EXCEPT` consulte désormais le lien DM.

**Le coût est nul sur le cas dominant.** `filterDirectContactIdsAmong` — pendant BORNÉ de
`getDirectConversationContactIds`, comme `loadFriendIdsAmong` l'est du graphe ami — n'est interrogé
que pour le **résidu** : les candidats dont l'amitié n'a rien dit. Un lot entièrement composé d'amis
ne coûte pas une requête de plus qu'avant. Les candidats déjà écartés par la liste noire `EXCEPT`
sortent des bornes avant toute lecture, comme dans `canUserViewPost`.

**Une panne partielle ne détruit pas ce qui est établi.** Le graphe ami qui échoue ne laisse rien —
on refuse tout. Le graphe DM qui échoue ne laisse indéterminé que le résidu — on garde les amis et
on refuse le reste. Distinguer les deux, c'est le corollaire du cycle 27 appliqué à un filtre.

**L'anti-dérive est un test de conformité, pas une implémentation partagée.** Fusionner les deux
formes serait faux : `filterPostConsumers` matérialise les co-membres (`getCommunityCoMemberIds`)
là où `canUserConsumePost` tranche en pairwise (`doUsersShareCommunity`) — c'est la raison d'être
des deux. 14 fixtures traversent donc les deux fonctions depuis le **même** double de graphe et
doivent rendre le même verdict.

## Lot B — le seau « engagés antérieurs » n'avait aucun test d'admission

Trouvé en branchant le lot A. `createStoryCommentNotificationsBatch` sert trois seaux :

| seau | nature | garde AVANT |
|---|---|---|
| auteur | possède le post | exempt, correct |
| `friendIds` | **sortie d'énumérateur** — amis actuels dépliés du graphe | table locale, correct |
| `previousCommenterIds` | **ensemble arbitraire** — commentateurs antérieurs ∪ réacteurs | table locale, **faux** |

La table locale `canSeePost` ne lisait aucun graphe : `default: return true` couvrait `FRIENDS`, et
`EXCEPT` se contentait de la liste noire. Pour les amis c'est juste — ils sont amis par
construction. Pour les engagés antérieurs c'est un trou : ils étaient admis **quand ils ont engagé
le post**, et une dés-amitié ou une édition de visibilité les en sort sans toucher à leur
commentaire. Un post `PUBLIC` passé en `FRIENDS` emporte d'un coup tous ceux qui n'ont jamais été
amis — et chacun reçoit `story_thread_reply` avec l'extrait du nouveau commentaire.

C'est le trou que le cycle 30 avait fermé pour la notification UNITAIRE de la même population
(`comment_reply` → `canNotifyAboutPost`). Le seau de fan-out l'avait gardé.

`engagedAudience` passe par `filterPostConsumers`. `canSeePost` devient `canSeeAsFriend` — il ne
filtre plus que les amis — et son cas `COMMUNITY`, devenu inatteignable, est retiré plutôt que
laissé en garde décorative (repéré par la ligne non couverte 1906, pas par relecture).

## Lot C — `visibility` requis (dette des cycles 28, 29, 30)

`visibility?` à défaut `PUBLIC` sur `createStoryCommentNotificationsBatch`, annoncé trois fois comme
« mécanique, sans risque ». Devenu `visibility: string | null | undefined` requis. Une visibilité
nulle se lit désormais comme `FRIENDS`, jamais comme publique.

Nuance apprise en le faisant : contrairement à ce qu'annonçait le cycle 28, la requiredness ne
protège **que la production** ici — `services/gateway/tsconfig.json` exclut `**/__tests__/**`, donc
aucun harnais n'échoue au build. Le seul appelant de production (`routes/posts/comments.ts`) est
bien couvert ; les 3 harnais ont été rattrapés par leurs assertions, pas par `tsc`.

## Vérification

- **19 tests neufs** : 14 fixtures de conformité + 8 cas de fan-out + 5 cas de borne/panne côté lot,
  et 3 cas de service pour la mention d'un contact DM. **10 rouges observés** avant implémentation
  (7 lot A, 3 lot B), vérifiés en neutralisant la branche DM puis en la rétablissant.
- **3 harnais** complètent leur double Prisma (`participant`) : sans lui, l'exception avalée faisait
  passer leurs refus pour des refus d'ACL — ils prouvaient moins qu'ils n'en avaient l'air.
- **Suite gateway complète : 611 suites, 15 783 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,66 %** ; `postAudience.ts` et `directContactVisibility.ts` à 100 % lignes.

## Reste ouvert après ce cycle

- **`canUserInteractWithPost` reste amis stricts** et c'est volontaire (décision 2026-07-08) : ce
  cycle n'a réaligné que le côté CONSOMMATION, où les trois formes répondent maintenant à
  l'identique. L'asymétrie voir ⊇ interagir est intacte — ne pas la « réaligner » sans re-décider.
- **`getStoryNotificationRecipients` plafonne à 500 lignes par seau** sans le dire au destinataire ni
  au log. Sur un post viral, un fan-out silencieusement tronqué ressemble à un fan-out complet.
  **Tête du prochain cycle** si rien de plus grave n'apparaît.
- **`@Display Name` reste inextractible dans le domaine social** — cinquième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, et donc aucune passe de lint n'a pu tourner sur ce cycle non plus.

---

# Cycle 30 — Les notifications du fil suivaient l'auteur du commentaire, pas l'audience du post

Suite directe du cycle 29, sur la tête qu'il avait lui-même désignée : « `createCommentReplyNotification`
et `createCommentLikeNotification` ne filtrent pas leur destinataire unique. **Prochain lot naturel.** »

## Ce qui était ouvert

Trois notifications à destinataire UNIQUE visent l'auteur d'un commentaire :
`createCommentReplyNotification`, `createCommentLikeNotification` et
`createCommentReactionNotification` (chemin socket).

Leur destinataire A pu commenter — donc il était admis **à ce moment-là**. Rien ne garantit qu'il
le soit encore : une dés-amitié, ou une édition de visibilité via `PUT /posts/:postId`, le sort de
l'audience **sans toucher à son commentaire**. Les deux événements sont ordinaires.

Ce qui partait alors sur son écran verrouillé n'est pas un ping :

| notification | ce qu'elle portait |
|---|---|
| `comment_reply` | `replyPreview` — un extrait du contenu d'un **TIERS** — plus `parentCommentPreview` et la **vignette du post** (`resolvePostMedia` → `firstAttachmentUrl`, `postThumbnailUrl`) |
| `comment_like` | cette même vignette de post restreint |
| `comment_reaction` | un lien de tap vers un post qui le refuserait |

Le cycle 29 avait fermé la lecture et l'écriture du fil ; il restait ce qui en découle.

## D1 — la garde résout le post elle-même

Le cycle 28 avait tranché l'inverse pour les lots de mention : `visibility` **requis** en paramètre,
pour que TypeScript refuse l'appel incomplet à la compilation. Ici le choix est l'autre, et pour une
raison mesurable : ces trois méthodes sont invoquées en **fire-and-forget APRÈS la réponse**
HTTP/socket (toutes leurs invocations sont suivies d'un `.catch()` détaché). La requête
supplémentaire ne coûte donc rien d'observable, là où le cycle 28 gardait un chemin d'écriture chaud.

Et une garde sans paramètre ne peut pas être **désarmée par omission** — pas même par un appelant
futur qui ignorerait la règle. C'est la même propriété que D2 du cycle 28 visait, obtenue sans
élargir l'API de trois méthodes.

`canNotifyAboutPost(postId, recipientId)` : `loadPostAcl` puis `canUserConsumePost`. Audience de
**consommation** (amis ∪ contacts DM) — être informé d'un contenu qu'on a le droit de lire dans le
fil est la même question que le lire. **En panne ou post introuvable, on REFUSE** : une notification
manquée se rattrape en ouvrant le post, un extrait poussé ne se rappelle pas.

## D2 — `NOT_DELETED` sort de `postIncludes`

Brancher la garde a fait tomber **16 suites** de `NotificationService` d'un coup. Le diagnostic est
plus intéressant que le symptôme : `postVisibility` importait `NOT_DELETED` depuis `postIncludes`,
qui construit ses `Prisma.validator` **au chargement du module**. Les harnais de notification
doublent le client Prisma et n'ont aucune raison de connaître les formes d'`include` des posts —
ils cassaient sur un import qu'ils n'avaient pas demandé.

Corriger les 16 harnais aurait masqué le vrai défaut : un module d'ACL feuille ne doit pas dépendre
d'un module de formes. `NOT_DELETED` vit désormais dans `services/posts/softDelete.ts`, re-exporté
par `postIncludes` pour ses appelants historiques. **16 rouges → 6**, et les 6 restants sont la
vraie déclaration d'audience.

## Vérification

- **11 tests neufs** (`__tests__/unit/services/NotificationService.threadaudience.test.ts`),
  **6 rouges observés** : le destinataire dés-ami, le post devenu `PRIVATE`, la liste `ONLY`, le
  post introuvable qui refuse, l'auteur toujours admis sur son propre `PRIVATE`, le `PUBLIC` qui
  n'interroge pas le graphe — et deux verrous qui vérifient que la **vignette n'est même pas lue**
  quand le destinataire est hors audience.
- **7 harnais** complètent leur double : audience du post, et `PostVisibility` (le module d'ACL
  compare `post.visibility` à l'enum Prisma — un double qui ne l'expose pas fait valoir `undefined`
  à toute comparaison, donc refuser).
- **Suite gateway complète : 609 suites, 15 751 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,66 %**.

## Reste ouvert après ce cycle

- **Deux tests d'admission coexistent** : `filterPostAudience` (lots de mention, amis stricts) et
  `canUserConsumePost` (fil + notifications unitaires, amis ∪ contacts DM). Un contact DM non-ami
  reçoit donc une notification de réponse mais pas de mention. L'écart est **conservateur** (sous-
  livraison, jamais fuite) et les deux formes diffèrent — lot de candidats arbitraires contre
  destinataire unique déjà engagé. Les unifier demande de re-décider si `filterPostAudience` doit
  admettre les contacts DM. **Candidat sérieux pour le prochain cycle.**
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  annoncé par les cycles 28 et 29, toujours ouvert. Mécanique, sans risque.
- **`@Display Name` reste inextractible dans le domaine social** — quatrième report.
- Les autres points du cycle 29 (réparations base à lancer à la main, suppression de branche
  distante impossible depuis cette routine, `eslint` inopérant sur le gateway) sont inchangés.

---

# Cycle 29 — Le fil d'un post n'héritait d'aucune de ses règles d'audience

Tête laissée par le cycle 28 :
« **`@Display Name` reste inextractible dans le domaine social.** […] **Tête du prochain cycle si
rien de plus grave n'apparaît** — deux cycles de suite, quelque chose de plus grave est apparu. »

Trois cycles de suite. Le défaut annoncé retourne à la file, avec sa raison inchangée.

## Ce qui était ouvert

Les six routes de `routes/posts/comments.ts`, le like/unlike REST du post et les quatre handlers de
réaction socket ne consultaient **jamais** `Post.visibility`. Un utilisateur authentifié connaissant
un `postId` pouvait, sur un post `PRIVATE` / `ONLY` / `FRIENDS` / `COMMUNITY` :

| surface | ce qu'elle donnait |
|---|---|
| `GET /posts/:postId/comments` | tout le fil — contenu, médias, auteurs |
| `GET .../comments/:commentId/replies` | idem, et sans même regarder le post |
| `POST /posts/:postId/comments` | **écrire** dedans, puis notifier l'auteur |
| `POST`/`DELETE .../like` | réaction persistée sur un commentaire du fil |
| `comment:reaction-add` / `-remove` | idem par socket |
| `post:reaction-add` / `-remove` | réaction sur le post lui-même |
| `POST`/`DELETE /posts/:postId/like` | réaction REST sur le post lui-même |

Différence de nature avec le cycle 28 : cette fuite est **tirée par l'appelant**, pas poussée. Elle
ne demande aucun préalable — ni mention, ni relation, ni notification — seulement un identifiant.

## Pourquoi c'était visible dans le dépôt

Le post, lui, était protégé : `PostService.getPostById` et `recordMediaDownloads` appliquent
`buildVisibilityFilter`, et `post:join` refusait déjà l'abonnement à la room d'un post restreint
via `canUserViewPost`. Le fil était la seule île sans ACL.

Et la preuve était dans le fichier même : `CommentReactionHandler` **importait** `canUserViewPost`
et portait un wrapper privé `_canUserViewPost` — que rien n'appelait. L'intention avait été écrite,
le branchement n'avait jamais eu lieu.

## D1 — une asymétrie documentée n'est pas une asymétrie appliquée

`postVisibility.ts` porte depuis la décision 2026-07-08 : le filtre de LISTE admet amis ∪ contacts
DM, tandis que `canUserViewPost` — « ce qui garde RÉAGIR / COMMENTER » — reste amis stricts. Cette
règle n'existait qu'en prose : rien ne permettait de l'appliquer à UN objet.

Quatre primitives la rendent exécutable, dans le fichier qui la documente plutôt que dans un module
de plus :

| primitive | question | audience |
|---|---|---|
| `loadPostAcl` | tranche ACL de ce post | — (`null` si absent OU supprimé) |
| `loadCommentPostAcl` | ... du post PORTANT ce commentaire | — (id d'URL jamais cru) |
| `canUserConsumePost` | peut-il LIRE le fil ? | amis ∪ contacts DM |
| `canUserInteractWithPost` | peut-il ÉCRIRE / RÉAGIR ? | amis stricts |

Les deux verdicts ne diffèrent que par `canUserViewPost(..., { includeDirectContacts })`. Un point
d'entrée choisit son audience en la **nommant**, pas en réglant un booléen.

Choisir la consommation pour la lecture n'est pas un élargissement, c'est l'absence d'une
régression : un contact DM non-ami à qui le feed montre déjà une story `FRIENDS` doit pouvoir en
lire les commentaires. Le verdict d'interaction en aurait fait un 404 — une garde qui casse un
lecteur légitime n'est pas une garde.

## D2 — l'identifiant du chemin ne vaut rien

Trois surfaces adressent leur cible par `commentId` tout en recevant un `postId` (segment d'URL ou
champ de payload) : les réponses, les likes de commentaire, les réactions socket. Le post y est
désormais résolu **DEPUIS le commentaire**. Sans cela, un appelant annonçait le post public de son
choix tout en visant le fil d'un post privé — le `postId` reçu n'est plus qu'une adresse de room et
un segment de chemin.

## Les deux transports répondent pareil

`likePost` et `PostReactionService.addReaction` ne vérifient, eux aussi, que l'existence et le
non-effacement du post. Gardier le seul chemin socket aurait fait dépendre l'ACL du **transport** :
un client refusé sur `post:reaction-add` réussissait en repassant par `POST /posts/:postId/like`.
Les deux reçoivent donc la même garde et le même refus indistinct.

## D3 — refuser sans confirmer

`404` partout, jamais `403`, et `null` indistinct entre post absent, supprimé et invisible. Même
doctrine que `recordMediaDownloads` : distinguer ferait de la route un oracle d'existence de posts
privés. Côté socket, l'ACK rend « Post/Comment not found » pour la même raison.

## Coût

- Cas dominant (post `PUBLIC`) : une requête bornée, **aucune** lecture de graphe ensuite.
- `FRIENDS`/`EXCEPT` : une requête d'amitié ; le contact DM n'est consulté qu'en dernier recours.
- `EXCEPT` court-circuite sur sa liste noire **avant** toute lecture de graphe (nouveau).
- `doUsersShareDirectConversation` est le pendant **pairwise** de `getDirectConversationContactIds`,
  exactement comme `doUsersShareCommunity` l'est de `getCommunityCoMemberIds` : deux requêtes
  bornées au lieu de matérialiser le carnet d'adresses. Définition du contact DM reprise mot pour
  mot du feed. **En panne, il refuse.**

## Contreparties assumées

**1. Un contact DM non-ami perd le droit d'ÉCRIRE dans le fil d'un post `FRIENDS`/`EXCEPT` qu'il
peut pourtant VOIR** (il garde la lecture). C'est le seul cas où une action qui réussissait pour un
utilisateur *voyant* le post échoue désormais — il mérite d'être appelé par son nom plutôt que
caché derrière « on ferme un trou ». Ce n'est pas un effet de bord : c'est exactement la décision
produit du 2026-07-08 citée dans `postVisibility.ts` (« un DM-contact peut ouvrir une story FRIENDS
et compter comme viewer, mais pas y réagir »), restée sans point d'application jusqu'ici. Si
l'équipe produit veut au contraire ouvrir l'interaction aux contacts DM, la correction tient en une
ligne (`canUserInteractWithPost` passant `includeDirectContacts: true`) — et doit se faire en
RE-DÉCIDANT l'ACL, jamais en retirant la garde. **Point de validation humaine.**

**2. Un utilisateur qui perd l'accès à un post ne peut plus retirer une réaction qu'il y avait
laissée.** Elle lui est de toute façon invisible, et une ACL qui dépend du sens du geste est un
footgun ; le retrait suit donc la pose. À rouvrir si un cas d'usage réel apparaît.

## Vérification

- **51 tests neufs**, écrits AVANT l'implémentation, **24 rouges observés** :
  - `__tests__/unit/services/posts/postThreadAccess.test.ts` — 22 cas (les six modes, l'auteur
    toujours admis sur son `PRIVATE`, le contact DM admis en lecture ET refusé en écriture, le post
    résolu depuis le commentaire, la visibilité inconnue qui restreint, la panne qui refuse, les
    court-circuits sans requête).
  - `__tests__/unit/routes/posts/comments-audience.test.ts` — 17 cas sur les cinq routes, dont
    « le `:postId` du chemin ne vaut rien » et « lire est ouvert là où écrire est refusé ».
  - `__tests__/unit/routes/posts/interactions-audience.test.ts` — 8 cas sur le like/unlike REST,
    dont « un contact DM non-ami est refusé, comme sur le chemin socket ».
  - 9 cas d'audience ajoutés aux deux suites de handlers socket, dont « le `postId` du payload
    n'est pas cru ».
- **15 harnais ont dû déclarer leur audience.** C'est voulu, et c'est le même choix qu'au cycle 28 :
  un double qui n'expose pas la tranche ACL échoue au lieu de rendre un verdict par défaut.
- Le wrapper mort `_canUserViewPost` est retiré.
- **Suite gateway complète : 608 suites, 15 740 tests, tout vert** (avant : 605 / 15 682).
  `tsc --noEmit` propre. Couverture lignes **95,66 %**, en légère hausse.

## Reste ouvert après ce cycle

- **`@Display Name` reste inextractible dans le domaine social** — rendu à la file une TROISIÈME
  fois, même raison mesurée : les deux clients insèrent un **handle**, jamais un nom d'affichage
  (web `MentionAutocomplete` → `onSelect(suggestion.username)`, iOS `FeedCommentsSheet` →
  `"@\(username) "`). Le cas ne se produit qu'en frappe manuelle. **Tête du prochain cycle si rien
  de plus grave n'apparaît.**
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  candidat sérieux annoncé par le cycle 28, non traité : ce cycle a trouvé plus grave dans le même
  chemin. Un seul appelant, qui passe bien le paramètre ; le rendre requis est mécanique.
  **Candidat sérieux pour le prochain cycle**, deux fois annoncé.
- **`createCommentReplyNotification` et `createCommentLikeNotification` ne filtrent pas leur
  destinataire unique** — l'auteur du commentaire parent reçoit un extrait de la réponse **et la
  vignette du post** (`resolvePostMedia`) sans test d'audience. Le cas exige une restriction
  postérieure à son commentaire (dés-amitié, édition de visibilité), donc plus étroit que ce cycle,
  mais c'est le même défaut : `filterPostAudience` s'y applique tel quel. **Prochain lot naturel.**
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). À lancer SANS `--apply`
  d'abord. Action humaine — cette routine n'a aucun accès MongoDB.
- **Les `PostMention` périmées déjà écrites restent en base** (cycle 27, inchangé).
- **Aucune lecture déjà servie n'est rattrapable.** Le correctif ne vaut que pour l'avenir ; les
  fils restreints déjà lus l'ont été.
- **`getMentionsForMessage` / `getRecentMentionsForUser` n'ont aucun consommateur d'écran**
  (cycle 27, inchangé).
- **`MeeshySocketIOManager.getConversationParticipantsForMention`** reste un deuxième exemplaire du
  chargeur de participants (cycle 21, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9. Condition préexistante ; la CI ne gate que sur `test:coverage`.
- **La suppression de branche distante échoue depuis cette routine** — à supprimer depuis
  l'interface GitHub.

---

# Cycle 28 — Nommer quelqu'un ne lui donne pas le droit de VOIR

Tête laissée par le cycle 27 :
« **`@Display Name` reste inextractible dans le domaine social.** […] **Tête du prochain cycle
si rien de plus grave n'apparaît.** »

Quelque chose de plus grave est apparu, dans le bloc voisin du même chemin. Le défaut annoncé est
rendu à la file, avec la raison (voir *Reste ouvert*).

## Ce que les deux lots de mention faisaient

`createPostMentionNotificationsBatch` et `createCommentMentionNotificationsBatch` poussaient une
notification `user_mentioned` à **tout** utilisateur nommé dans le texte, sans jamais regarder qui
avait le droit de voir le post. La charge utile n'est pas un simple ping : elle porte
`postPreview` / `commentPreview` — un extrait de 100 caractères du contenu — et
`action: 'view_post'`.

Nommer `@carol` dans un post `PRIVATE`, `ONLY [bob]`, `FRIENDS` (Carol n'étant pas amie) ou
`COMMUNITY` (Carol n'étant pas membre) lui envoyait donc **un extrait du contenu sur son écran
verrouillé**, plus un lien de tap vers un post qui la refuserait. Le même trou existait pour un
commentaire : l'extrait du fil d'un post restreint partait vers un mentionné hors audience.

C'est une fuite de contenu, pas de métadonnée, et elle est **irréversible** — une notification
poussée est arrivée.

## Pourquoi c'était visible dans le dépôt

Ces deux lots étaient les **seules** surfaces d'éventail du domaine social à ne pas filtrer.
Toutes leurs voisines le font déjà, chacune sous un commentaire qui l'explique :

| surface | filtre |
|---|---|
| `createStoryCommentNotificationsBatch` | `canSeePost` (ONLY/EXCEPT/PRIVATE/COMMUNITY) |
| `createFriendContentNotificationsBatch` | branches ONLY/EXCEPT/COMMUNITY |
| `SocialEventsHandler.getVisibilityFilteredRecipients` | tous les broadcasts temps réel |
| `StoryTextObjectTranslationService.resolveBroadcastRecipients` | garde `PRIVATE` explicite |
| **les deux lots de mention** | **aucun** |

## D1 — l'admission n'est pas l'énumération

Toutes les gardes existantes sont des **énumérateurs** : auteur → liste de destinataires, obtenue
en dépliant son graphe. Une mention pose la question **inverse** — l'ensemble des nommés est
ARBITRAIRE (n'importe quel `@handle` du texte) et il faut trancher, un par un, « celui-là a-t-il le
droit ? ».

Réutiliser un énumérateur ici aurait été faux, et de façon coûteuse : pour `PUBLIC` ils rendent
`friendIds`. C'est un choix de **ciblage** (on ne pousse une publication qu'aux contacts), pas une
règle d'admission — un post public se **lit** par n'importe qui. Un inconnu légitimement nommé dans
un post public aurait perdu sa notification, soit le cas le plus courant de tous.

D'où `services/gateway/src/services/posts/postAudience.ts` → `filterPostAudience`, le test
d'admission, distinct et nommé comme tel :

| `visibility` | admis | coût |
|---|---|---|
| `PUBLIC` | tout le monde | **aucune requête** |
| `FRIENDS` | les amis de l'auteur | 1 requête bornée |
| `EXCEPT` | les amis, moins `visibilityUserIds` | 1 requête bornée |
| `ONLY` | exactement `visibilityUserIds` | aucune |
| `COMMUNITY` | les co-membres (cache Redis existant) | mutualisée |
| `PRIVATE` | personne | aucune |
| inconnue | comme `FRIENDS` — **jamais** comme publique | 1 requête bornée |

Trois décisions dans cette table :

1. **L'auteur est toujours admis**, y compris sur un `PRIVATE` : il possède le post, et aucun
   graphe ne l'affirme (on n'est pas ami avec soi-même).
2. **Une visibilité inconnue retombe sur `FRIENDS`**, pas sur `PUBLIC` : un mode ajouté demain au
   schéma sans passer par cette table restreint par défaut au lieu d'ouvrir en grand.
3. **En panne, on REFUSE.** L'échec d'une notification légitime est réparable (la ligne
   `PostMention` est persistée, la mention reste visible en ouvrant le post) ; la fuite ne l'est
   pas. `getCommunityCoMemberIds` rendait déjà `[]` sur exception — même politique.

La requête d'amitié est **bornée aux candidats** (`in: [...candidates]` des deux côtés) et non au
graphe entier : un auteur à 5 000 contacts nommant une personne coûte l'intersection, pas 5 000
lignes. Et le cas dominant — post public — ne coûte **rien**.

## D2 — une garde qu'on peut désarmer par omission n'est pas une garde

`createStoryCommentNotificationsBatch` prend `visibility?` avec défaut `PUBLIC` : oublier le
paramètre rouvre le trou en silence. Les deux lots de mention reçoivent au contraire
`visibility` **requis** (et `postAuthorId` requis côté commentaire, l'audience étant celle du POST
et non celle du commentateur). TypeScript refuse alors l'appel incomplet à la compilation.

C'est la raison de ne PAS avoir choisi l'autre option — recharger le post depuis `postId` dans le
lot : le paramètre requis donne la même garantie, sans requête supplémentaire sur un chemin
d'écriture chaud, et l'échoue au build plutôt qu'à l'exécution. La contrepartie assumée : **9
harnais** ont dû déclarer leur audience. Ils l'ont fait en `PUBLIC` avec la raison écrite — ils
portent sur le contenu, la langue, la priorité, le débit et l'auto-mention, pas sur le droit de
voir.

## Ce qui n'est PAS filtré, et pourquoi

Les lignes `PostMention` / `CommentMention` continuent d'être écrites pour **tous** les nommés.
Elles consignent un FAIT sur le texte (« ce post nomme Carol »), vrai quelle que soit l'audience ;
seule la **livraison** est conditionnée. Trois raisons :

1. Élargir plus tard la visibilité d'un post ne doit pas laisser un mentionné sans ligne.
2. Le consommateur d'affinité (`PostFeedService.getMentionsByPost` → `getReelSeed`) ne classe que
   des `candidateIds` **déjà filtrés par le feed** — vérifié : aucune seconde fuite par ce chemin.
3. Une ligne manquante ne se reconstruit pas (personne ne relit le texte après coup), là où une
   notification manquée est rattrapée par l'ouverture du post.

Les listes de déduplication des routes (`mentionedUserIds` → `excludeUserIds`) restent
**volontairement** l'ensemble complet des nommés. Un mentionné hors audience exclu des buckets de
priorité inférieure ne perd rien : ces buckets appliquent leur propre filtre de visibilité et
l'auraient écarté aussi.

## Vérification

- **25 tests neufs**, écrits AVANT l'implémentation, RED observé à chaque étape :
  - `__tests__/unit/services/posts/postAudience.test.ts` — 15 cas, unité à **100 % lignes et
    branches** (les six modes, l'amitié dans les deux sens, la borne aux candidats, l'auteur
    toujours admis, la panne qui refuse, la visibilité inconnue qui restreint, les court-circuits
    sans requête).
  - `__tests__/unit/services/NotificationService.mentionaudience.test.ts` — 10 cas sur les deux
    lots, dont « l'audience est celle du POST, pas celle du commentateur » et « aucune notification
    quand le graphe est illisible ».
- **4 régressions au niveau ROUTE** : l'audience du post persisté atteint le lot (création),
  l'audience **APRÈS** édition est celle qui s'applique (restreindre et nommer dans la même requête),
  l'audience du post atteint le lot de commentaire, et un post commenté introuvable ne notifie
  personne.
- **Suite gateway complète : 605 suites, 15 682 tests, tout vert** (avant : 603 / 15 655).
  `tsc --noEmit` propre. Couverture globale lignes **95,65 %**, en hausse.

## Reste ouvert après ce cycle

- **`@Display Name` reste inextractible dans le domaine social** — tête annoncée par le cycle 27,
  rendue à la file une seconde fois, et pour la même raison mesurée : les deux clients insèrent un
  **handle**, jamais un nom d'affichage (web `MentionAutocomplete` → `onSelect(suggestion.username)`,
  iOS `FeedCommentsSheet` → `"@\(username) "`). Le cas ne se produit qu'en frappe manuelle. Coût non
  nul : un post n'a pas de participants, l'audience équivalente (auteur + commentateurs + amis, cf.
  `getUserSuggestionsForPost`) demanderait deux requêtes de plus sur un chemin d'écriture chaud.
  **Tête du prochain cycle si rien de plus grave n'apparaît** — deux cycles de suite, quelque chose
  de plus grave est apparu.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  le footgun que D2 vient de fermer sur les mentions reste ouvert là. Il n'a aujourd'hui qu'un seul
  appelant, qui passe bien le paramètre ; le rendre requis est mécanique et sans risque.
  **Candidat sérieux pour le prochain cycle.**
- **Les commentaires n'ont pas de route d'édition** — `comments.ts` n'expose que création,
  like/unlike et suppression. Il n'y a donc rien à réconcilier côté `CommentMention` aujourd'hui ;
  le jour où une édition de commentaire apparaît, elle doit naître avec `reconcilePostMentions`
  pour jumeau.
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). À lancer SANS `--apply`
  d'abord. Action humaine — cette routine n'a aucun accès MongoDB.
- **Les `PostMention` périmées déjà écrites restent en base.** Les lignes de mentionnés retirés
  avant le cycle 27 survivent. Réparable par le même patron que les deux scripts ci-dessus.
- **Aucune notification déjà poussée n'est rattrapable.** Le correctif de ce cycle ne vaut que pour
  les mentions à venir ; les extraits partis vers des mentionnés hors audience sont arrivés.
- **`getMentionsForMessage` / `getRecentMentionsForUser` n'ont aucun consommateur d'écran** —
  l'inbox `/mentions` reste une capacité backend sans écran (cycle 27, inchangé).
- **`MeeshySocketIOManager.getConversationParticipantsForMention`** est toujours un deuxième
  exemplaire du chargeur de participants (cycle 21, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9 (`bun run lint` échoue immédiatement). Condition préexistante, non couverte par la CI
  — qui ne gate que sur `test:coverage`.
- **La suppression de branche distante échoue depuis cette routine** (`git push --delete` répond
  « Everything up-to-date » sans agir). Les branches mergées s'accumulent côté remote — à supprimer
  depuis l'interface GitHub.

---

# Cycle 25b — Addendum d'une session parallèle

Deux sessions ont livré le cycle 25 en parallèle. Le refactor des liens de la PR #2650 est
**strictement meilleur** : en réunissant les deux copies, il a trouvé que `createdBy` recevait un
`Participant.id` là où la route `/tracking-links` attend un `User.id` pour AUTORISER l'accès. La
seconde session s'aligne dessus et n'apporte que ce qui manquait — appliqué par-dessus, jamais à la
place. (Leçon d'intégration du cycle 23 : comparer défaut par défaut, jamais « qui est arrivé en
premier ».)

Le cadrage du `@Display Name` social revient au cycle 26 ci-dessus, mieux étayé : les deux clients
insèrent un **handle**, jamais un nom d'affichage. La note de cette session sur le sujet est donc
retirée au profit de la sienne.

## Champ mort retiré — `MentionCreatedEventData.mentionedParticipantId`

Porté par le backlog depuis le cycle 24, vérifié et retiré. Les **trois** émetteurs de
`mention:created` — envoi WS (`MessageHandler`), envoi REST/ZMQ (`MeeshySocketIOManager`), édition
(`emitMentionCreated`) — l'omettent : il n'a jamais circulé sur le fil. Le SDK iOS le décodait dans
`MentionCreatedEvent`, et rien ne lisait la propriété.

Le test de décodage SDK garde la clé dans le JSON **et lui en ajoute une inconnue** : ce qui compte
désormais n'est plus la valeur du champ mais le fait qu'une clé inconnue ne casse pas le décodage —
donc qu'aucun client ne souffre d'une gateway qui l'enverrait encore.

À ne pas confondre avec la colonne physique `Mention.mentionedParticipantId` (Prisma/Mongo), bien
vivante et utilisée par les scripts de migration.

## Écarté après enquête — `getLatestMessageSummary` n'est pas un défaut

Le backlog le portait depuis le cycle 19 : « résume le DERNIER message de la conversation, pas
celui qu'on vient d'acquitter ». **Ce n'en est pas un, et le "corriger" serait une régression.**

iOS applique le `summary` via `bufferBatchDelivery(conversationId:event:)` — un lot au niveau
**conversation**, jamais par message (`ConversationSocketHandler.swift:801`). Le contrat client est
donc « état de livraison de la conversation, ancré sur son dernier message », ce que la méthode
calcule exactement.

Si le serveur résumait le message ACQUITTÉ, lire un vieux message #5 produirait un résumé « lu »
que le client appliquerait **en lot à tous les messages**, y compris #7 non lu. Passer au
par-message demanderait de plumber des reçus par message des deux côtés client : chantier de
contrat, pas correctif. Retiré du backlog comme défaut.
