# Cycle 141 — ce qu'une mutation TRANSPORTE, à qui la pastille PART, et ce que « connecté » ne prouve pas

**Issues livrées** : #16689 (lot A), #16691 (lot B), #16687 (lot C).
**Branche** : `claude/exciting-planck-m5oxec`. **Milestones** : #242, #243.

Ce cycle REPREND le dépôt du cycle 139, que le cycle 140 avait entamé sans le
solder : six défauts vérifiés ligne à ligne, deux livrés (#16685, #16690),
quatre laissés ouverts. Trois des quatre sont livrés ici. Le quatrième (#16688,
la convergence multi-appareil) reste ouvert — son propre énoncé dit que ses deux
moitiés « se décident ensemble », et la seconde est une décision de produit.

**Chaque constat du dépôt a été re-vérifié contre l'arbre vivant avant d'être
cru.** Un l'a été faux : #16689 annonçait TROIS transports REST d'édition, il y
en a QUATRE qui appellent `broadcastMessageMutation` — le quatrième émet
`deleted` avec une charge étroite, donc sain. Le compte de l'issue était juste
sur la classe, faux sur l'inventaire ; c'est l'inventaire qui décide du lot.

## Lot A — `message:edited` transportait le `clientMessageId` de son auteur (#16689)

Les trois transports d'édition étalent la ligne Prisma BRUTE
(`...withServedEditAttribution(updatedMessage, …)`) : tous les scalaires,
`clientMessageId` compris. Mesuré : **zéro occurrence** du champ dans
`broadcastMessageMutation.ts`. La charge partait donc à la room avec l'id
optimiste de l'auteur, et `queuedVariant` remettait le MÊME objet à la file, qui
le persistait chez chaque pair absent pour le TTL de 48 h.

La règle a son helper et sa raison écrite : « un rejeu portant le
`clientMessageId` de l'auteur ferait fuiter son espace d'ids optimistes dans
celui d'un autre utilisateur ». `stripClientMessageId` était appliqué sur les
QUATRE chemins d'ENVOI et sur aucun chemin de MUTATION.

### Le type DÉCLARAIT la bonne forme, et ne pouvait pas la tenir

`MessageEditedMutationPayload` est le NOYAU étroit
(`ReturnType<typeof buildMessageEditedCore>`). Les trois sites composent
pourtant `{ ...messageResponse, ...buildMessageEditedCore(...) }` — et **le
contrôle des propriétés excédentaires est invisible à travers un spread**
(§ CLAUDE.md, cycle 106). Le contrat disait étroit ; le fil portait large. Les
témoins passent donc la charge par une VARIABLE, comme la production : un
littéral frais aurait été refusé par le compilateur et aurait masqué le défaut
au lieu de le reproduire.

### Le retrait se pose à l'ENTRÉE, parce que la charge a SIX sorties

Room, variante scellée, plan signé par lecteur, room personnelle, entrée de
file, variante de file par lecteur. Un retrait par appelant serait
l'« inventaire à tenir à jour » de la leçon 279 — le septième chemin ne l'aurait
pas. `withSanitizedPayload` garde le `switch` sur le discriminant : destructurer
l'union rendrait `eventType` et `payload` à deux unions indépendantes, à l'étage
même où le couple vient d'être corrélé.

### Ce que la CONSÉQUENCE est vraiment — correction d'un constat hérité

L'issue annonçait, côté web, qu'« un pair peut prendre l'édition d'un autre pour
la confirmation de son propre envoi optimiste », en citant l'invariant de
`realtime-apply.ts:244-246`. **Mesuré : faux aujourd'hui.** Le cid n'y est lu
que sur le chemin `message:new` (`:228`, `:246`) ; le gestionnaire d'ÉDITION ne
le lit pas. L'invariant du web était donc ARMÉ, pas violé.

La conséquence vivante est ailleurs, et l'issue ne la nommait pas : iOS route
`message:edited` vers `APIMessage` (`MessageSocketRoutes+Messages.swift:19`), et
`APIMessageUpsert+Merge.swift:93` écrit
`next.servedClientMessageId = api.clientMessageId ?? next.servedClientMessageId`.
Le cid de l'auteur se GRAVAIT donc dans la ligne locale du pair, où il alimente
le verdict de couche appareil d'un hybride (`HybridDeviceLayer:66`,
`servedClientMessageId ?? clientMessageId`).

