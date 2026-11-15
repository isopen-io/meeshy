# Cycle 142 — un rattrapage de lecture déclarait lus trente messages que personne n'avait vus, et un transport remplacé laissait l'envoi sur l'horloge

**Issues livrées** : #16746 (lot A, passerelle) et #16744 (lot B, iOS/SDK).
**Branche** : `claude/exciting-planck-unyioy`. **Milestone** : #244.
**Issues ouvertes en chemin** : #16745, #16752 (milestone #245) · #16747, #16748,
#16749 (milestone #246) · #16750 (milestone #247) · #16751, #16753 (sans
milestone).

## Ce que ce cycle a cédé, et pourquoi c'est la première décision

Le cycle 140 a déposé six défauts vérifiés et en a livré deux. Au démarrage de
celui-ci, **la PR #16720 d'une session sœur portait déjà #16687, #16689 et
#16691**, et son diff réécrivait `offlineParticipantQueue.ts`,
`MeeshySocketIOManager.ts`, `broadcastMessageMutation.ts`, `AuthHandler.ts` et
six autres fichiers du cœur socket. #16688 et #16706, restés ouverts, exigent
tous deux `offlineParticipantQueue.ts`.

Le corollaire d'asymétrie a donc tranché sans négociation : **celui qui n'a rien
écrit cède.** Le cœur socket de la passerelle était pris ; l'audit est parti
ailleurs — trois volets sur le client iOS/SDK, que nulle branche vivante
n'écrivait, et un quatrième sur les surfaces temps réel de la passerelle HORS
de la liste de ce diff, l'exclusion étant donnée aux agents comme une
contrainte dure.

## La contrainte qui a décidé de la forme du cycle

**Aucune chaîne Swift dans ce conteneur** (`swift: command not found`). Un lot
iOS n'est donc prouvable que par la CI macOS (`sdk-tests.yml`, qui porte un
`workflow_dispatch` avec `only_testing`), à ~40 min l'aller-retour et sans
itération locale ; un lot passerelle se prouve sur place en quelques secondes.

Ce n'est pas une excuse à ne rien livrer en Swift — c'est ce qui décide du
GRAIN de ce qu'on y livre. Le lot iOS retenu tient en deux lignes de production
et une garde de source ; le lot le plus lourd du cycle est allé côté
passerelle, où le rouge se prouve avant de pousser.

## Lot A — un rattrapage ne déclare lus que les messages jusqu'à SA frontière (#16746)

`MarkReadBodySchema.caughtUpToMessageId` énonce son contrat : « Fait avancer le
curseur de non-lus jusque-là — donc vide le badge — **sans élargir d'un seul
message l'ensemble déclaré LU**. […] Les confondre gonflerait les coches
bleues. »

Le mode EXACT l'implémentait. Le mode HÉRITÉ ne lisait pas le champ **du tout**
— et c'est la **seule forme que le web envoie** sur son chemin de lecture
nominal : `pushReadReceipt` poste `{ type: 'read', caughtUpToMessageId }` sans
aucun `messageIds`.

Le piège est dans `markFor` : il entre bien en mode « exact » sur la seule
présence du champ, mais passe `messageIds: args.targeted`, **undefined**. Donc
`exactMessageIds` est nul, `if (exactMessageIds)` est faux, et la branche
héritée prend la main — celle qui avance le curseur sur le **dernier message EN
BASE** et grave `readAt` sur tout l'intervalle `(prevReadAt, now]`, borné par
l'horloge **MURALE**.

> **Un drapeau nommé `exact` calculé sur un champ, et une branche choisie sur un
> AUTRE champ.** Les deux lignes sont à quinze fichiers l'une de l'autre et
> chacune se lit juste. C'est la forme du cycle 103 (« le `default` du schéma
> rend la précondition du gestionnaire inatteignable ») déplacée d'une couche :
> ici c'est l'APPELANT qui rend le mode du gestionnaire inatteignable, en
> annonçant une précision qu'il ne transmet pas.

