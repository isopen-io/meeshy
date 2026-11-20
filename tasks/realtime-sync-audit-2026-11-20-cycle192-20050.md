# Cycle 192 — borner une lecture qui compose un COMPLÉMENT, c'est choisir entre perdre et fuir

*2026-11-20, à la suite directe du cycle 191 (#20020, branche
`claude/exciting-planck-cgf6zu`). Branche `claude/exciting-planck-qvri7u`,
PR #20071. Livre **#20050**, le suivi le plus sensible que le 191 a laissé.
Numéroté 192 : 190 et 191 sont pris par d'autres sessions du même jour — un
identifiant qui ne s'alloue pas collisionne (#5102).*

---

## Le fait du cycle n'est pas le correctif : c'est que le lot précédent n'avait pas de PR

Le cycle 191 a livré les points 2 et 3 de #20020 — `scanLiveParticipants`
devient le site unique de la borne, quatre lectures le rejoignent, un cliquet
gèle les seize qui restent — l'a poussé sur sa branche, l'a commenté sur
l'issue… et **n'a jamais ouvert de PR.** Le travail était donc fini et invisible :
`dev` ne le portait pas, et la branche n'était citée par aucune PR ouverte.

> **Un lot qui s'arrête à sa branche n'est pas livré.** La règle de la routine —
> « se baser sur le développement précédent » — a donc eu, ce cycle-ci, une
> lecture littérale : la première chose à faire était de CONDUIRE le précédent
> jusqu'à la fusion, pas d'écrire du neuf à côté. Relu, remesuré sur la tête de
> `dev` (0 conflit de chemin, 13 commits de `dev` entre-temps), 34 suites vertes,
> `tsc` à 0 : le travail tenait. Il manquait une PR.

## Le constat de #20050, et pourquoi #20020 l'avait GELÉ au lieu de le corriger

`translationReaders` (#9709) rend DEUX listes, et elles ne se dégradent **pas
dans le même sens** :

| ce qu'elle rend | ce qu'une troncature en fait |
|---|---|
| `rooms` — les lecteurs AUTORISÉS | moins de rooms ⇒ une remise perdue |
| `excludedQueueKeys` — ceux qui ne doivent RIEN recevoir | moins de clés ⇒ **une porte ouverte** |

La seconde est un **COMPLÉMENT** : `actifs moins admis`. Chaque ligne qu'une
lecture bornée ne voit pas est une personne qu'on **cesse d'exclure** — un
lecteur sous plancher d'historique reçoit alors, dans une file qui le garde
48 h, la traduction d'un message que quatre portes lui refusent (`GET …/messages`,
`/sync`, `conversation:updated`, `GET /attachments/:id`).

> C'est la forme de #20007 avec l'inversion qui la rend plus grave : là, une
> troncature APPAUVRISSAIT une diffusion ; ici, elle OUVRE un accès. D'où la
> décision du cycle 191 de geler ce site au cliquet, avec sa raison écrite,
> plutôt que de le borner au passage — **borner sans rendre le site fail-closed
> aurait été pire que de le laisser nu.** Un cycle entier entre le relevé et la
> réparation est la forme normale d'un lot de confidentialité, pas un retard.

## Ce que le lot livre

Les trois lectures passent par le site unique, et le verdict de complétude
devient le TROISIÈME état de la loi — `{kind:'unknown'}`, celui que les
appelants portent déjà depuis #17026 (`MessageReadership`).

| lecture | question | troncature ⇒ |
|---|---|---|
| `suspects` | vivants **et** arrivés APRÈS le message | `unknown` — zéro suspect vu vaut « personne n'est sous plancher », donc la room ENTIÈRE servie : c'est la seule des trois dont la troncature ÉLARGIT l'audience |
| `active` | **ACTIFS** (bannis compris) — la base du complément | `unknown` — sous-exclusion, donc fuite durable |
| `admitted` | vivants, liens non échus | `unknown`, par le verdict commun — voir ci-dessous |

Et deux choses qui ne sont pas des détails de forme :