> **Une fuite de champ se qualifie chez ses LECTEURS, un par client.** « Un pair
> pourrait se tromper » est une hypothèse ; « ce décodeur-là l'écrit dans sa
> base » est une mesure. Les deux justifient le même correctif et ne justifient
> pas le même récit — et le message de commit du lot A porte encore la
> formulation héritée de l'issue, plus prudente sur le web qu'elle n'aurait dû,
> et muette sur iOS.

## Lot B — la pastille de non-lus ne partait pas pour un message SANS expéditeur (#16691)

`if (!io || !senderId) return;`. Or **sans expéditeur il n'y a personne à
EXCLURE** : l'ensemble correct est « tous les participants vivants », pas ∅. Le
gate ne protégeait rien, il VIDAIT l'audience. Un message d'agent ou système
déclenchait `message:new`, l'enfilage hors ligne et `conversation:updated` — et
`conversation:unread-updated` ne partait pour personne, la liste web gardant sa
pastille (`staleTime: Infinity`) jusqu'à une relecture complète.

#3614 avait retiré EXACTEMENT ce gate de l'enfilage et l'avait laissé ici, en
documentant le no-op comme un ACQUIS. Forme connue : **un lot ferme une classe
dans SA langue.** Le commentaire, devenu faux, est corrigé dans le même lot.

### Le piège voisin décidait de la forme du correctif

Un retrait NAÏF du gate aurait armé une seconde régression, silencieuse et sur
la population la plus exposée. L'exclusion s'écrit `p.userId !== senderId` ;
avec `senderId` nul, un participant ANONYME (`userId: null`) satisfait
`p.userId === senderId` et se ferait EXCLURE — la pastille retirée à exactement
ceux que le correctif prétend servir. L'exclusion ne tourne donc **pas du tout**
quand il n'y a pas d'auteur, plutôt que de tourner contre une valeur nulle.

> Retirer un gate n'est pas une opération locale : il faut relire ce que le
> code d'APRÈS faisait de la valeur que le gate garantissait non nulle.

## Lot C — « connecté » ne prouve pas « joignable » (#16687)

`AuthHandler` inscrivait la socket dans `connectedUsers` même après l'échec
définitif des jonctions de rooms. La file lisait ce seul test et cessait
d'enfiler ; `io.to(ROOMS.conversation(...))` ne l'atteignait pas davantage.
**Message perdu, sans recours** — rien n'ayant été écrit, il n'y avait rien à
drainer à la reconnexion.

Le défaut était écrit au site, sur vingt lignes, au-dessus de la ligne fautive.

### La réponse apparente aurait troqué un défaut contre trois

« Ne pas inscrire la socket » : `connectedUsers` et `socketToUser` portent aussi
la PRÉSENCE, le `user:status` et le nettoyage à la déconnexion. La socket reste
inscrite ; ce qui change est la QUESTION — non plus « cette clé a-t-elle une
socket ? » mais « cette socket est-elle joignable pour CETTE conversation ? ».

`SocketUser.unreachableConversations`, posé par les DEUX portes avant
l'inscription, recalculé à chaque authentification (une reconnexion saine
l'efface). `connectedUsers.get` est OPTIONNEL : absence de marqueur ⇒ joignable,
soit le comportement d'avant — fail-OUVERT, et c'est le bon sens d'arbitrage.

### Le sens de l'erreur a été MESURÉ, pas supposé

