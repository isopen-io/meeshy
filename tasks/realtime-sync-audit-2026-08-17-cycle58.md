# Cycle 58 — la socket des notifications pouvait mourir DÉFINITIVEMENT, en silence

## 1. D'où vient la piste

Pas du carnet du cycle 57. Ses huit pistes sont intactes (§8 ici), mais aucune
n'a été prise : le balayage de PHASE 2 demandé par la routine — « reconnection
strategy, exponential backoff, heartbeat » — a rendu quelque chose de plus
grave que ce que le carnet portait.

Le dépôt a **deux** sockets Socket.IO côté web, et une seule a été durcie :

| | `socketio/connection.service.ts` | `notification-socketio.singleton.ts` |
|---|---|---|
| jeton du handshake | **résolveur** (`resolveHandshakeToken`) | **littéral** `auth: { token }` |
| `reconnect_failed` | **écouté**, passe la main à un backoff manuel | **personne** |
| paliers | 1 s → 30 s, gigue 0.5 | 5 s, aucun `Max` |

Les deux corrections de la colonne de gauche portent chacune un commentaire qui
DÉCRIT la panne qu'elle supprime. Ni l'une ni l'autre n'a traversé vers la
jumelle. C'est la forme que ce dépôt produit le plus souvent : non pas un défaut
inconnu, mais un défaut **déjà diagnostiqué, corrigé une fois, et laissé
intact dans le fichier d'à côté**.

## 2. Les deux défauts, et pourquoi le premier ARME le second

### 2.1 (a) Le jeton du handshake était figé à la construction

```ts
this.socket = io(backendUrl, { auth: { token }, … });
```

Socket.IO rejoue l'option `auth` **à chaque tentative de reconnexion**. Passée
en littéral, la socket reste épinglée à vie au jeton avec lequel elle a été
construite. Après un rafraîchissement silencieux (chemin 401 REST —
`authManager.updateTokens()`), les cinq tentatives re-présentent des
identifiants que la gateway refuse, **sur une session dont les identifiants
valides dorment en `localStorage` depuis le début.**

La jumelle documente mot pour mot ce scénario à `resolveHandshakeToken()`. Elle
l'a corrigé ; la socket des notifications ne l'a jamais su.

### 2.2 (b) L'abandon définitif de socket.io n'était écouté par personne

`reconnectionAttempts: 5`. Passé ce budget, la boucle interne de socket.io
émet `reconnect_failed` et **cesse définitivement de retenter**. Aucun
`socket.on('reconnect_failed', …)` dans le fichier.

Et rien d'autre ne la relance. `connect()` n'a qu'un appelant
(`use-notifications-manager-rq.tsx:128`), dans un `useEffect` monté sur
l'authentification — qui ne re-tourne pas parce qu'une socket est morte.

**Conséquence : le canal est mort pour le reste de la session d'onglet.** Plus
aucun `notification:new`, `notification:read`, `notification:deleted`,
`notification:counts`. La pastille gèle sur sa dernière valeur.

### 2.3 Le point de jonction — et pourquoi ce n'est pas un défaut « de longue coupure »

(a) fait tomber (b) **en routine**. Il ne faut pas une panne réseau d'une
demi-heure : un simple rafraîchissement de jeton suffit à brûler les cinq
tentatives, puisque les cinq présentent le même jeton périmé.

Et quand il s'agit bien d'une coupure, le seuil est bas : `reconnectionDelay:
5000` **sans** `reconnectionDelayMax` laisse socket.io à son plafond par défaut
de 5 s. Cinq tentatives ≈ **25 s**. Une coupure réseau d'une demi-minute — un
tunnel, un basculement Wi-Fi/4G, une mise en veille d'onglet — tuait le canal.

### 2.4 Le troisième effet, le pire, et celui qui rend le défaut SILENCIEUX

Ce fichier porte le SyncEngine web. Sa reconnexion émet `desync('reconnect')` :

> « la coupure a créé une fenêtre aveugle : aucun event n'est arrivé, donc aucun
> `_seq` n'a pu révéler le trou. Signal inconditionnel. »

Ce signal est **le seul rattrapage** du client web — le fichier l'écrit
lui-même deux lignes plus haut : « le client web n'a aucune autre voie de
rattrapage (`staleTime: Infinity` côté React Query) ».

Or `desync('reconnect')` n'est émis que sur un `connect`. Une socket qui ne se
reconnecte plus jamais **n'émet plus jamais le signal qui aurait réparé l'écran**.
Le défaut ne se contente pas d'arrêter le flux : il désarme aussi son propre
rattrapage. Rien à l'écran ne le dit — c'est une pastille qui a simplement
cessé de bouger.

### 2.5 Un compteur écrit et jamais lu

