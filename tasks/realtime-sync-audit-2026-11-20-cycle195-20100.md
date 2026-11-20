# Cycle 195 — une audience IMBRIQUÉE n'a pas de portée à lire, et le cliquet ne la voyait pas (#20100)

> Suivi **I2** de #20091, que son propre audit adversarial avait nommé « la suite
> la plus chère du lot ». Lot livré le 2026-11-20 sur `dev`.

## Le constat, en une phrase

Le cliquet des audiences cherchait une **forme d'appel** —
`prisma.participant.findMany|count|groupBy|aggregate({ where: { conversationId, … } })`.
L'autre moitié des audiences du dépôt est une **projection** :

```ts
conversation.findUnique({
  where: { id: conversationId },
  select: { participants: { where: { isActive: true }, select: { … } } },
})
```

Sa portée de conversation est **implicite** — portée par le `where` du parent —
donc le discriminant « ce `where` porte-t-il `conversationId` ? » rendait `false`
pour une audience parfaitement réelle. **Trente-trois sites vivaient là, aucun
n'épelant la loi**, dont l'éventail de notifications push.

> **Un discriminant qui lit une PORTÉE ne voit que les portées ÉCRITES.** C'est
> la leçon 261 une fois de plus — l'énumération portait « ces sites respectent la
> règle » (vrai, vérifié) et « ce sont les sites où la règle s'applique » (faux) —
> avec une variante : la seconde affirmation n'avait pas la forme d'une liste.
> C'était une FORME D'APPEL, donc une affirmation que rien ne désigne comme
> telle.

## Ce que le lot RESSERRE

### 1. L'éventail de notifications push — `messageNotificationFanOut.ts`

`where: { isActive: true, type: 'user' }` → `{ ...PARTICIPATION_VIVANTE, type: 'user' }`.