C'est ce qui a débloqué le lot : sur-enfiler expose à un doublon, et **les trois
clients l'absorbent** — le web fusionne par id (`upsertThreadMessage`), iOS
garde un jeu de vus par messageId dont le TTL de 48 h est explicitement calé sur
`DELIVERY_QUEUE_TTL_SECONDS`, Android fait un upsert par clé primaire. Il n'y a
AUCUNE déduplication côté serveur, et aucun témoin ne l'interdit. Sous-enfiler,
à l'inverse, est irrécupérable.

> Un cycle précédent aurait pu refuser ce lot au motif que « le correctif risque
> des doublons ». La bonne réponse n'était pas de l'écarter mais de **mesurer
> l'idempotence des consommateurs**, qui était déjà là, documentée, et dont le
> TTL iOS avoue qu'elle a été écrite pour exactement cette file.

### La porte inscrite était la plus mal placée des deux

`_joinUserConversations` rendait `void` : son appelant n'avait AUCUN accès au
verdict. La porte INVITÉE le capturait déjà — pour le journaliser seulement.

### Une JUMELLE supprimée, et c'est le COMPILATEUR qui l'a nommée

`MeeshySocketIOManager.ts` déclarait son propre `SocketUser`, copie verbatim de
celui de `utils/socket-helpers.ts`. La divergence n'était pas théorique :
`connectedUsers` est typé par celui du manager, et ajouter le champ à l'autre a
fait tomber la compilation. Le manager re-exporte désormais le type canonique.

> **Une jumelle de TYPE ne se cherche pas, elle se révèle au premier champ
> ajouté.** Deux déclarations identiques sont indistinguables d'une seule tant
> que personne n'en fait évoluer une — et c'est la seule qui compte qui était
> invisible : celle que le gate lit.

## Ce que la suite COMPLÈTE a rendu, et que les suites ciblées cachaient

Les suites ciblées des trois lots étaient vertes (213 suites, 3 002 témoins). La
suite complète a rendu **huit** suites rouges là où le cycle 140 avait mesuré
six — les six étant les codecs d'image (capacité libvips du conteneur, verts en
CI). **Les deux de plus étaient les miennes.**

### 1. Le SECOND témoin qui gelait le gate `!senderId`

`MessageHandler.core.test.ts` portait « returns early when senderId is null » —
le même gel que celui re-instruit dans `emitUnreadCountsToRecipients.test.ts`,
dans une autre suite. Les suites ciblées du lot, choisies par le répertoire du
module corrigé, ne l'atteignaient pas.

> **Un correctif qui fait tomber un témoin gelant cherche ses JUMEAUX par le nom
> du GATE, jamais par le répertoire du module.** Le dépôt documente déjà « deux
> exemplaires du même témoin gelaient le symptôme, et le fix de la production
> n'en a fait tomber aucun » ; ici il en a fait tomber un, et c'est la suite
> complète — pas le lot — qui a trouvé l'autre.

### 2. La dette de types que ce témoin a AJOUTÉE

