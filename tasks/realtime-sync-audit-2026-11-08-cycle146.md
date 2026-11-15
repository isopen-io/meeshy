# Cycle 146 — une étoile qui n'arrivait jamais, un fil muet pour qui le rejoint, une sortie que personne n'apprend

> **Numéro pris sur `dev` au moment de la réservation** (le 145 y était publié).
> Le remède à la collision d'espace de noms reste #16871 : un identifiant qui ne
> s'alloue pas collisionne, et on ne numérote pas à la main. Celui-ci a été
> poussé dans la première minute du cycle, avec la réservation de ses fichiers.

**Issues livrées** : #16688 (lot A, passerelle — cédée DEUX fois, prise ici) ·
#16941 (lot B) · #16946 (lot C) · #16948 (lot D) · #16951 (lot E) ·
#16956 (lot F).
**Branche** : `claude/exciting-planck-66qtu0`.
**Issues déposées en chemin** : #16961, #16962, #16963, #16964, #16965, #16966.

## Ce que le relevé a donné, et pourquoi il a décidé du cycle

**#16688 était libre.** Cédée au cycle 142 puis au cycle 145 pour contention sur
ses deux fichiers, elle n'était plus écrite par aucune branche vivante : le
relevé par commande (`git diff --name-only origin/dev...<branche>` sur les
soixante branches touchées dans les vingt-quatre dernières heures) a rendu
**zéro contention** sur `offlineParticipantQueue.ts` et `MeeshySocketIOManager.ts`.
La réservation est partie avant la première ligne de logique.

Les six fichiers des lots B à F ont été relevés de la même façon, et étaient
libres tous les six.

## Lot A — la synchronisation multi-appareil ne marchait que si les deux appareils étaient ALLUMÉS (#16688)