C'est de cette lecture que sortent `memberIds`, et avec lui le lot `regular`, le
gate de la réponse (`memberIds.includes`) et le dénominateur du compte rendu. Un
membre **actif-et-banni** est exclu de `conversation:<id>` (`AuthHandler`) et du
REST (`canAccessConversation`) : **l'écran verrouillé était le seul canal qui lui
restait, et il portait le texte du message.** Dans une conversation chiffrée, le
site le dit déjà lui-même (#17194) : la clé de session est par PAIR, rien ne la
rote, donc l'**enveloppe s'ouvre**.

**Resserrer n'ouvre rien, et c'est MESURÉ.** La même lecture alimente `silenced`,
une liste de REFUS — que le sur-ensemble sert normalement mieux. Ses trois
consommateurs sont déjà bornés par la loi en amont : `memberIds` par ce `where`,
`validatedMentionUserIds` par `MentionService.validateMentionPermissions` (qui
épelle `PARTICIPATION_VIVANTE` depuis #14066), le gate de réponse par
`memberIds`. Sans cette mesure, le correctif aurait eu une chance d'ouvrir une
bannière de MENTION à un banni en retirant son id de `silenced` — la forme exacte
de l'inversion que #20093 refuse ailleurs.

### 2. L'annonce d'un groupe démarré — `announceStartedGroup.ts`

Resserré **un cran plus bas, en code**, et c'est une décision :

```ts
const creator = members.find(isMemberCreator);                       // le SUR-ENSEMBLE
const invitees = members.filter(m => m.userId !== creator.userId
                                  && participationEstVivante(m));    // la LOI
```

Le créateur ne se reconnaît qu'au `role` de sa **ligne de participation** —
mesuré sur `schema.prisma`, `Conversation` ne porte **aucune colonne d'auteur**.
Resserrer le `where` ferait donc disparaître un créateur banni-mais-actif du
relevé, `creator` serait introuvable, l'unité rendrait avant d'annoncer quoi que
ce soit, et **plus aucun invité légitime ne recevrait son invitation.** Resserrer
la réception en retournant la garde contre la personne qu'elle protège est ce que
#20093 refuse ; ici la réponse est de séparer les deux questions dans le code,
pas dans la requête.

> **Un `where` n'est pas une projection.** `participationEstVivante` exige
> `isActive === true` : un champ non PROJETÉ vaut `undefined`, donc la fonction
> aurait rendu `false` pour TOUT LE MONDE et l'annonce n'aurait plus atteint
> personne. Le compilateur ne le voit pas (les deux champs sont optionnels), et
> le `where` qui filtre déjà sur `isActive` rend la colonne superflue À L'ŒIL.
> Trouvé au témoin, pas à la relecture.

## Ce que l'instrument apprend à voir, et ce qu'il apprend à TAIRE

| changement | effet mesuré |
|---|---|
| la forme **imbriquée** (`participants: { where: … }` d'une projection) | +25 audiences, dont 24 nues |
| **`findFirst`** dans le relevé | 128 appels lus, 1 audience de plus (un tirage de nom unique) |
| un filtre **NÉGATIF** ne nomme personne (`{ not: <quoi que ce soit> }`, plus seulement `{ not: null }`) | +11 audiences, silencieusement écartées jusque-là |
| `clé-indirecte` **publié** au lieu d'être jugé | 2 PORTES ne sont plus déclarées audiences nues |
| `modèle-indécidable` **publié** au lieu d'être jugé | 2 lectures de participants d'APPEL sortent du relevé |

Distribution après le lot : **130 audiences, 43 épellent la loi, 87 nues**, toutes
rangées — 16 refus décidés, 71 dettes mesurées — et **52 lectures publiées comme
non jugeables**. Les comptes vivent dans deux témoins, en `<=` / `>=` ; aucun
n'est écrit en prose ici (règle du cycle 194 : un compte écrit dans un journal
dérive au premier élargissement de l'instrument qui le produit).

### Les deux formes qu'il fallait apprendre à taire, et pourquoi elles comptent plus que celles qu'il apprend à voir

**`clé-indirecte`.** `{ conversationId, ...callerParticipantWhere(caller) }` a
toute l'apparence d'une audience — portée écrite, aucune identité visible — et
c'en est le contraire : l'appel porte la clé du membre. En ajoutant `findFirst`
(où cette forme est la règle, puisqu'une lecture unitaire EST une porte), le
relevé se serait mis à rendre des verdicts d'AUDIENCE sur des PORTES.

> C'est le constat I2 de #20091 vu par son autre bout : le lot y avait publié la
> portée indirecte et laissé la **clé** indirecte se faire juger. Les deux formes
> ont la même cause — un étalement illisible — et seule la seconde produit un
> faux verdict plutôt qu'un silence.

Le discriminant ne retient qu'un **APPEL**, jamais un identifiant, et ce n'est pas
une commodité : nommer un membre en particulier exige une valeur d'exécution,
qu'une constante de module ne peut pas porter. Le premier jet publiait les deux
formes — il a fallu mesurer ce qu'il faisait DISPARAÎTRE : **trois décisions déjà
instruites**, reclassées en « je ne sais pas » par le lot même qui prétendait
mieux voir. `unsetOrNull` et `differsOrUnset` sont exemptés pour la même raison
que `{ not: … }` : aucune forme négative ne sélectionne quelqu'un.

**`modèle-indécidable`, et c'est la leçon du lot.** La forme appelée nomme sa
table (`participant.findMany`). La forme imbriquée ne nomme qu'une **relation**,
et deux modèles la partagent : `Conversation.participants: Participant[]` et
`CallSession.participants: CallParticipant[]` — les deux seules du schéma, mesuré.
`CallParticipant` n'a **ni `isActive` ni `bannedAt`**, et le premier jet rangeait
donc `{ OR: [{ leftAt: null }, { leftAt: { isSet: false } }] }` — des participants
d'APPEL — parmi les audiences nues d'une conversation, envoyant réparer une clause
qui n'a rien à voir avec le bannissement.

> **Un balayage qui change de forme d'appel change aussi de PREUVE DE MODÈLE.**
> La forme appelée la portait gratuitement. La question à poser à tout
> élargissement de discriminant n'est pas seulement « qu'est-ce que je vois en
> plus ? » mais **« qu'est-ce qui me prouvait, dans la forme d'avant, que je
> regardais la bonne table ? »**.

La preuve vit désormais dans un témoin qui relit `schema.prisma`
(`audience-law-nested-scope.test.ts` § « la preuve de modèle ») : l'ajout d'une
colonne ou d'une troisième relation `participants` fait rougir le cliquet.

## Le faux VERT que ce lot a failli livrer

Le garde-fou de modèle testait `isActive|bannedAt` dans le texte de la clause.
`PARTICIPATION_VIVANTE` **ne nomme aucune colonne** : le site que le lot venait de
resserrer est donc sorti du relevé en `modèle-indécidable` au lieu d'y passer au
VERT — et comme l'inventaire se rééquilibrait (87 nues, 87 entrées), **tout
paraissait juste**. Le témoin nommé l'a attrapé en exigeant
`usesLaw === true` sur la clé, pas l'absence du site.

> **Un site corrigé qui DISPARAÎT du relevé et un site corrigé qui y passe au
> vert rendent le même inventaire équilibré.** Un cliquet qui se trompe dans le
> sens rassurant est pire que pas de cliquet (#20091) — et il s'est trompé deux
> lots de suite, dans le lot qui dénonçait ce défaut, puis dans celui qui le
> réparait. La garde est de nommer le site ATTENDU et son verdict, jamais de
> compter.

## Les familles neuves de l'inventaire

- **`apercu-de-membres-servi`** (18) — le gros de ce que la forme imbriquée a fait
  entrer : fiche admin, aperçu de nom, liste souveraine, conversations d'une
  communauté, détail et ligne de liste, recherche, export RGPD, feuille de
  préférences, fragment `_count` partagé, pairs d'un historique d'appels,
  partenaires de conversation. Aucune livraison — **mais c'est pire qu'un nombre
  faux quand la projection est CAPÉE** (`take: 5`, `take: 6`, `take: 100`) : un
  banni prend la place d'un membre légitime dans l'aperçu, qui montre alors
  quelqu'un qui n'est plus là en cachant quelqu'un qui l'est. À instruire avec
  #20051.
- **`audience-de-publication-a-instruire`** (2) — `feedContacts`, `viewerAudience` :
  l'ensemble des « contacts » qui décide **qui peut LIRE une publication**
  d'audience restreinte. Un banni-mais-actif d'un tête-à-tête y reste un contact.
  Autre domaine, autres seuils (cercles de proximité) : autre lot.
- **`porte-sur-un-sur-ensemble`** (1) — et c'est un **défaut ouvert**, pas une
  mesure : `POST /conversations/:id/invite` résout l'INVITEUR depuis la liste nue,
  si bien qu'un membre actif-et-banni **fait entrer qui il veut** dans une
  conversation dont il est exclu — et « inviter » y écrit un `Participant`
  immédiatement ACTIF. Le `where` ne se resserre pas (la même lecture tient
  `newMemberRefusal`, une égalité exacte qui garde un tête-à-tête chiffré à
  DEUX) : le correctif est celui d'`announceStartedGroup`. **#20104**.
- **`unicite-d-un-nom`** (1) — la seule audience que `findFirst` a fait entrer :
  le tirage d'un nom d'affichage anonyme. Le sur-ensemble y échoue du bon côté.

Six refus **décidés** rejoignent `DELIBERATELY_WIDE` avec leur raison instruite :
les deux transports du gate de BLOCAGE d'un tête-à-tête (REST et socket — un
blocage lie deux COMPTES, pas deux appartenances), `messageMentions`
(constructeur d'EXCLUSIONS sur un ensemble déjà borné par la loi en amont : le
resserrer rétrécirait un refus pour rien), `announceStartedGroup` (la loi en
code), `callGroupConversation` (**égalité exacte** `sameSet` — resserrer ferait
diverger les deux côtés et un second appel s'ouvrirait sur la même conversation)
et `conversation-encryption` (**trois** questions dans une lecture : une porte,
un refus par égalité exacte, et une audience de diffusion — famille de
convergence #20093).

## Ce que le lot ne prend pas, et où c'est écrit

- **#20103** — dix projections `participants` **sans aucun `where`**, strictement
  plus larges qu'`isActive` nu : elles rendent les partis, les retirés et les
  bannis. Plusieurs **projettent `isActive` et filtrent en CODE** — ce qu'aucun
  discriminant de `where` ne peut voir, et que deviner transformerait en verdicts.
  Elles sont écartées **explicitement**, pas en silence.
- **#20104** — la porte d'invitation ci-dessus.
- **#20093** — la convergence des quatre lectures E2EE, à laquelle
  `conversation-encryption` vient s'ajouter.

## Preuve

- `src/socketio/__tests__` : **118 suites, 1 695 témoins** verts.
- ROUGE prouvé par mutation inverse sur les deux correctifs : le `where` remis à
  `isActive` nu fait tomber le témoin de requête ; `participationEstVivante`
  retiré fait tomber le témoin de comportement — et le troisième témoin (« un
  créateur banni annonce quand même ses invités légitimes ») reste VERT sous les
  deux mutations, ce qui est ce qu'il doit faire : il garde la décision, pas le
  correctif.
- Suite complète du gateway, `bun run test:coverage`.