`tsc-never-loaded-tests-ratchet` est passé de 76 à 77. `toHaveBeenCalledWith` à
deux arguments sur un `jest.fn()` sans generics rend **TS2554**, le seul code que
ce cliquet ne musèle pas (il musèle TS2322, TS2339, TS2345, TS2740 — soit
exactement les codes dont la liste d'erreurs de test est pleine). Les arguments
se relisent depuis `mock.calls` : cliquet de retour à 76, **réparé et jamais
relevé**.

> `tsc --noEmit` du gateway EXCLUT les tests : un lot peut rendre EXIT=0 et
> ajouter de la dette de types. Les deux gates sont disjoints, et celui des
> tests ne tourne qu'en suite complète (111 s).

### 3. La ligne de base contre laquelle j'ai mesuré était PÉRIMÉE

**Correction du récit de ce cycle, et c'est la faute la plus chère.** Le
`workflow_dispatch` de la branche a rendu huit rouges. Pour trier les miens,
j'ai confronté la branche au dernier run `dev` **complété**, et j'ai écarté le
run `dev` **en cours** en invoquant la règle du dépôt (« un relevé pris sur un
run inachevé n'est pas un verdict »).

C'est ce run-là qui portait la réponse : `dev` était passé à `d367563cc`
(« épingle ubuntu-24.04 », #16714) et il était **intégralement vert**.

J'ai donc affirmé deux fois, sur la PR, avec tableaux : que les cinq témoins
vidéo et les six suites de codecs d'image étaient « la ligne de base durable de
`dev` », et qu'« aucun correctif n'existe dans le dépôt ». Faux depuis deux
merges. Les deux commentaires sont corrigés publiquement, et #16722 — ouverte
pour un défaut déjà réparé — est fermée avec sa raison.

> **Un run complété vieux de deux merges décrit un `dev` qui n'existe plus.** La
> règle « un run inachevé n'est pas un verdict » interdit de CONCLURE d'un run
> en cours ; elle n'autorise pas à se rabattre sur le dernier verdict archivé.
> La ligne de base d'une PR est l'ÉTAT COURANT de sa base.

Et la conséquence remonte plus haut que ce cycle : **ce que plusieurs journaux
consignaient comme « les rouges de codecs d'image, capacité libvips du
conteneur, verts en CI » était une image de runner qui avait bougé.** Une cause
héritée de journal en journal cesse d'être une mesure et devient une
explication — et une explication dispense de regarder. C'est « un compte est une
AFFIRMATION » (cycle 93) appliqué à une CAUSE, pas à un nombre.

Leçon : `tasks/lessons/2026-11-07-la-ligne-de-base-d-une-pr-est-la-tete-de-sa-base-pas-le-dernier-verdict-archive.md`.

### 4. Un garde de mesure qui a fait son travail

Le garde de corpus du cliquet (« la commande voit bien un corpus substantiel »)
a d'abord rougi parce que `tsc` avait été tué par l'OOM d'une suite complète
tournant en parallèle de mes runs ciblés. Il a refusé une mesure VIDE plutôt que
de la laisser passer au vert — exactement ce pour quoi il est écrit. **Une
mesure faite sous contention n'est pas une mesure** ; la suite complète s'est
rejouée seule.

## Ce qui reste ouvert

| issue | ce qui reste |
|---|---|
| **#16688** | la convergence multi-appareil : la file est par UTILISATEUR, un appareil hors ligne ne converge pas si un autre était connecté. Ses deux moitiés se décident ensemble, et la seconde est une décision de produit. |
| **#16706** | déposée au cycle 140 : le clair d'un message détruit survit dans Redis jusqu'au TTL de 48 h, et `peek` est un second lecteur sans garde. |
| **#16719** (ouverte ici) | `_joinUserConversations` rend `[]` quand la LECTURE des participants lève : la socket n'a rejoint AUCUNE room et aucun marqueur n'est posable, puisqu'on ne peut pas nommer des conversations jamais chargées. Classe distincte de #16687 — et sa difficulté est l'arbitrage, pas le code : le fail-open actuel est DÉLIBÉRÉ, il protège d'une tempête de reconnexions, et le fermer ferait enfiler tout le trafic des comptes qui se reconnectent dans la fenêtre d'une base indisponible. |

## Dimensions

**Mûres** : 1 (Sécurité — l'espace d'ids optimistes d'un auteur ne voyage plus,
ni sur le fil ni en file), 8 (UX — une pastille qui ne mentait plus par
omission), 11 (Maintenabilité — une jumelle de type supprimée, un retrait posé
en site unique, deux témoins gelants re-instruits), 13 (Complétude — les quatre
transports relevés, pas les trois annoncés).

**Restantes** : 9 (Compatibilité multi-appareil, #16688).
