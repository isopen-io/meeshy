# Cycle 132 — une synchronisation qui n'a qu'un déclencheur ÉPHÉMÈRE ne rattrape rien

Date : 2026-08-28 · Issue : #4197 · Branche : `claude/keen-hamilton-4syegh`

Leçon : `tasks/lessons.md` § **Leçon 309**. Base : cycle 131 (#4133, PR #4143),
dont c'est le suivi MESURÉ, écrit et chiffré à sa clôture.

## Le défaut

Le cycle 131 a donné à Android les deux `GET` qui manquaient et un
`PreferencesSyncCoordinator` qui relit le bloc nommé quand
`user:preferences-updated` (scope catégorie) l'annonce. Les deux `GET` n'avaient
**qu'un seul appelant**, et ce déclencheur est une diffusion — c'est-à-dire un
événement qui n'atteint que les appareils **présents pour l'entendre**.

Or un téléphone est, par construction, absent au moment qui compte : son
propriétaire change ses réglages sur le web ou sur son iPhone pendant que
l'application Android est en arrière-plan ou déconnectée. La diffusion n'est alors
jamais délivrée — et rien ne la rejoue : `PreferencesSocketManager.attach()`
enregistre un écouteur, il ne demande pas d'arriéré, et `DataStoreNotificationPreferencesStore`
n'a aucune autre source que son propre `DataStore`.

Le magasin restait donc sur l'ancienne valeur **indéfiniment** — exactement le
symptôme que le cycle 131 venait de fermer, une fenêtre plus loin. Et sur le bloc
de notifications, « périmé » veut dire : le téléphone continue de sonner.

## Ce que le lot a trouvé en chemin

**La relecture pouvait ANNULER un geste de l'utilisateur, et le chemin par
diffusion le pouvait déjà.**

Les écritures de préférences ne sont pas « en ligne d'abord » : un interrupteur
écrit le magasin local, puis une ligne d'**outbox** porte la valeur à la
passerelle dès que le réseau le permet (`NotificationPreferencesSyncRepository`,
`PrivacyPreferencesSyncRepository`, voie `settings`). Au moment précis où une
hydratation de reconnexion part, l'outbox draine donc la MÊME voie, et les deux
courses se croisent :

| ordre | serveur | écran |
|---|---|---|
| PATCH d'abord, relecture ensuite | juste | juste |
| **relecture d'abord, PATCH ensuite** | **juste** | **revenu à l'ancienne valeur, sans rien pour le défaire** |

La seconde branche est la pire forme du défaut qu'on répare : un réglage qui
**revient tout seul** est plus grave qu'un réglage périmé, parce que l'utilisateur
l'a vu changer et le voit se défaire.

Ce défaut n'est pas né de l'hydratation : la passerelle **renvoie** au compte
émetteur la diffusion déclenchée par son propre PATCH, donc un interrupteur
basculé deux fois de suite pouvait déjà courir contre son propre écho. Le nouveau
déclencheur ne l'a pas créé — il l'a fait passer du cas rare au cas **nominal**.

## Ce qui change

| site | ce qui change |
|---|---|
| `OutboxDao` | `hasDeliverableOfKind(lane, kind)` — un `EXISTS`, parce que la seule question posée est un booléen |
| `OutboxRepository` | `hasDeliverable(lane, kind)` — « cet appareil doit-il encore cette écriture au serveur ? » |
| `PreferencesSyncCoordinator` | second collecteur : chaque passage à `CONNECTED` relit les deux blocs en cache ; et un **veto** par kind d'outbox devant CHAQUE relecture, les deux déclencheurs confondus |
| `SdkModule` | lui passe `SocketManager` et `OutboxRepository` |

### Pourquoi l'ÉTAT de connexion, et non le SIGNAL de connexion

`SocketManager` expose les deux : `connected: SharedFlow<Unit>` (replay 0) et
`connectionState: StateFlow<SocketConnectionState>`. Le collecteur lit l'ÉTAT, et
c'est toute sa fiabilité.

Une session s'ouvre en appelant `connect()` **puis** `attach()` — donc `start()`,
qui lance le collecteur, s'exécute alors que la connexion est déjà en cours. Sur
un signal sans replay, une connexion qui aboutit avant que la coroutine du
collecteur ne se soit abonnée est **perdue en silence**, sur le chemin (démarrage
à froid) qui a le plus besoin du rattrapage. Un `StateFlow` rend au contraire sa
valeur courante à l'abonnement : le collecteur en retard voit `CONNECTED` et
hydrate quand même. La conflation donne en prime la forme de la règle — une
hydratation par connexion RÉELLE, aucune pour un état qui se répète.

Témoins dédiés aux deux propriétés : « une connexion antérieure au collecteur
hydrate quand même » et « un `CONNECTED` répété ne relit pas ».

### Pourquoi un veto, et non un arbitrage

Il n'y a rien à arbitrer : la charge de la diffusion ne porte pas de version, et
la réponse du `GET` non plus. Le seul fait connu avec certitude est **« cet
appareil détient une valeur qu'il n'a pas encore réussi à pousser »** — et cela
suffit à trancher, puisque cette valeur est par construction la plus récente des
deux. La catégorie est donc sautée ; l'outbox est déjà en route pour le dire, et
sa livraison déclenchera la diffusion qui fera converger tout le monde.

Le veto est **par kind**, pas par voie : `UPDATE_SETTINGS` et
`UPDATE_PRIVACY_SETTINGS` partagent la voie `settings` délibérément (cycle
précédent : « pour qu'aucune des deux ne supplante l'autre »), donc une écriture
de confidentialité en attente ne doit pas retenir en otage la relecture des
notifications. Témoin dédié.

### Un outbox illisible SAUTE

Les deux façons de se tromper ne sont pas symétriques : un saut inutile laisse un
bloc périmé jusqu'à la connexion suivante, une relecture inutile peut **annuler un
geste**. On échoue donc vers celle dont l'utilisateur se remet. Même famille que la
règle du cycle 131 sur l'échec de relecture — et même raison.

### Les cinq autres catégories : décision (critère 5 de #4197)

Elles **restent lues à la demande, sans magasin local**. La passerelle en a sept ;
Android en cache deux. Leur donner un magasin à cette occasion cacherait des blocs
qu'aucune surface ne relit entre deux écrans, et créerait cinq nouvelles choses à
périmer pour fermer un trou que personne n'a. La règle est écrite dans le KDoc du
coordinateur, à côté de celle qui dit pourquoi cinq noms sur sept sont ignorés
sans journalisation.

### Ce que le lot ne fait PAS : le retour au premier plan

Le critère 1 laissait ouvert « et, à décider, au retour au premier plan ». Décision :
**non, et c'est déjà couvert.** Socket.IO se reconnecte tout seul (`reconnection =
true`, tentatives infinies) ; un retour au premier plan après une coupure produit
donc une transition vers `CONNECTED`, qui est le déclencheur. Un second déclencheur
de cycle de vie relirait les mêmes blocs une deuxième fois sur le même événement —
une requête de plus par retour d'écran, pour zéro fraîcheur de plus.

## Gates

| gate | résultat |
|---|---|
| `PreferencesSyncCoordinatorTest` (+13, 22 au total) | le veto par kind (les deux blocs, plus le lane-mate qui NE retient PAS l'autre) ; l'outbox illisible qui saute sans écraser ; l'hydratation des deux blocs et de rien d'autre ; la jambe chiffrement intacte **sur ce chemin-là aussi** ; et cinq témoins de câblage — une connexion déclenche, une connexion ANTÉRIEURE au collecteur déclenche, une reconnexion re-déclenche, un `CONNECTED` répété ne déclenche pas, une déconnexion ne déclenche pas, `stop()` ferme les DEUX collecteurs |
| `OutboxDaoTest` (+2) | le SQL du `EXISTS` : voie ET kind, `EXHAUSTED` exclu, `INFLIGHT` compté (une livraison en l'air n'est pas une livraison confirmée) |
| `OutboxRepositoryTest` (+2) | l'aller-retour réel par `enqueue` : le kind répond pour lui seul, et ne répond plus une fois la ligne livrée (une livraison supprime la ligne) |
| `:app:assembleDebug` + `testDebugUnitTest` | délégués au workflow `Android` — `dl.google.com` est refusé par la politique de sortie de ce conteneur (mesuré à nouveau ce cycle : `Plugin [id: 'com.android.application'] was not found`), voir cycles 130 et 131 |
| gateway / web / iOS | **non modifiés** — aucun contrat de fil touché ; ce lot n'ajoute qu'un déclencheur, un veto et une requête `EXISTS` |

## Suivi MESURÉ

- **Le veto sait qu'une écriture est en attente, pas depuis quand.** Une ligne
  `EXHAUSTED` ne compte pas (l'outbox a renoncé, la valeur locale ne sera jamais
  poussée) — mais elle reste dans le magasin local, divergente du serveur et
  désormais **jamais** corrigée par une hydratation, puisque le prochain
  `hasDeliverable` rend `false` et que la relecture l'écrasera. C'est le
  comportement voulu ici et il mérite d'être dit : l'épuisement d'une écriture de
  réglage est aujourd'hui SILENCIEUX côté Android. Faire remonter un épuisement de
  la voie `settings` à l'utilisateur est un lot à part.
- **Les cinq autres catégories n'ont toujours pas d'hydratation cache-first** de
  leurs écrans — question de cache, pas de synchronisation, et inchangée par ce lot
  (voir la décision ci-dessus).
- **iOS et web n'ont pas été mesurés sur cette question.** Le défaut trouvé ici est
  « un magasin local dont l'unique source est une diffusion » ; savoir si les deux
  autres clients hydratent leurs propres blocs à l'ouverture de session demande le
  même balayage chez eux, et il n'a pas été fait dans ce cycle.
