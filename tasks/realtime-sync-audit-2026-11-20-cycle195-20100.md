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

---

## L'audit adversarial, et ce qu'il a cassé

Verdict : **BLOQUANT**. Six de ses constats sont entrés dans le lot ; quatre sont
devenus des issues. Le plus cher n'était pas une omission : c'était une
**affirmation que le lot avait écrite comme mesurée**.

### Le constat qui change le récit du lot : la raison nommait la mauvaise garde

Le lot écrivait, sur le site ET dans son inventaire de décisions, que resserrer
l'éventail n'ouvre rien parce que `validatedMentionUserIds` est borné en amont
par `MentionService.validateMentionPermissions`, « qui épelle
`PARTICIPATION_VIVANTE` depuis #14066 ».

**Faux.** Il l'épelle en portées `interlocutor` et `members`. En portée
**`directory`** — conversation `public`, `global`, `broadcast` — il valide « tout
compte existant », sans filtre d'appartenance, et le dit sur place :

```ts
case 'directory': {
  // Tout compte existant. Pas de filtre isActive/deletedAt : la
  // validation reste plus large que la recherche, jamais plus étroite.
```

J'avais ouvert cette fonction et lu sa lecture de conversation — qui porte bien
`where: PARTICIPATION_VIVANTE`. Je n'avais pas lu ses BRANCHES.

> **Vérifier qu'une garde existe n'est pas vérifier qu'elle s'applique à mon
> cas.** Une fonction d'autorisation a des RÉGIMES, et le mien était celui qui
> n'en a pas. La question juste n'est pas « cette fonction épelle-t-elle la
> loi ? » mais **« sous quelle portée s'applique ce qu'elle épelle, et la mienne
> y est-elle ? »**.

Sur le chemin d'ENVOI, la conclusion tenait — mais par une **autre garde** :
`memberIds`, que le lot venait justement de resserrer, et dont le filtre interne
(`if (!memberIds.includes(userId)) return false`) est la porte d'admission du lot
de mentions. Le correctif était bon ; sa raison désignait ce qui ne porte pas.

> **Une raison qui nomme la mauvaise garde est pire qu'une absence de raison** :
> elle autorise le prochain lot à retirer celle qui porte.

### Et sur le chemin d'ÉDITION, la même phrase était une DÉCISION, et le trou était VIVANT

`DELIBERATELY_WIDE['services/messaging/messageMentions.ts#1']` affirmait que
`notifyNewlyMentioned` « ne tire de cette liste que des EXCLUSIONS […] **Mesuré,
pas supposé** ». Les deux jambes étaient fausses : la lecture compose aussi le
`memberIds` d'ADMISSION remis au batch, et rien ne bornait en amont.

Scénario mesuré : conversation `public` · B membre `isActive: true,
bannedAt ≠ null` · quelqu'un ÉDITE son message pour y ajouter `@B` → B reçoit une
bannière portant le **texte édité**, sur sa room `user:<id>`, la seule qui lui
reste.

J'avais vu ce site. J'avais même noté, en le lisant, « passé en dernier argument
à `createMentionNotificationsBatch` — reste à voir pour quoi », et je ne l'ai pas
fait : j'ai conclu depuis les deux helpers d'exclusion que je comprenais déjà.

> **Une question qu'on se pose et qu'on ne referme pas devient une affirmation
> dans le texte qu'on écrit ensuite.** Celle-ci est sortie sous la forme la plus
> autorisée du dépôt — une entrée de `DELIBERATELY_WIDE`, c'est-à-dire l'endroit
> réservé aux décisions INSTRUITES — avec « Mesuré, pas supposé » écrit dessus.

Correctif : la clause passe à `PARTICIPATION_VIVANTE`, l'entrée d'inventaire est
**supprimée** (pas réécrite), et l'admission est jugée LOCALEMENT
(`liveMembers.has(userId)`) au lieu d'être déléguée au filtre de l'appelé —
« une garde de confidentialité qui dépend du câblage de l'appelant échoue en
montrant PLUS » est écrit deux paragraphes plus haut dans cette même unité.

### Le cliquet certifiait deux clauses qui ANNULENT la loi

#20091 avait fermé `bannedAt: { not: null }` — le MOT contre la polarité. Deux
orthographes passaient encore, et ce sont les deux façons normales d'écrire une
exception :

| clause | verdict rendu | vérité |
|---|---|---|
| `{ isActive: true, NOT: { bannedAt: null } }` | **conforme** | audience composée EXCLUSIVEMENT de bannis |
| `{ isActive: true, OR: [{ bannedAt: null }, { role: 'creator' }] }` | **conforme** | un créateur **banni** passe |

C'est la **deuxième** fois que ce cliquet se trompe dans le sens rassurant sur
cette même question : dans le lot qui dénonçait ce défaut, puis dans celui qui le
réparait. La reconnaissance est désormais une **liste blanche** de formes, pas
une recherche de mot — et la liste blanche est le bon sens d'erreur : une
orthographe valide non prévue est comptée NUE.