`this.reconnectAttempts++` dans `connect_error`, `= 0` dans `connect` et
`disconnect`. **Aucune lecture, nulle part.** Il donnait au fichier l'apparence
d'une gestion de tentatives qui n'existait pas — et c'est probablement ce qui a
fait passer la relecture : le fichier *avait l'air* de compter ses essais.

## 3. Le correctif

Trois gestes, dont un que la jumelle n'avait pas à faire.

1. **Le jeton devient un résolveur.** `auth: (cb) => cb({ token:
   this.resolveHandshakeToken() })`, avec repli sur le jeton confié à
   `connect()` pour un porteur sans `localStorage`. Chaque handshake redemande.

2. **`reconnect_failed` passe la main à une boucle manuelle.** Backoff
   exponentiel plafonné avec gigue (`min(1000·2^n, 30000) + rand·1000`), palier
   remis à zéro par toute connexion réussie. Le canal ne peut plus mourir
   définitivement.

3. **La subtilité propre à ce fichier — séparer le démontage TECHNIQUE du reset
   SÉMANTIQUE.** La reprise ne DOIT pas passer par `disconnect()`, qui remet
   `hasConnectedBefore = false` et réinitialise `syncSeq`. Reconstruire par
   `disconnect()` aurait rendu la socket **sans rendre le rattrapage** : la
   connexion réparée n'aurait plus été vue comme une RE-connexion (donc pas de
   `desync('reconnect')`, §2.4) et le curseur `_seq` aurait été effacé (donc le
   trou suivant invisible). D'où `teardownSocket()`, purement technique, dont
   `disconnect()` devient le sur-ensemble.

C'est le geste que la jumelle n'avait pas à poser — elle ne porte pas le
curseur `_seq` — et c'est celui sur lequel une reprise « évidente » se serait
trompée en silence.

Les paliers sont alignés sur la jumelle (1 s → 30 s, gigue 0.5) : la boucle
interne couvre désormais bien plus qu'une demi-minute avant de céder la main.

Le compteur mort est retiré, remplacé par `manualRetryAttempt`, qui lui est lu.

## 4. Gates

- **Suite web COMPLÈTE** : **582 suites / 12 485 témoins verts**, 21 ignorés,
  sortie 0. Aucune régression ailleurs.
- **Le fichier visé** : 55 → **65 témoins** (10 neufs).
- **`tsc --noEmit` web** : **1234 erreurs sur `main`, 1233 sur la branche**,
  mesurées sur le MÊME arbre (`git stash` entre les deux relevés). **Zéro erreur
  nouvelle, une préexistante supprimée** — la signature variadique de `mockIo`,
  sans laquelle `mock.calls` se type en tuple vide et aucun témoin ne peut lire
  les options du handshake.
- **Parité locale** : `bun install --frozen-lockfile --ignore-scripts`,
  `prisma generate --generator client`, puis `packages/shared` reconstruit —
  faute de quoi 23 suites web échouent sur `moduleNameMapper → dist/`.

### 4.1 Preuve par mutation

Six mutations, cinq sous-dosages et un sur-dosage :

| mutation | témoins rouges |
|---|---|
| `auth` redevient un littéral | **2** |
| plus de listener `reconnect_failed` | **6** |
| la reprise passe par `disconnect()` au lieu de `teardownSocket()` | **2** |
| le palier n'est pas remis à zéro par une connexion réussie | **1** |
| `disconnect()` n'annule pas la reprise en vol | **1** |
| **(sur-dosage)** garde « plus de jeton » retirée | **0** |

Contrôle après chaque retour à l'original : 65/65.

La troisième ligne est celle qui compte : c'est la mutation qui rend la socket
et perd le rattrapage, exactement le piège du §3-3. Deux témoins la voient — et
ils ne la verraient PAS si je ne les avais pas corrigés (§4.2).

### 4.2 Deux témoins qui passaient à VIDE, et ce que ça a coûté de le voir

Écrits d'abord, les témoins « signale un resync » et « garde le curseur `_seq` »
étaient **verts avant le correctif**. Ils émettaient `connect` sur
`currentSocketMock` — c'est-à-dire sur la socket d'ORIGINE, puisque aucune
neuve n'était construite. Ils vérifiaient donc que la socket vivante se comporte
bien, ce qui n'a jamais été en doute.

Corrigés par une assertion d'identité (`expect(currentSocketMock).not.toBe(dead)`)
posée AVANT l'émission : le témoin exige maintenant qu'une socket NEUVE existe,
et n'observe le comportement que sur celle-là.

C'est la deuxième fois en trois cycles qu'un témoin de reconnexion passe à vide
parce que le double de socket ne change pas d'identité. La leçon est écrite.

### 4.3 Une garde retirée plutôt que gardée

Le sur-dosage du tableau (`!this.authToken` dans `scheduleManualRetry`) n'a fait
rougir **aucun** témoin. Vérification faite, il est inatteignable : après un
logout, `disconnect()` a déjà purgé les listeners ET le minuteur, donc
`reconnect_failed` ne peut plus arriver. La garde est retirée plutôt que
couverte par un témoin qui n'aurait mesuré que le double. La protection réelle
vit dans `cancelManualRetry()`, dont la mutation, elle, est rouge.

