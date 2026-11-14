# Cycle 159 — deux horloges pour une suppression, et un éventail qui tombe entier pour un lecteur

*2026-11-14. Branche `claude/message-deleted-server-clock`, partie de `dev` à
`b5e865400` (la tête juste après la fusion de #18369).*

**Livré** : #18159 (le dernier des neuf pièges armés du cycle 157), #18380 et
#18384 (tous deux trouvés par l'audit de ce cycle), et #18399 — un rouge de
`dev` qui n'était celui de personne, trouvé en allant chercher le verdict de CI.
**Mesuré et inventorié, non corrigé** : #18381 et #18382 — deux issues ouvertes
avec leur mesure, et #18385 pour la moitié iOS du lot A.
**Mesuré CLEAN, et dit pour qu'on cesse d'y dépenser** : deux des quatre
questions de l'audit.

---

## Lot A — `message:deleted` ne portait aucune horloge, et les TROIS clients en
inventaient une (#18159)

Le cycle 157 avait relevé neuf champs de miroirs Kotlin que le contrat ne
déclare nulle part ; le cycle 158 en a retiré sept. Le dernier,
`MessageDeletedEvent.deletedAt`, était le seul qui soit **LU** — et l'issue
disait déjà, à sa création, que c'était le contrat qui avait tort.

Mesuré sur les trois clients, et c'est la même phrase trois fois :

| client | ce qu'il fait de l'heure du retrait |
|---|---|
| Android | `markDeleted(messageId, deletedAt ?: now)` — `MessageRealtimeApplier.kt:43` |
| iOS | `let deletedAt = Date()` — `ConversationSyncEngine+Socket.swift:359` |
| web | `applyMessageDeleted(…, now = new Date())` — `realtime-message-mutations.ts` |

Aucun ne pouvait faire autrement : `MessageDeletedEventData` ne portait que
`{ messageId, conversationId }`.

**Ce que ça coûte, en deux temps.** Deux appareils du même compte datent la
MÊME suppression différemment, et un appareil dont l'horloge dérive range la
bulle au mauvais endroit — c'est la classe que le cycle 126 avait déjà payée
sur les bulles pré-enregistrées. Et surtout : un destinataire ABSENT au moment
du retrait rejoue l'entrée de la file hors ligne **à sa reconnexion**, des
heures plus tard, et c'est de cette heure-là que sa pierre tombale est datée —
ainsi que toutes les citations qu'elle scelle (`sealDeleted`, `followQuotes`).

Le correctif est additif : le contrat déclare `deletedAt` (ISO 8601), et les
trois émetteurs prennent l'heure **UNE fois** pour l'écrire ET l'émettre.
Le compilateur a nommé les quatre sites à la première compilation —
`Anonymized<T>` étant homomorphe, `MessageDeletedMutationPayload` a hérité du
champ sans qu'on y touche.

**Android est servi par ce seul lot** : son miroir lit déjà le champ. iOS
attend une session avec Xcode (ce conteneur n'a pas de chaîne Swift) ; le web
est servi ici.

### Ce que la rétrocompatibilité exigeait, et ce qu'elle a révélé

Le champ est REQUIS au contrat (un émetteur DOIT le servir) et lu OPTIONNEL par
les clients. Trois raisons qui ne se recouvrent pas :

1. un serveur d'avant ce lot ne l'envoie pas — un client neuf doit tourner
   contre lui ;
2. une entrée de file écrite avant est rejouée **telle qu'elle a été stockée**
   (`isDeliverableQueuedPayload` ne vérifie que « c'est un objet ») ;
3. **deux appelants LOCAUX du web dérivent ce retrait sans aucune horloge
   serveur** — `performDeleteForEveryone` (la suppression optimiste) et
   `applyAttachmentDeleted` (la dernière pièce jointe d'un message).

La troisième n'était pas prévue : elle est tombée du compilateur. Exiger le
champ les aurait forcés à en fabriquer un, c'est-à-dire **à faire passer une
horloge locale pour celle du serveur** — exactement ce que le lot corrige.
`MessageDeletedDelivery` nomme donc l'écart entre ce que le contrat DÉCLARE et
ce qu'une réception PROUVE, plutôt que de le laisser à un cast.

> **Un type de contrat et un type de RÉCEPTION ne sont pas le même type.** Le
> premier dit ce qu'un émetteur doit servir ; le second, ce qu'un lecteur peut
> tenir pour acquis. Les confondre force soit un émetteur à mentir, soit un
> lecteur à caster.

### Le témoin qui pouvait tomber

Assertion sur l'ÉGALITÉ avec la colonne écrite, pas sur « un horodatage est
présent » : une implémentation qui recompose un `new Date()` à l'émission
satisferait la seconde. Mais elle rendrait la même milliseconde la plupart du
temps — le témoin serait **intermittent**, ce qui est pire que rien : un témoin
intermittent se lit comme un harnais instable, pas comme un défaut.

Le témoin AVANCE donc l'horloge de 5 s entre l'écriture et l'émission (fake
timers, avancée dans le double de `prisma.message.update`). Rouge déterministe
sous la mutation qu'il nomme :

```
Expected: "2026-11-14T10:00:00.000Z"
Received: "2026-11-14T10:00:05.000Z"
```

### Preuves

| preuve | résultat |
|---|---|
| `socket-payload-dead-field-gate`, entrée laissée en place | ROUGE, et elle NOMME : « `MessageDeletedEvent.deletedAt` (#18159) ne diverge plus » |
| les 5 gardes socket de `packages/shared` | 30/30 |
| `MessageHandlerDelete` | 32/32 |
| les trois suites de suppression (socket + 2 REST) | vertes |
| `tsc --noEmit` gateway et web | verts |
| web, 3 témoins (heure servie / absente / illisible) | le premier ROUGE sans le correctif |

---

## Lot B — un éventail qui tombe ENTIER pour un lecteur (#18380)

### Ce que l'audit a dit, et ce que la mesure a corrigé

L'audit de ce cycle attribuait le défaut au seul producteur WS, sur la foi que
son jumeau REST « garde ce bloc séparément ». C'était exact sur la présence du
`catch` — et le témoin écrit pour le confirmer est tombé sur **les DEUX** :

```
✕ WS      : `conversation:unread-updated` n'est plus émis
✕ REST/ZMQ : `conversation:unread-updated` n'est plus émis
```

Le `catch` du jumeau est NOMMÉ « non-bloquant ». Il attrape bien la levée ; il
ne la **confine** pas — la pastille de non-lus vit dans la même unité gardée,
douze lignes plus bas.

> **Un `catch` ATTRAPE une levée ; il ne la CONFINE pas.** Leçon :
> `tasks/lessons/2026-11-14-un-catch-attrape-une-levee-il-ne-la-confine-pas.md`.

### Les quatre sites, et ce que chacun perdait

`conversation:updated` a **quatre** émetteurs (l'audit en voyait trois ; le
quatrième, `emitConversationActivityUpdate`, est sorti du balayage qui a servi
à poser le cliquet). Tous composent une charge PAR destinataire — le Prisme de
l'aperçu est résolu par lecteur — et la poussent dans une boucle écrite à la
main :

| émetteur | ce qu'une levée coûtait |
|---|---|
| `MessageHandler.broadcastNewMessage` (WS `message:send`, **PRIMAIRE**) | les lecteurs suivants, la pastille de non-lus, l'accusé ✓ → ✓✓ |
| `postMessageSyncFanOut` (REST/ZMQ) | les lecteurs suivants, la pastille de non-lus |
| `emitConversationPreviewUpdate` (édition / suppression) | les lecteurs suivants |
| `emitConversationActivityUpdate` (réaction, appel, rang de liste) | les lecteurs suivants |

Pour l'utilisateur : la ligne ne remonte pas, la pastille **garde sa valeur
précédente** (la liste web tourne en `staleTime: Infinity` — elle ne devient pas
périmée, elle MENT), et sur le transport primaire l'expéditeur reste bloqué sur
un seul ✓ pendant qu'aucun destinataire ne reçoit d'accusé. La file hors ligne,
elle, est intacte : elle passe AVANT, et quatre témoins gardent déjà sa place.

### Le correctif

Un site unique — `socketio/conversationUpdatedPerReader.ts` — qui porte la
règle et sa raison. Les quatre boucles le dérivent ; les `continue` deviennent
un `null` rendu, ce qu'ils ont toujours voulu dire.

**La composition est DANS la portée gardée**, délibérément : `compose` lit la
ligne du participant courant, donc elle lève pour les mêmes raisons que
l'émission. La garder dehors aurait laissé la moitié du risque — la plus
spécifique au lecteur — hors de la garde. Un témoin le dit.

**Plus un balayage**, parce qu'un type ne peut pas garder ce résultat : rien
n'oblige un cinquième émetteur à importer le site unique, et sa boucle
compilerait parfaitement. `conversation-updated-door-sweep.test.ts`, inventaire
VIDE, même forme que `server-emit-door-sweep` — et prouvé ROUGE en
réintroduisant une émission à la main.

| preuve | résultat |
|---|---|
| `conversationUpdatedPerReader` (unité) | 5/5 — émission qui lève, composition qui lève, charge `null`, erreur nommée avec sa room |
| `message-new-producer-parity` | 34/34, dont les deux témoins #18380 rouges avant le lot |
| `src/socketio/` + `unit/handlers/` | 162 suites, 2 796 témoins |
| balayage de porte réintroduite | ROUGE, et il NOMME le fichier |

---

## Lot C — le message d'arrivée partait avant que l'arrivant ne soit dans la room (#18384)

Les QUATRE portes d'admission postent le même message système d'arrivée
(`postJoinSystemMessage` → `message:new` vers `conversation:<id>`). **Les trois
qui servent un COMPTE le faisaient avant d'y admettre sa socket.** L'arrivant ne
recevait donc pas son propre message d'arrivée — et la file hors ligne ne le
rattrapait pas : il figure déjà dans `connectedUsers` et ne porte aucun
marqueur d'injoignabilité (#18381).

Deux d'entre elles lançaient en plus l'admission **sans l'attendre**, ce qui
faisait courir la fenêtre jusque dans les diffusions d'adhésion — que le
doc-comment de la troisième déclarait pourtant précédées par elle :

> « L'admission dans la room, AVANT l'annonce : l'une sert l'arrivant, l'autre
> parle de lui aux autres, et **c'est la première qui décide s'il recevra quoi
> que ce soit du fil** » — `performLinkJoin`

La phrase était juste et ne couvrait que la seconde des deux diffusions. Le
message système part plus tôt, **dans une autre fonction** — c'est ce qui l'a
mise hors de portée de son propre énoncé.

> **Un doc-comment qui énonce un ORDRE ne garde que les gestes qu'il voit.**
> Même famille que « un commentaire qui ÉNONCE une contrainte est une
> AFFIRMATION » (cycle 94), avec le discriminant de PORTÉE du lot B : ce qui
> échappe à la phrase est ce qui vit dans une autre unité.

Correctif : l'admission est hissée et **attendue** aux trois portes. Sur la
porte par lien, elle descend dans `joinAsRegistered` — c'est là que l'ordre se
décide — par un relais `admitToRoom`, et le bloc d'aval disparaît plutôt que de
doubler l'appel. Fail-OPEN partout : l'adhésion est déjà PERSISTÉE quand ceci
tourne, et un adaptateur en panne ne doit pas la retenir.

**Lancer sans attendre ne RÉTRÉCIT la fenêtre que de façon non déterministe**,
ce qui est pire qu'une fenêtre franche : le défaut devient intermittent, donc
attribué au réseau.

| preuve | résultat |
|---|---|
| `link-join-room-admission` | 9/9, dont deux témoins d'ORDRE rouges avant le lot (le vrai ordre observé, pas une lecture de source) |
| `membership-admission-sites` | 7/7, dont deux balayages nouveaux — prouvés ROUGES en annulant le lot, et ils NOMMENT les deux fichiers |
| `unit/routes/` + `audit2/` + `unit/services/` | verts |

Le balayage est TEXTUEL, et il faut dire pourquoi : l'ordre de deux appels dans
une fonction n'a pas de témoin de comportement bon marché aux quatre portes
(chacune a son harnais, sa base, ses doubles). Celui de la porte par lien
existe et observe le vrai ordre ; le balayage garde les trois autres, et
surtout la CINQUIÈME, qui y entrera sans que personne y pense — comme le
balayage voisin de #17032, dont il réutilise le discriminant de porte.

---

## Lot D — et `dev` était rouge, pour une raison qui n'était celle de personne (#18399)

Trouvé en allant chercher le verdict de CI du lot C : le gate « Qualité TS »
était ROUGE sur `dev` depuis `ea014872a` (09:27), **avant** la fusion de cette
branche.

`apps/web/scripts/check-utilities.mjs` mesure ce que l'APPLICATION peint — il
oppose les classes citées dans un `className=` à la feuille RÉELLEMENT
produite. Son balayage prenait aussi les TÉMOINS : **5 995 fichiers balayés
dont 2 440 témoins, soit 41 %.**

Une classe inventée par un test pour servir de MARQUEUR à une assertion n'est
le nom d'aucun jeton. Elle ne peut donc avoir aucune règle, et l'opposer à la
feuille pose une question dont la seule réponse possible est « rouge » :

```tsx
className="probe-sheet backdrop:bg-veil"
expect(ghost?.className).toContain('probe-sheet');
```

> **Un balayage qui lit les témoins mesure autre chose que ce qu'il annonce.**
> Il ne devient pas plus strict, il devient faux : la propriété gardée (« ce
> que l'écran peint est déclaré ») ne porte pas sur un fichier qui ne peint
> jamais.

Et le rouge n'était celui de personne : il tombe sur `dev` et sur toute PR qui
s'y rebase, pas sur le lot qui l'a déclenché. C'est le rayon de souffle exact
de #5958 / #5960 — dont le témoin vit DÉJÀ dans ce fichier, pour une autre
source de bruit, avec la même phrase : « `Gates web-v2` a échoué sur `dev` pour
TOUTE PR, pas seulement celle qui touchait le fichier ». Ce lot-là avait
répondu en retirant le bruit du PÉRIMÈTRE plutôt qu'en exemptant une classe ;
c'est la même réponse ici, et **aucune ligne n'entre dans `ALLOWED`** — une
exemption par classe gèle le symptôme et laisse le prochain témoin rougir.

**Le prédicat est ÉTROIT par décision** : il exige le point avant `test` /
`spec`, donc `latest.ts`, `contest.tsx` et `manifest.ts` restent dans le
périmètre. Un filtre plus large retirerait de VRAIS écrans du balayage, ce
qu'aucun rouge ne signalerait.

> **Un faux rouge se voit ; un faux vert, non.** C'est pourquoi un gate se
> resserre plus volontiers qu'il ne s'élargit, et pourquoi le témoin de ce lot
> vérifie les DEUX bornes du périmètre : qu'aucun témoin n'y reste, et qu'il
> reste plus de mille classes à balayer.

| preuve | résultat |
|---|---|
| `node scripts/check-utilities.mjs` sur l'arbre construit | EXIT=0, « 1 318 classes employées, toutes portées par la feuille qui les sert » |
| le MÊME gate, correctif retiré | « 1 classe(s) SANS RÈGLE … `probe-sheet` — `dialog-exit.test.tsx` » |
| périmètre | 5 995 → 3 555 fichiers, 0 témoin, 1 265 classes toujours vues |
| `apps/web/scripts/` | 647 témoins, dont 4 nouveaux |

---

## Ce que l'audit a rendu CLEAN, et pourquoi le dire

Deux des quatre questions sont revenues sans défaut, et les énumérer ÉVITE de
les repayer :

**Les asymétries de room n'existent pas, et la prémisse était fausse.** « Un
événement émis vers `conversation:<id>` manque un lecteur sur l'écran de liste »
ne tient pas dans cette passerelle : chaque socket rejoint TOUTES ses rooms de
conversation à l'authentification (`join-user-conversations.ts:74-81`), pas la
seule conversation ouverte. Les événements qui ont EN PLUS besoin des rooms
personnelles (accusés, badges, `conversation:updated`, mentions) les ont tous.
Le risque résiduel n'est pas « la mauvaise room » mais « une socket qui n'est
pas dans la room où on la croit » — c'est #18381.

**Aucun écouteur `async` non gardé.** Les quatre candidats sont des faux
positifs vérifiés un par un, et les ~40 écouteurs ZMQ sont synchrones avec un
`.catch` explicite. Le cliquet `detached-promise-catch-sweep` fait son travail.

**Aucune émission avant son écriture, aucune émission en double.** Deux
candidats, tous deux faux après lecture.

---

## Suivis ouverts

| # | ce que c'est | état |
|---|---|---|
| #18159 | le dernier des neuf pièges armés | **fermé** par le lot A |
| #18380 | l'éventail qui tombe entier pour un lecteur | **fermé** par le lot B |
| #18381 | un membre ajouté en cours de session peut devenir injoignable (ni réessai, ni marqueur, ni portée multi-nœud) | ouverte |
| #18382 | les accusés de lecture et de remise n'ont ni file ni instantané de reconnexion | ouverte — demande un arbitrage produit entre deux branches |
| #18384 | le message d'arrivée précédait la jonction de room | **fermée** par le lot C |
| #16726 | les marqueurs d'injoignabilité sont hérités par la mauvaise socket | déjà ouverte, confirmée vivante |
| #18120 | la portée COMMUNAUTÉ n'atteint jamais iOS | ouverte — demande Xcode |
| #18124, #18115 | les pièges armés du cycle 157 | ouvertes |
| #18342 | les sept événements sans lecteur | ouverte — demande un verdict par événement |
| #18385 | iOS doit lire le `deletedAt` servi | ouverte — demande Xcode |
| #18399 | le balayage des classes lisait les témoins | **fermée** par le lot D |