### Le discriminant d'identité faisait DISPARAÎTRE des audiences, sans trace

« Aucune forme négative ne SÉLECTIONNE » était écrit comme une propriété
générale ; le code ne l'implémentait que pour `{ not: … }` au premier niveau.
Hors de vue, donc : `{ notIn: … }`, `NOT: { userId }`, `{ not: { in: … } }`, tout
opérateur de PLAGE (`{ gt: curseur }` — une pagination keyset faisait passer une
audience entière pour une porte), et toute clé commençant par `id`/`userId`
faute de frontière de mot (`idempotencyKey:`, `userIdsExcluded:`).

Quatre audiences réelles en sont sorties, dont deux qui comptent :
`memberAdmission` (l'éventail de « X a rejoint ») et **`creatorSuccession`** — un
banni-mais-actif est éligible à la SUCCESSION, donc peut être élu créateur de la
conversation dont il est exclu.

> Les deux discriminants lisaient le `where` par expression régulière sur son
> TEXTE ENTIER. **La portée (à quel niveau ?) et la polarité (dans quel sens ?)
> sont exactement les deux choses qu'une expression régulière ne peut pas voir —
> et les deux qui décident du verdict.** Ils lisent désormais les paires de
> premier niveau, combinateurs `AND`/`OR` traversés, `NOT` non traversé, et la
> traversée s'arrête avant les filtres de RELATION (y entrer transformerait une
> audience en porte, l'erreur inverse).

### Le correctif en CODE pouvait s'annuler sans qu'un témoin rougisse

`participationEstVivante` vaut `isActive === true && bannedAt == null`, et
**`undefined == null` est vrai**. Le journal du lot avait écrit qu'un champ non
projeté « rendrait `false` pour TOUT LE MONDE » : vrai d'`isActive`, **faux et
dangereux de `bannedAt`**, qui rend la garde passante. Mesuré par l'audit : en
retirant `bannedAt: true` du `select`, la suite gateway ENTIÈRE reste verte.

> **Les deux moitiés d'une loi jugée après lecture n'échouent pas du même côté.**
> Celle qui ferme se voit tout de suite ; celle qui ouvre ne se voit jamais. Un
> témoin de comportement ne peut attraper que la première — d'où un témoin sur la
> REQUÊTE, la règle que le dépôt écrit déjà pour le Prisme.

### Et mon premier témoin de la fuite d'édition ne pouvait pas tomber

Je l'avais écrit avec une porte de sortie (`if (calls.length === 0) return`)
« au cas où » le batch ne serait pas appelé. Sous la mutation inverse, il est
resté VERT. Le harnais retenu est celui de l'audit, livré ROUGE — et sa fixture a
dû gagner un membre LÉGITIME, sans quoi le correctif court-circuite l'appel et le
témoin redevient vert par absence.

> Deux fois dans le même témoin, la même erreur sous deux formes : une porte de
> sortie dans l'assertion, puis une fixture dont le cas nominal ne se produit
> pas. **« Vert » et « vert pour la bonne raison » ne se distinguent qu'en
> exécutant la mutation.**

### Les comptes, encore

Quatre textes de famille annonçaient des totaux — « ces sept sites », « ces
quatre nombres », « les quatre sites », « dix-huit projections ». **Trois ont été
rendus faux par le lot lui-même**, qui ajoutait des entrées sous un texte se
lisant comme exhaustif. Les numéraux sont retirés, et un témoin interdit
désormais qu'un texte de famille annonce un total **que rien ne nomme** — un
compte qui NOMME ses membres (« les deux lectures de `conversation-partners` »)
reste vérifiable, un total nu dérive.

### Ce que l'audit a vérifié JUSTE

Les six refus décidés tiennent (les deux transports du gate de blocage, l'égalité
exacte de `callGroupConversation`, les trois questions de `conversation-encryption`),
la preuve de modèle tient, `anonymousUsername` est bien la seule audience que
`findFirst` fait entrer, et le correctif de l'éventail est réel — rouge dès qu'on
remet `isActive` nu.

### Ce qu'il n'a pas pu vérifier, et qui reste ouvert

**Aucun accès base** : personne n'a compté les lignes `isActive: true,
bannedAt ≠ null` en production. Toutes les fuites de ce cycle sont « possibles »,
pas « dénombrées » — c'est la question que le cycle 194 avait déjà posée et que
personne n'a tranchée. Et les **48 lectures publiées sans raison** (21 portée
indirecte, 9 variable, 6 appel, 5 ternaire, 7 absente) restent non instruites :
le relevé les publie, le lot ne les ouvre pas, et aucun témoin ne dit ce qu'elles
décident.

Enfin : le lot touche la frontière E2EE (l'enveloppe par appareil sur la charge
push). **Un audit cryptographique tiers reste requis** avant de présenter Meeshy
comme une messagerie chiffrée — l'agent le dit lui-même, et il a raison de le
dire.