`message:starred`, `message:hidden-for-me` et `message:restored-for-me` sont
diffusés sur la seule room `user:{id}`, et leurs deux modules producteurs
écrivent la raison dans leur préambule : « diffuser à `user:{id}` pour que les
AUTRES appareils convergent ». La feature est consommée côté web
(`starred-messages-cache.ts`, dont le doc-comment dit « UN AUTRE APPAREIL, OU
L'ÉCHO DE CE GESTE-CI ») **et** côté iOS.

La file de rejeu hors ligne est le seul rattrapage d'une absence. Ces trois
familles étaient, PAR CONSTRUCTION, les seules qui ne pouvaient jamais y
entrer : `enqueueForOfflineParticipants` décide de l'audience par
`connectedUsers.has(queueKey)`, la clé est le COMPTE — qu'`AuthHandler._registerUser`
indexe pour TOUTES les sockets du compte — et **l'appareil qui pose la marque
EST le compte**.

> **Un test de joignabilité posé sur le COMPTE ne dit rien d'un événement dont
> l'ACTEUR est ce compte.** Il ne mesure pas la présence du destinataire : il
> mesure celle de l'émetteur. C'est « une garde conditionnée à ce qu'elle garde
> est un no-op » déplacée d'une garde vers une AUDIENCE — et c'est plus discret,
> parce que le prédicat est JUSTE pour les onze autres familles, dont l'acteur
> est un tiers.

### Le recours de chaque famille, mesuré plutôt que supposé

| famille | recours hors ligne AVANT ce lot |
|---|---|
| `message:starred` | **AUCUN** — zéro état d'étoile dans les onze fichiers de `GET /sync`, et aucune charge de message n'en porte : les clients le tiennent de `GET /me/starred-messages` et de ce push, de rien d'autre |
| `message:hidden-for-me` | les pierres tombales `hidden` de `GET /sync` — un recours PULL, conditionné à l'appel |
| `message:restored-for-me` | aucun canal push |

C'est la première ligne qui justifie le lot. Et **la mesure a changé le récit** :
le premier jet du commentaire disait « aucun `isStarred` n'existe dans le
dépôt », ce que le balayage a démenti — `apps/web/src/lib/view/message-actions.ts`
en porte un, mais c'est un drapeau de VUE alimenté par l'ensemble des favoris,
pas un champ de charge. La phrase a été resserrée sur ce qui est vrai.

> Un agent d'audit lancé en parallèle a trouvé le même défaut, l'a CÉDÉ en
> voyant l'arbre de travail — et a apporté une mesure que je n'avais pas :
> côté Android, `LocallyHiddenMessagesStore` ne quitte son état que sur
> l'événement socket VIVANT, et `/sync` ne rattrape pas la RESTAURATION, qui
> supprime la ligne `UserMessageDeletion` sans toucher `Message.updatedAt` —
> donc le flux `changed`, borné sur `updatedAt > since`, ne la voit pas. iOS,
> lui, s'auto-répare. **Céder un constat n'est pas céder sa mesure.**

### Trois choix de forme, et chacun a une raison mesurable

**L'enfilage est INCONDITIONNEL.** Rien ne distingue deux sockets d'un même
compte dans cette dimension : enfiler sous condition de non-connexion rejouerait
le prédicat qu'on vient de disqualifier. L'écho que l'appareil acteur reçoit est
inoffensif par PROPRIÉTÉ DES CHARGES, pas par espoir — les trois portent un état
ABSOLU, jamais un delta, et le drain retrie par `enqueuedAt`.

**Les familles de visibilité GROUPENT par conversation.** Le lot de masquage va
jusqu'à 100 ids, la file est bornée à 500 et son `LTRIM` garde les plus
RÉCENTES : cent entrées pour un seul geste évinceraient les messages que le
lecteur n'a pas encore vus. C'est aussi la seule forme que le gate
d'autorisation du drain sache arbitrer, puisqu'il AGRÈGE les `conversationId`.

**Leur `dedupKey` nomme le LOT, pas son premier message.** Sous la clé par
défaut, deux lots qui se recouvrent se supplanteraient par leur premier id
commun, et l'entrée supprimée emporterait sa liste entière. `starred` garde la
clé par défaut, qui est la bonne identité : un état par (lecteur, message), dont
`ENQUEUE_DEDUP_LUA` fait gagner le dernier par supplantation en place.

## Lot B — réagir à la PHOTO d'un message ne remontait aucune liste (#16941)

`AttachmentReactionService` se déclare « Miroir de `ReactionService` » et affirme
que son modèle « suit exactement les réactions message-level ». Il finissait sur
`return { changed: true }` juste après son `upsert`, là où la jumelle appelle
`recordConversationActivity` sous le commentaire qui énonce la directive
#9026 : « une réaction posée est une ACTIVITÉ : la conversation remonte en tête
pour TOUS ses participants ».

Réagir ❤️ au message remontait la conversation chez tout le monde ; réagir ❤️ à
la photo du même message ne bougeait AUCUNE liste — ni en direct, ni au
rechargement, le tri étant max(`lastMessageAt`, `lastActivityAt`), dont aucun
des deux n'avait avancé. Les deux clients émettent ce geste.

### Ce qui l'a tenu invisible est une phrase VRAIE

`announceConversationActivity` documente : « Pour les activités dont aucun autre
événement de liste ne porte le rang : appel, épingle. **La réaction, elle, le
porte avec `lastReaction`** ». Exact de la réaction de MESSAGE, dont
`lastReaction` se résout par `prisma.reaction.findUnique` — et faux d'une
réaction de pièce jointe, qui n'a aucune ligne dans cette table.

> **Un lot ferme une classe dans SA langue.** #9026 a fermé « une réaction
> posée » ; la réaction de pièce jointe en est une, dans une autre table, et ne
> figure dans aucune des deux énumérations qui décident du rang.

D'où `rank: true` et **jamais** `reaction: true` — ce second ferait résoudre
`lastReactionId` dans la table des réactions de message. La pièce jointe est
rangée avec l'appel et l'épingle.

### Le rapport d'audit proposait quatre effets ; j'en ai pris UN, et c'est le résultat

Les trois autres n'étaient pas des correctifs mais des décisions, et la
vérification l'a montré :

- **`lastReactionId`** est résolu par `prisma.reaction.findUnique`. Y écrire un
  `AttachmentReaction.id` ferait que le résolveur ne trouve RIEN et que
  `forgetLastReaction` — qui vit dans l'autre service — ne le nettoie jamais. Le
  champ est `String? @db.ObjectId` **sans relation Prisma** : rien ne refuserait
  l'écriture. Déposé en #16962 avec ses trois formes.
- **`creditReactor` et `notePairInteraction`** exigent d'élargir un constructeur
  qui ne reçoit que `prisma`, donc une décision injection/registre. Déposé en
  #16963.

> **Un rapport d'audit qui énumère « quatre choses que la jumelle fait de plus »
> ne dit pas que les quatre sont des correctifs.** Celui-ci était juste sur les
> quatre absences et muet sur le fait que trois d'entre elles passent par une
> colonne dont le résolveur ne lit qu'une table. Le vérifier a transformé un lot
> risqué en un lot sûr plus deux issues instruites.

## Lot C — qui rejoint par lien n'est dans AUCUNE audience du fil (#16946)

`message:new` part sur la room de conversation SEULE, et les rooms de
participation ne se rejoignent qu'à l'AUTHENTIFICATION. `performLinkJoin` — le
cœur partagé des deux portes — ne joignait **aucune** room : zéro occurrence de
`joinUserToConversationRoom` dans tout le fichier.

Un compte dont la socket vivait déjà au moment de sa jointure restait donc hors
de `conversation:<id>` **pour toute la durée de cette socket**. Et dans l'état
que `AuthHandler` nomme lui-même le pire : « this recipient now looks online but
is absent from these rooms — a message sent to them lands nowhere (no live emit,
no offline enqueue) ». `connectedUsers` le dit joignable, donc tout expéditeur
SAUTE la file hors ligne pour lui. Ni direct, ni rejeu.

**Mesuré sur le web**, seul client à appeler la porte CANONIQUE sous Bearer, et
qui n'émet JAMAIS `conversation:join` — son module socket le déclare, et la
seule occurrence du nom dans `apps/web/src` est ce commentaire. iOS et Android
passent par la porte DÉPRÉCIÉE, qui portait le geste depuis le 2026-08-30 sous
le commentaire « mirrors POST /conversations/:id/participants ».

> **La porte neuve est née sans la règle, et la copie locale de l'ancienne est
> ce qui l'a permis.** Les deux appellent le même cœur ; seule l'ancienne avait
> gardé le geste chez elle. « Une règle retapée à chaque porte est une règle
> qu'une porte finira par ne pas avoir » — ici la règle n'a pas divergé, elle
> n'a simplement pas été recopiée, et personne ne pouvait le voir puisque la
> porte qui l'avait marchait.

La loi passe dans le cœur, la copie locale est RETIRÉE, et un témoin de source
interdit son retour.

## Lot D — la CINQUIÈME porte de fin d'appartenance (#16948)

`endConversationMembership` ouvre sur « Quatre chemins mettent fin à
l'appartenance ». `endGuestSession` est le cinquième, et il n'est dans aucune de
ces listes — leçon 261 : le lot qui les a fermées a fermé « les verbes qui
retirent un MEMBRE », et celle-ci est un verbe de SESSION.

Deux moitiés, toutes deux manquantes :

- **les AUTRES** ne savaient rien. Le web ne retire une rangée du trombinoscope
  que sur `participant-left` / `-banned`, et iOS POSE l'effectif ABSOLU qu'ils
  portent. L'effectif d'une conversation à invités ne pouvait donc **DÉRIVER QUE
  VERS LE HAUT** — l'inverse exact de ce que le commentaire de
  `memberArrivalFanOut.ts` affirmait, faute de compter cette porte ;
- **le SORTANT** gardait tout : sa socket restait dans la room du fil, son
  partage de position vive, son appel et son marqueur « ici » restaient actifs,
  et le cache d'appartenance (5 min) le laissait écrire.

Aucun changement de contrat : `ConversationParticipantLeftEventData` déclare
`participantId` toujours présent et `userId: string | null`. Contrairement à
`participant-joined` (#16838), rien n'était à élargir — le contrat a été RELU,
pas supposé.

### Le compilateur a amélioré le lot deux fois

Déclarer le seul `ConversationRoomEmitter` **compilait**, et aurait laissé
l'éviction sans son verbe : le type demande désormais les DEUX capacités
ensemble (`to` pour annoncer, `in` pour évincer), parce que les deux moitiés de
cette porte ne se servent pas du même appel. Et `identifyTarget` a refusé une
projection partielle — la ligne ENTIÈRE lui est passée, puisque c'est lui qui
porte la loi « `userId` déclare un `User.id` ».

### Et un témoin est tombé pour la MAUVAISE raison

Mon double exposait `socketsLeave` là où `MembershipRoomReader` déclare
`fetchSockets` : l'éviction levait au lieu d'agir, et le témoin rougissait sur
une panne de harnais plutôt que sur le défaut qu'il nomme.

> **Un double ment aussi par ce qu'il FOURNIT** — le pendant de « un double mente
> par ce qu'il accepte » (cycle 112). Et c'est le `as never` du site d'appel qui
> a empêché le compilateur de le dire : un cast dans un témoin désarme la seule
> vérification qui savait que le collaborateur avait changé de forme.

Un témoin de ce lot passait par ailleurs **à VIDE** : `payloads.every(...)` rend
`true` sur une liste vide, donc il était vert AVANT le lot, quand aucun départ
n'était annoncé du tout. Corrigé par une assertion de non-vacuité avant le
`every` — et c'est en CHERCHANT le rouge qu'il s'est vu, pas en relisant
l'assertion.

## Lot E — l'accusé suivait les effets d'après, pas la persistance (#16951)

`AttachmentReactionHandler` accusait en DERNIÈRE instruction du `try` dont le
`catch` répond `{ success: false }`, alors que la réaction est persistée depuis
bien plus haut. La jumelle écrit la règle en toutes lettres : « ACK immediately
… A transient failure in those reads must NOT flip the ACK to failure ».

Une levée de la lecture du résumé ou de l'émission de room produisait TROIS
choses d'un coup : accusé d'ÉCHEC sur une écriture réussie (le client annule son
optimiste et ré-affiche l'absence d'une réaction qui EST en base), aucune
diffusion, et **aucune entrée de file hors ligne** — la seule garantie DURABLE
du chemin, sautée par la levée. Forme littérale du cycle 130 bis, rejouée sur la
famille jumelle.

Les effets d'après vivent dans une unité NOMMÉE, et pas pour la lisibilité :
c'est ce qui rend impossible qu'une levée atteigne le `catch` qui rappellerait
le callback avec un échec APRÈS le succès envoyé.

> **Note d'outil, et elle a coûté un aller-retour** : `prettier` lancé sur ce
> fichier l'a reformaté EN ENTIER, avec des guillemets doubles que le dépôt
> n'emploie pas — 179 insertions pour un changement de vingt lignes. Le
> formatage a été annulé et le lot ré-appliqué à la main. **Un outil de style
> sans configuration partagée fabrique une régression de style sous couvert de
> propreté**, et le seul moyen de le voir est de LIRE son diff.

## Lot F — l'horloge que le handler déclare injectable, personne ne la lisait (#16956)

Rencontré en soldant les rouges du dépôt, et c'est le lot que je ne cherchais
pas. `LocationHandler` déclare `now?: () => Date` et la garde en champ privé.
**Cinq sites de production appelaient `new Date()` en direct**, dont les TROIS
fins de vie d'un partage — mort du socket, clôture du fil, sortie d'un membre —
et les deux composeurs de `stoppedAt`.

Un partage OUVERT sous l'horloge injectée était donc jugé TERMINÉ sous l'horloge
réelle : `_expireSessionNow` sort sur `now >= session.expiresAt`, donc aucune
rétractation ne partait. En production les deux horloges sont la même, donc rien
ne se voyait ; le coût était de rendre **inobservables sous horloge contrôlée**
les trois chemins dont le défaut laisse une épingle de position réelle plantée
jusqu'à huit heures — ce que l'en-tête du handler qualifie lui-même de « défaut
de sécurité avant d'être un défaut d'affichage ».

> **Le témoin était juste ; c'est la production qui ne lisait pas l'horloge
> qu'elle déclare lire.** Devant un rouge, la première question n'est pas « que
> faut-il changer au témoin ? » mais « que nomme-t-il, et est-ce vrai ? ».

Et il n'appartenait à personne : mesuré, aucune branche vivante ne touche ce
fichier. Les cycles 139 à 145 publiaient « six suites de codecs d'image » comme
seuls rouges du dépôt ; il y en avait sept.

## Les trois cliquets que ce cycle a fait rougir

C'est la meilleure partie du cycle, et elle n'était pas prévue.

**La porte d'ENFILAGE** (`delivery-queue-door-sweep`, inventaire VIDE par
principe) a vu l'unité du lot A. Son propre doc-comment annonçait ce cas : « Si
un jour une AUTRE file du service porte une méthode `enqueue`, ce balayage la
signalera — et c'est le bon comportement : l'entrée demande alors une décision
écrite, pas un gel silencieux. » La décision est écrite : il y a DEUX portes
partagées, et le discriminant est l'**AUDIENCE**, pas le nom. La première décide
des participants d'une CONVERSATION absents ; la seconde des autres APPAREILS
d'un compte, que la première ne pouvait pas servir. Un témoin FIGE l'ensemble à
deux — sans lui, **exclure un fichier du balayage suffirait à le rendre vert**,
et c'est la moitié qui donne son sens à un inventaire vide.

**L'inventaire des `findMany` non bornés** a vu la cinquième porte de départ.
Entrée avec sa raison, à côté de ses trois jumelles déjà gelées pour la MÊME
forme : un `take` rendrait l'effectif FAUX, et c'est l'effectif absolu qui fait
converger un client.

**Le cliquet de typecheck des tests** a vu +1 erreur (77 pour un plafond de 76),
et c'était la plus utile du cycle : `queuedMessageArrival.test.ts` déclare un
`Record` COMPLET sur l'union des familles, donc les trois familles neuves ne
compilaient plus tant que leur verdict d'ARRIVÉE n'était pas tranché. C'est
exactement la garde que ce fichier décrit — « c'est précisément par ce silence
que `link-message` s'est retrouvée classée en mutation alors qu'elle est une
création ». **Le plafond n'a pas été monté** : les trois verdicts sont écrits.

> **Un cliquet qui rougit sur un lot JUSTE n'est pas un faux positif : c'est une
> question qu'il pose.** Les trois avaient raison de rougir, et les trois
> réponses ont amélioré le lot — une décision d'audience écrite, une raison
> d'inventaire, et trois verdicts d'arrivée qui manquaient au contrat.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0**, 0 ligne (lu hors pipe) |
| suite gateway COMPLÈTE | **2 546 suites / 39 914 témoins verts** |
| rouges restants | les **6** suites de codecs d'image (HEIF, AVIF 10 bits, carte de gain HDR, orientation EXIF) — capacité libvips du conteneur, documentée aux cycles 139/142/145, verte en CI |
| rouge, lot A | 0 producteur d'entrées avant / 2 après ; aucune des trois familles dans `DRAINED_EVENT` avant ; 19 témoins dont un balayage par famille |
| rouge, lot B | 2 des 5 témoins tombent ; les 3 autres (no-op, panne, retrait) verts des deux côtés |
| rouge, lot C | 3 des 7 témoins tombent ; les 4 autres verts des deux côtés |
| rouge, lot D | 3 des 6 témoins tombent (après correction d'un témoin qui passait à vide) |
| rouge, lot E | suite rejouée contre la révision d'avant : 2 des 4 tombent |
| rouge, lot F | le témoin d'EXPIRATION de `dev` était ROUGE ; 8 suites / 120 témoins verts après |
| cliquets | porte d'enfilage, `findMany` non bornés, typecheck des tests : les trois verts, aucun plafond monté |

Le cycle rend par ailleurs `dev` **moins rouge qu'il ne l'a trouvé** : sept
suites rouges à l'arrivée, six au départ.

## Dimensions

**Mûres** : 13 (Complétude — une étoile atteint l'appareil éteint ; une réaction
de pièce jointe remonte la liste ; qui rejoint par lien reçoit les messages ; un
départ d'invité s'annonce) · 11 (Maintenabilité — une loi d'admission au lieu
d'une copie et d'un silence, deux portes d'enfilage déclarées, une horloge lue
partout) · 1 (Sécurité — un sortant ne lit plus le fil qu'il a quitté, et les
trois fins de vie d'un partage redeviennent observables) · 9 (Compatibilité —
le web pour la jointure par lien, les invités pour le départ) · 6 (Cohérence —
même geste, même effet sur la liste).

**Restantes, avec leur issue** : #16966 porte le résidu de #16688 (la file est
par COMPTE et se draine destructivement : un SECOND appareil absent ne converge
toujours pas) · #16961 l'accusé de remise qui décrit le mauvais message ·
#16962 et #16963 les suites déclarées de #16941 · #16964 le `restore-for-me`
muet · #16965 l'édition perdue pour les pairs EN LIGNE quand la lecture du plan
signé tombe.

**Recette appareil qui revient au porteur** : ouvrir un lien de conversation
depuis le web avec une session déjà connectée et vérifier qu'un message envoyé
par un tiers arrive SANS rechargement (#16946) ; étoiler un message sur un
appareil, l'autre étant éteint, et vérifier l'étoile au réveil du second
(#16688).

## Méthode

Les deux agents d'audit ont rendu **dix constats**. Un était le mien, cédé et
enrichi d'une mesure. Des neuf autres, **cinq ont tenu intégralement** (lots B à
F, plus les quatre déposés), et **aucun n'était faux** — mais l'un était
PARTIELLEMENT actionnable, et c'est le résultat le plus utile : les « quatre
effets manquants » du lot B contenaient un correctif sûr et trois décisions, dont
une qui aurait écrit un id d'une table dans une colonne que le résolveur lit
dans une autre. Un rapport se reçoit comme une piste, et la relecture ne sert
pas seulement à écarter le faux : elle sert à séparer ce qui se corrige de ce
qui se décide.

Et la leçon de forme du cycle n'est pas venue des audits mais des CLIQUETS :
trois ont rougi sur des lots justes, et chaque réponse a ajouté au dépôt ce
qu'aucun des lots n'aurait écrit de lui-même.