- **`scanActiveParticipants`** est la question PLUS LARGE que la participation
  vivante, posée explicitement : elle GARDE les bannis, parce qu'un banni doit
  figurer dans un complément (il est actif, il n'est pas admis) alors qu'il n'a
  rien à faire dans une audience. C'était la seule occurrence du dépôt où la
  clause s'écrivait à la main — l'issue demandait de « confirmer comme une
  DÉCISION écrite, ou aligner » ; c'est une décision, avec la même machinerie
  (borne, sonde `cap + 1`, journal, verdict) et aucune réécriture.
- **`narrow`** est la seule liberté qu'un appelant obtient sur le `where`, et
  elle ne peut que RÉTRÉCIR. Sans elle, la lecture des suspects paierait
  l'audience ENTIÈRE pour une question qui, au cas nominal, ne rend rien — et
  l'alternative (laisser ce site écrire son propre `take`) rendait au cycle 191
  la discipline locale qu'il venait de retirer.

## La branche qu'on n'écrit PAS, et comment on le prouve

L'issue prescrivait trois verdicts distincts, dont « `admittedRows` nomme les
AUTORISÉS ⇒ une troncature y retire des lecteurs légitimes : perte, pas fuite ».
C'est juste — et la branche correspondante est **INATTEIGNABLE** : `active`
(`isActive: true`) est un SUR-ENSEMBLE de `admitted` (`isActive` + `bannedAt`
nul) sous le MÊME plafond, donc si les admis débordent, les actifs débordent
aussi, et le verdict commun a déjà répondu.

> **Une piste d'issue peut être juste sur le raisonnement et porter une branche
> que le code ne peut pas atteindre.** L'écrire quand même aurait produit du code
> mort d'apparence prudente — la pire forme, puisqu'un lecteur futur l'aurait lu
> comme la preuve qu'on y avait pensé. Le dire sur place, avec la raison
> d'inclusion, coûte trois lignes de commentaire et reste vérifiable.

## La distinction qui a décidé la forme : une PANNE n'est pas une TRONCATURE

Les deux sortent du site unique par la même valeur (`complete: false`). Elles ne
s'arbitrent pas pareil ici :

- une **troncature** est une RÉPONSE ⇒ `unknown` ;
- une **panne** reste une LEVÉE, parce que **cinq appelants la NOMMENT par leur
  propre `onError`** (`messageReadership`, `broadcastMessageMutation`,
  `emitAttachmentUpdated`, `messageMentions`, `deliverTextTranslation`). La
  remplacer par `unknown` aurait rendu le lot plus « propre » et aurait coûté le
  seul diagnostic de ces cinq sites : une traduction définitivement perdue pour
  les absents ne laisserait qu'un `warn` d'un module que personne ne regarde.

C'est ce qui explique la forme du helper `boundedRead`, qui relève la panne par
`onError` pour la RELEVER ensuite. Elle n'est pas élégante ; elle est fidèle.

## Le ROUGE, mesuré

| mutation | témoins rouges |
|---|---|
| le code d'AVANT en entier (trois lectures nues) | **4** |
| la clause de complétude des SUSPECTS retirée | 2 — et la loi rend `readers` dont `rooms` porte la room d'un invité sous plancher |
| la clause de complétude des ACTIFS retirée | 1 — et `excludedQueueKeys` perd sa clé, donc la file dépose chez lui |
| le `take` retiré du site unique | 1 (la sonde `cap + 1` n'est plus là) |

Le double de test **honore le `take`** : sans cela, aucun témoin de borne ne
peut tomber — un double qui rend tout ce qu'on lui demande atteste une lecture
bornée aussi bien qu'une lecture nue. Et il ÉVALUE le `where`
(`matchesMongoWhere`), donc la sélection se juge sur ce qu'elle rend.

## Un couplage qui devient un témoin

Ce site écrivait `ADMITTED_FILE_READER_WHERE` ; il écrit maintenant la clause du
site unique, `PARTICIPATION_VIVANTE`. Les deux **sont** la même chose
(`fileReaderAdmission.ts`, affectation directe) — et c'est exactement ce qui
rend le passage sûr tant que c'est vrai.

> Chercher une clause par son NOM, c'est manquer les sites qui l'écrivent
> autrement (cycle 105). **La réciproque est qu'un site qui CHANGE de nom de
> clause doit prouver que la clause n'a pas changé** — un témoin d'une ligne, qui
> tombera le jour où la porte de lecture des fichiers se durcit, et forcera à
> relire ce site dans le même lot au lieu de le laisser suivre en silence.

## Ce qui RESTE

- **#20020, point 1** — partager la lecture entre l'audience et la file sur les
  mutations d'id (`MessageMutationQueueParams` ne porte pas `participants`).
  Chemins tenus par d'autres branches vivantes aux deux derniers relevés.
- **#20051** — les treize lectures nues restantes, dont DEUX servent la liste
  comme EFFECTIF (`memberCount: remaining.length`) : un effectif tronqué est un
  nombre FAUX servi aux clients, pas une audience partielle.
- **Non mesuré, troisième cycle de suite** : existe-t-il en production une
  conversation de plus de 2 000 participants vivants ? Le lot ne répond pas
  davantage ; il rend seulement la question moins chère, puisque le verdict de
  troncature est désormais JOURNALISÉ sur les trois lectures de cette loi.

---

## L'audit adversarial a rendu BLOQUANT, et il avait raison sur les deux

Tout ce qui précède a été écrit avant l'audit. Le raisonnement du lot a tenu —
aucune fuite trouvée dans la loi, l'inatteignabilité de la branche des ADMIS
confirmée par la mesure, les neuf appelants vérifiés fail-closed. **Et le lot
cassait deux suites, dont un cliquet de SÉCURITÉ.**

### Ce que le premier jet a cassé, et pourquoi je ne l'avais pas vu

| | |
|---|---|
| **BLOQUANT 1** | `conversation-audience-living-participation` (#16690), 2 témoins sur 4 |
| **BLOQUANT 2** | `AttachmentReactionHandler`, 3 témoins d'une garantie DURABLE |

Les deux étaient **hors du motif de test** que j'avais joué. « 34 suites /
603 témoins verts » était vrai et ne disait rien du dépôt : un motif composé à
partir des fichiers qu'on touche mesure ce qu'on savait déjà chercher. Leçon :
`tasks/lessons/2026-11-20-un-motif-de-test-est-une-affirmation-sur-le-motif.md`.

**BLOQUANT 1 — le discriminant avait quitté le littéral.** La machinerie bornée
recevait la clause de participation en PARAMÈTRE (`where: { conversationId,
...participation }`), si bien que la distinction « audience ⇒ loi étroite /
refus ⇒ sur-ensemble » — que #16690 tient sur le LITTÉRAL du `where` — était
devenue un choix de NOM DE FONCTION, qu'aucun balayage ne lit. Le site unique de
la BORNE et le littéral de la CLAUSE ne sont pas le même site unique.
`boundedScan` reçoit désormais la LECTURE, jamais le `where` ; la sonde reste
incessible. Et l'entrée d'exemption a DÉMÉNAGÉ sur l'adresse qu'elle motive
désormais, raison comprise — une entrée qui ne désigne plus rien autorise en
silence un site futur qui reprendrait sa clé. Leçon :
`tasks/lessons/2026-11-20-un-refactor-qui-sort-un-discriminant-du-litteral-casse-le-cliquet-qui-le-lit.md`.

**BLOQUANT 2 — un `await` de plus a révélé trois témoins qui attestaient par
chance.** L'enfilage hors ligne d'une réaction de pièce part en promesse
DÉTACHÉE ; `await handler.handleAdd(…)` ne l'attend pas. La production est
intacte (l'enfilage a lieu, un tick plus tard) ; les témoins l'observaient par
ordonnancement des microtâches. Ils drainent maintenant — **les deux témoins
NÉGATIFS du même bloc compris**, qui n'attendaient pas non plus et passaient
donc trivialement.

### Le constat que je n'avais pas vu venir, et que j'avais pourtant à moitié vu

`narrowing` — l'option que ce lot crée — **pouvait ÉLARGIR l'audience**, sous un
doc-comment qui affirmait l'inverse. Un objet ÉTALÉ à côté de la loi, donc
`{ OR: [...] }` — la façon NATURELLE d'écrire un rétrécissement disjonctif —
écrasait l'`OR` de `bannedAt` et faisait perdre la garde de BANNISSEMENT, sur un
type d'options partagé par les audiences de DIFFUSION. Le piège est NOMMÉ dans
le dépôt (`utils/prisma-unset.ts`), et ce lot y ouvrait un chemin générique
documenté comme sûr.

> J'avais relevé l'ordre du spread moi-même, et décidé d'attendre la fin de
> l'audit pour y toucher (l'auditeur mutait l'arbre vivant). **Une remarque
> gardée pour plus tard n'est pas une garde** : si l'audit ne l'avait pas
> trouvée, elle serait partie dans la PR avec son doc-comment rassurant. Un
> constat qu'on tient se consigne — ici, il aurait suffi de l'écrire dans le
> commentaire du lot.

La forme livrée : `narrowing` est un TABLEAU de clauses, placé dans un `AND` —
un appelant ne peut plus qu'ajouter une conjonction. Et la question des ACTIFS
n'en admet AUCUNE : `narrowing?: never`, parce qu'une simple ABSENCE compile dès
que l'appelant passe une variable, et la fonction l'ignorerait en silence. Le
compilateur a attrapé ce cas dans l'heure qui a suivi (`translationReaders`
passait bien ses options d'audience au scan des actifs).

### Les quatre mutations, et ce que chacune fait voir

Trois des quatre ne faisaient tomber AUCUN témoin du premier jet — dont un qui
se félicitait justement que « le double honore le `take` ».

| mutation | ce que le témoin voit maintenant |
|---|---|
| garde de complétude des SUSPECTS retirée | `'room'` au lieu d'`'unknown'` — **toute la room servie** |
| le complément part des ADMIS au lieu des ACTIFS | `u-banni` **disparaît** de l'exclusion |
| `shareLinkId` retiré de la projection des ADMIS | `user:u-echu` **revient** dans les rooms servies |
| `narrowing` étalé au lieu d'`AND` | `p-banni` **revient** dans l'audience vivante |

La troisième est un défaut PRÉ-EXISTANT que le lot a rendu visible : le double
de test n'honorait pas le `select`, donc retirer `shareLinkId` de la projection
rouvrait la porte des liens ÉCHUS en laissant 20 suites et 410 témoins verts.
Le double est désormais `findManyIn`, qui honore le `where`, le `select` ET le
`take`.

### Et le témoin qui NOMMAIT la troncature des suspects ne pouvait pas tomber

Sa fixture tournait à `cap: 1` avec trois participants : les lectures
ACTIFS/ADMIS débordaient aussi, et le verdict commun rendait `unknown` quelle
que soit la garde. Il passait pour une raison qui n'était pas la sienne. Sa
fixture porte maintenant un suspect NON bloqué (lien qui ouvre l'historique) en
PREMIER et le bloqué en second : la troncature garde le premier, `blocked` est
vide, et la loi sort sur `{kind:'room'}` **avant** les deux autres lectures —
c'est le seul montage où cette garde-là est la seule à décider.

> **Un témoin qui porte le NOM d'une garde doit tomber quand cette garde seule
> tombe.** Vérifier qu'il rougit ne suffit pas : il faut vérifier qu'il rougit
> pour SA raison, et cela se mesure en mutant cette garde-là, isolément.

---

## Suite du même cycle — le superset de `message:new` (#20051, premier lot)

Le lot précédent fermé et fusionné, le cycle a enchaîné sur la liste gelée, en
prenant le site dont la troncature coûte le plus cher — et pas celui qui était
le plus facile.

`fetchParticipantSuperset` (`socketio/participant-superset.ts`) est le site
unique du `select` que les quatre transports de `message:new` partagent, et sa
valeur voyage jusqu'à la **file hors ligne** (`params.participants`). C'est la
TROISIÈME porte de sortie d'un message, et la seule DURABLE : un destinataire
déconnecté n'apprend l'existence du message que par le rejeu.

La fonction séparait déjà l'ignorance de l'affirmation, et son doc-comment
disait pourquoi : `undefined` ⇒ « je n'ai rien prouvé », et l'unité partagée
refait SA requête ; `[]` ⇒ « aucun participant », donc n'enfile pour personne
(cycle 116). **Il manquait le troisième cas** — une liste TRONQUÉE, que la borne
rend possible, et que la file traiterait comme la liste ENTIÈRE.

> **Le consommateur destructif ne fait qu'une différence : liste, ou pas de
> liste.** C'est ce qui décide le verdict : une troncature s'y rend comme une
> PANNE. Les deux restent séparées dans le JOURNAL — `scanLiveParticipants`
> émet sa ligne de troncature avec le transport dans son `scanLabel` — mais pas
> dans ce qui est rendu, parce que l'appelant n'a pas de troisième branche à
> offrir. Rendre les lignes lues aurait été le pire des trois comportements
> possibles : les absents non nommés ne recevraient jamais le message, ni en
> direct (ils sont hors ligne), ni au rejeu (ils n'auraient pas d'entrée).

C'est l'asymétrie de #20050 portée au contenu le plus cher du produit, et la
raison pour laquelle ce site-là non plus ne pouvait pas être borné « au
passage ».

**Le ROUGE, mesuré avant l'implémentation** : trois participants vivants, un
plafond à deux ⇒ la fonction rendait **les trois lignes** et aucune borne
(`take: undefined`). Les deux témoins tombaient.

**Ce que le double honore, et pourquoi c'est la moitié du lot** : `findManyIn`
projette le `select` comme Prisma le projette, et le témoin de projection a
servi dès l'écriture — ma fixture posait les préférences de langue à PLAT sur
le participant, quand `PREVIEW_PRISM_PARTICIPANT_SELECT` les demande sur la
ligne `User` imbriquée. Un double qui rend le document entier aurait accepté ma
fixture fausse et attesté une projection que la production ne fait pas.