### Le dégât est PERMANENT, et c'est le rejeu hors ligne qui le déclenche

La file de `receipts.ts` rejoue le job **à l'identique** (son doc le dit).
Frontière `m100`, dix minutes hors ligne, `m101…m130` arrivés :

| écran | ce qui se passe |
|---|---|
| le lecteur | pastille à **0**, séparateur « non lus » disparu, et `lastReadMessageCreatedAt` posé sur `m130` — les trente du milieu ne sont **plus jamais comptés** |
| l'expéditeur | les trente passent en **lu**, et le gel est **write-once** : rien ne le défait |

### Le correctif est une RESSERRE, et la nuance a décidé du lot

La lecture LITTÉRALE du contrat (« sans élargir d'un seul message ») conduit à
ne RIEN figer sur ce chemin. C'eût été un défaut pire : le web n'a que deux
écritures d'accusé, et la seconde (`pushRead`, corps nu) est le geste
« marquer comme lu ». Un défilement cesserait donc de produire la moindre coche
chez l'expéditeur — un changement de PRODUIT, que ce lot n'a pas à décider.

Retenu : **borner, pas supprimer.** Le curseur se pose sur la frontière
rapportée ; le gel est borné par `until`, la POSITION de la frontière et jamais
l'horloge murale. Les messages que le lecteur a réellement atteints gardent
leur accusé ; ceux arrivés après ne le reçoivent plus. La question stricte est
consignée dans l'issue comme décision produit, pas tranchée en chemin.

Trois décisions de forme :
- **La frontière se résout UNE fois pour les deux modes**, avec son `createdAt`,
  et la garde d'appartenance de #4179 les sert tous les deux — **une requête de
  moins**, le mode exact la relisant pour lui seul. La route, elle, avait DÉJÀ
  lu `belongs.createdAt` quinze lignes plus haut et le jetait : « avant de
  conclure qu'une garde coûterait une requête, regarder ce que le site lit
  déjà ».
- **Fail-CLOSED sur une frontière étrangère** : elle n'acquitte RIEN, et ne fait
  surtout pas retomber la lecture sur la forme héritée — celle-ci saute au
  dernier message en base, c'est-à-dire exactement le dommage. Le mode exact
  garde son gel et son avance par préfixe : lui a un ensemble affiché à honorer.
- **Le gel « lu implique livré » garde l'horloge murale.** Un message reçu l'est
  vraiment. Il se distingue du gel de lecture par sa borne BASSE
  (`since: prevDeliveredAt`, donc aucun `gt` quand le curseur de livraison est
  neuf) — et c'est ce discriminant, trouvé en lisant l'échec du premier témoin,
  qui permet d'assert sur le bon appel.

### Le témoin en deux moitiés

4 témoins. **3 TOMBENT** sans le correctif — le curseur, la borne du gel, la
frontière étrangère — et **1 reste VERT des deux côtés** : « marquer comme lu
sans frontière », la forme héritée intacte. C'est lui qui garde le correctif
d'être trop large, et sans lui rien n'aurait signalé que la resserre venait de
casser le geste « marquer comme lu ».

### Le cliquet de taille a eu raison, et il a changé le lot

Les témoins étaient d'abord allés dans `MessageReadStatusService.test.ts`. Rouge
immédiat : ce fichier est **hors budget** (dette héritée gelée), et la règle est
« ajouter à un fichier déjà hors budget est interdit : on extrait d'abord, on
ajoute ensuite ». Suite séparée créée
(`message-read-status-catch-up-frontier.test.ts`), fichier d'origine **identique
à l'octet** (`git diff` vide), rouge re-prouvé dans le nouveau site.

## Lot B — un transport remplacé retire le précédent (#16744)

`SocketTransportRetirement` existe parce que Socket.IO arme l'expiration d'un
`emitWithAck` avec une référence **FAIBLE** au client : le transport relâché
n'appelle ni la réponse ni l'expiration, et la tâche qui attendait reste
suspendue pour toujours.

Les deux gestionnaires DÉTIENNENT la loi et l'appellent à leur porte de
démontage. **Le site qui REMPLACE un transport ne l'appelait pas** :
`establishTransport()` réassigne `manager` alors que son garde-fou d'entrée ne
couvre que `.connected || .connecting`. Un socket coupé par la passerelle
(`tokenExpiryWatch`, expiration du JWT) reste non-nil et `.disconnected` — il
passe dessous **avec ses accusés en vol**. `sendAsync` ne rend alors jamais la
main, donc jamais le `nil` qui déclenche le repli REST/outbox : le message reste
sur l'horloge pour toute la session, et la continuation est retenue pour la vie
du processus.

> Le doc-comment de la loi ÉNUMÈRE ses moments — « arrière-plan, rotation du
> jeton, reconnexion forcée ». Les trois sont des DÉMONTAGES. Le REMPLACEMENT
> est un quatrième, absent de la liste : **leçon 261 appliquée à une loi du
> SDK**, et non plus à un inventaire de sites de la passerelle.

Inventaire des sites de construction : **3, dont 1 déjà couvert** —
`connectAnonymous` passe par `suspendTransport()`, et le commentaire qui
l'accompagne montre que son auteur avait instruit la question du démontage. Les
deux autres ne l'avaient pas.

La grâce de 12 s était déjà dimensionnée pour ce cas : au-dessus du plus long
`timingOutAfter` de la couche (10 s, vérifié sur tous les accusés de
`Sockets/`). Et `retire` pose `reconnects = false`, donc le remplacement cesse
aussi de laisser un transport fantôme réessayer dans le dos du nouveau.

### Une garde de SOURCE, et pourquoi c'était le bon outil ici

`transportRetirement` est `private let` sur deux **singletons**, sans point
d'injection : aucune surface publique ne rend la retraite observable. Le motif
existait au dépôt (`SocketCompressionSourceGuardTests`, `CallEmitSourceGuardTests`)
avec sa justification écrite, et il a été reprise telle quelle.

Sa portée est la **FONCTION**, jamais une fenêtre de N lignes — une fenêtre
large eût accepté une retraite écrite dans la fonction précédente, et une
fenêtre étroite eût rougi sur `connectAnonymous`, conforme. Cinq témoins sur
sources fabriquées prouvent qu'elle TOMBE : site non couvert, retraite dans la
fonction d'à côté, et simple mention en commentaire.

**Le rouge a été prouvé hors Swift**, faute de chaîne : le prédicat de la garde
a été rejoué en Python sur les deux révisions des deux fichiers. Avant, il nomme
les deux `establishTransport` ; après, inventaire vide, pour des comptes de 2 et
1 sites — les comptes que la garde assert aussi. La preuve Swift elle-même est
le `workflow_dispatch` de `sdk-tests.yml`.

## Une analyse ERRONÉE, consignée pour qu'elle ne se refasse pas

Le volet « convergence d'état » a rendu, avec une évidence par ligne, que le
badge d'icône tombait à 0 sur une lecture PARTIELLE et n'en revenait pas.
**Vérifié, et faux** sur son étape décisive : `broadcastReadStatus` émet
`CONVERSATION_UNREAD_UPDATED` à la room personnelle de l'acteur **APRÈS** la
boucle des `READ_STATUS_UPDATED`, avec l'arriéré réel, et le rang 3
(`serverUnread`) l'applique inconditionnellement. Le badge se répare seul ; le
symptôme réel est un clignotement.

L'analyse n'avait pas inventé sa prémisse : elle l'avait LUE dans un commentaire
de production — « *the mark-read route emits only `read-status:updated`, never an
unread-updated=0* » — vrai à son écriture, faux depuis que la route porte son
`emitUnreadUpdate` final.

> **Un commentaire périmé ne rougit pas, et il coûte un cycle d'audit.** Il ne
> trompe pas seulement la lecture humaine : il fournit à une analyse par ailleurs
> rigoureuse l'unique prémisse qu'elle ne va pas revérifier, parce qu'elle est
> écrite à l'endroit exact où la question se pose. C'est la forme du cycle 108
> (« un commentaire d'impossibilité ne rougit jamais ») vue depuis l'auditeur.

Ce qui RESTE de ce volet, et qui est réel, est déposé en #16753 : le rang 2 du
registre — la monotonie anti-rejeu — n'a **aucun appelant de production**, donc
`serverLastReadAt` n'est jamais posé et la garde ne peut pas s'armer. Une loi
écrite, motivée et testée que rien n'appelle : la forme même des cycles 139 et
140, cette fois côté client.

**Méthode qui en sort** : un rapport d'audit se reçoit comme une piste, pas comme
un constat. Les quatre volets de ce cycle ont rendu onze défauts ; les quatre
re-vérifiés ligne à ligne par la session ont tous tenu sauf celui-ci, dont
l'étape fausse était précisément celle qu'aucune ligne du rapport ne citait —
l'ordre d'émission du SERVEUR, à l'autre bout du système que le volet examinait.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0**, 0 ligne (lu HORS pipe — le code de retour d'un pipeline est celui de sa dernière commande) |
| suite ciblée (service + freeze + route + cliquet de taille) | **10 suites / 290 témoins verts** |
| suite gateway complète | **2 521+ suites vertes**, rouges limités aux 6 suites de codecs d'image |
| rouge prouvé, lot A | 3 des 4 témoins tombent sans le correctif ; le 4e (non-régression) vert des deux côtés |
| rouge prouvé, lot B | prédicat rejoué sur les deux révisions : avant, nomme les 2 fonctions ; après, vide |

Les rouges restants sont **étrangers aux deux lots** : ce sont les 6 suites de
codecs (HEIF, AVIF 10 bits, carte de gain HDR, orientation EXIF) que le cycle
139 a mesurées et documentées — capacité libvips du conteneur, vertes en CI. Le
7e rouge de la première passe était MIEN (le cliquet de taille) et il est réparé.

## Dimensions

**Mûres** : 1 (Sécurité — un tiers n'est plus déclaré avoir lu ce qu'il n'a pas
vu, et une frontière étrangère n'acquitte rien), 11 (Maintenabilité — une
résolution de frontière partagée au lieu de deux, une requête de moins, une loi
de retraite appelée par tous ses sites, deux gardes), 13 (Complétude — la forme
que le web envoie était couverte par zéro témoin ; les 3 sites de construction
de transport relevés).

**Restantes, avec leur issue** : #16746 note la décision produit non tranchée
(un défilement passif doit-il déclarer `readAt` du tout ?) ; #16753 porte le
rang mort du registre de lecture.

## Ce que ce cycle a déposé et n'a pas pris

| issue | sujet | vérifié par la session ? |
|---|---|---|
| #16745 | la position EN DIRECT ignore le blocage (seule famille de signal de salon à ne pas le filtrer) | non |
| #16752 | la garde de blocage du « regard » échoue OUVERT | non |
| #16747 | le clair d'un message enfilé survit au scellement E2EE (`outbox.payload`) | non — lot sensible, `auditeur-adversarial` avant fusion |
| #16748 | deux flushers d'outbox cassent l'ordre de composition | non |
| #16749 | `retryItem` réarme une ligne `.inflight` qu'un dispatcher porte | **oui** |
| #16750 | un invité de lien ne se reconnecte jamais (échelle gardée par le JWT) | non |
| #16751 | la traduction d'une story compte les événements, pas les langues | non |
| #16753 | le rang 2 du registre de lecture n'a aucun appelant | **oui** |

Et, intacts du cycle 140 : **#16688** et **#16706**, tous deux cédés à la PR
#16720 pour cause de fichier partagé, à reprendre quand elle aura fusionné.