## 5. Portée — qui était touché

Tout porteur web authentifié, sur trois déclencheurs ordinaires :
rafraîchissement silencieux de jeton (§2.1), coupure réseau > ~25 s (§2.3),
redémarrage de la gateway. Aucun message d'erreur, aucun indicateur : la
`ConnectionStatusIndicator` s'appuie sur `onDisconnect`, que socket.io a bien
émis — puis plus rien ne dit que la reconnexion a cessé d'être tentée.

Le couloir des MESSAGES n'était pas touché : il porte les deux corrections
depuis leurs cycles respectifs. C'est bien le canal des notifications seul —
pastille, compteurs, demandes d'amis (`use-friend-requests-v2.ts` s'abonne à la
même socket).

## 6. Écarté délibérément

**Passer `reconnectionAttempts: Infinity`.** Une ligne, et le canal ne meurt
plus. Écarté : la boucle interne de socket.io ne reconstruit jamais la socket,
elle rejoue le handshake — donc, en cas de refus d'authentification persistant,
elle boucle pour la vie sur un jeton refusé sans jamais laisser au code une
occasion de reprendre la main. La boucle manuelle passe par `openSocket()`, qui
relit le jeton et repart d'une socket propre.

**Notifier les abonnés `onDisconnect` sur `reconnect_failed`.** Tentant pour
l'indicateur, écarté : socket.io a DÉJÀ émis `disconnect` avant d'entrer dans sa
boucle, les abonnés savent. Un second appel avec une raison qu'ils ne
connaissent pas aurait changé le contrat de tous les consommateurs pour un
cycle dont ce n'est pas le sujet.

**Un abonnement à `authManager.registerOnTokensUpdated()`.** Ce serait la
correction ACTIVE de (a) — reconnecter dès qu'un jeton neuf atterrit, au lieu
d'attendre le prochain handshake. Écarté : le résolveur suffit à rendre chaque
tentative correcte, et l'abonnement ajouterait un cycle de vie (désabonnement,
double connexion) sans qu'aucun défaut constaté ne l'exige.

## 7. Découvert en chemin, NON traité

**Le drain hors-ligne reste destructif et clé par UTILISATEUR** (piste n°2 du
cycle 57, re-confirmée en passant). Instruit plus avant ce cycle : la porte
d'enfilage est `connectedUsers.has(key)`, une Map **par utilisateur**, si bien
que la file ne se remplit QUE si TOUS les appareils sont absents. Le défaut est
donc double, et l'autre moitié est la plus fréquente : un appareil absent
pendant qu'un autre est connecté ne reçoit **rien** à sa reconnexion, pas même
un rejeu partiel. La correction est une file par APPAREIL, ce qui suppose une
identité d'appareil que la socket ne porte pas aujourd'hui — un cycle entier, et
sans doute plusieurs.

**Vérifié NON défaut en chemin** (pour que le carnet ne les reprenne pas) :
`_registerUser` / `handleDisconnection` sont cohérents sur la clé multi-socket
(`userSockets` est bien un Set par clé, la suppression n'a lieu qu'au dernier
socket) ; les douze `eventType` de la file ont tous une émission de rejeu dans
`_drainedEmissions` ; `conversationPreferencesSync` et les préférences de
communauté diffusent bien vers la room utilisateur, donc le multi-appareil des
états épinglé/muet/archivé est correct.

## 8. Pistes pour le cycle 59 — repérées, NON livrées

1. **Le garde de source « tout `CLIENT_EVENTS` a un handler gateway »** (cycle
   57 §8-1) — intacte, et toujours la seule direction sans faux positif.
2. **La file hors-ligne par APPAREIL** (§7) — instruite plus avant ici, toujours
   non livrée, et désormais chiffrée : deux moitiés, pas une.
3. **`attachment:reaction-*` et `message:consumed` sans lecteur web** (cycle 57
   §8-3) — décision produit, pas correctif.
4. **Le mock inerte de `presence.service.test.ts`** (cycle 56 §5) — intacte.
5. **Le code mort des trois hooks de préférences React Query** (cycle 55) —
   intacte.
6. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, toujours bloquée sur l'absence de Xcode.
7. **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte,
   cosmétique (le volet dangereux est clos au cycle 56 bis).
8. **Les DEUX sockets web sont-elles la bonne architecture ?** Nouvelle. Ce
   cycle corrige la seconde en recopiant la première ; la question que ça pose
   est de savoir pourquoi il y en a deux. Une seule socket multiplexée
   supprimerait la classe entière de défauts « corrigé d'un côté, pas de
   l'autre » — dont ce cycle est la troisième occurrence.
