# Cycle 215 — une room appartient à UN socket : le tableau d'exploitation gelait en affirmant qu'il était en direct (#20304)

*Routine « amélioration continue du temps réel », sur la tête de `dev`
`add285090` (qui porte le cycle 214).*

## Le défaut, et pourquoi le cycle 213 l'avait laissé ouvert

Le cycle 213 a balayé le cycle de vie de la socket et l'a trouvé sain : les
écouteurs sont attachés une fois par instance de `SocketClient`, la passerelle
reconstruit à chaque ré-authentification toutes les rooms qu'elle peut INFÉRER
(`AuthHandler`, `join-user-conversations`), et les abonnements qu'elle ne peut
pas inférer sont ré-émis par le client sur `SERVER_EVENTS.AUTHENTICATED`
(`publication-rooms.ts`, `conversation-viewing.ts`, `call-socket-bridge.ts`).
**Un seul abonnement n'était dans aucune des deux listes.**

`admin-metrics:subscribe` n'est pas une écoute : c'est une **jonction de room**
côté serveur — `AdminMetricsHandler.handleSubscribe:108`, l'unique
`socket.join(ROOMS.adminHostMetrics())` du dépôt — et **une room appartient à
UN socket serveur**. socket.io reconnecte sous le MÊME `SocketClient` ; or
`createLiveSocketWatchers().connect()` ne migre ses observateurs que sur un
changement d'**objet** de connexion (`bridgeCalls(next)`, donc un changement
d'identité ou une fermeture). Une reconnexion socket.io ne le réveille jamais.

## Ce que ça coûtait à un administrateur

Un onglet `/admin/operations` laissé ouvert — c'est l'usage d'un tableau
d'exploitation. `bindAppStatePresence` fait lui-même `disconnect()` puis
`connect()` après 10 s masqué (`app-state-presence.ts:86-88`) : le déclencheur
le plus courant, avant même un redéploiement de la passerelle.

À partir de là :

1. le socket serveur neuf n'est **dans aucune** `admin:host-metrics` ;
2. `setLive(false)` n'était atteignable que depuis le `.catch` de l'accusé, celui
   de `liveSource` et le détachement de l'observateur — **aucun ne s'exécute sur
   une reconnexion** ;
3. donc `live` reste `true`, et le repli par sondage REST est gardé exactement
   là-dessus (`if (!enabled || live) return;`).

**Les courbes CPU/mémoire ne bougent plus jamais, aucun sondage ne prend le
relais, et la pastille continue d'annoncer `data-admin-ops-live="socket"`.** La
page AFFIRME qu'elle est en direct au-dessus de données gelées. Seul un
démontage/remontage la réparait. Le gel était DÉFINITIF, pas transitoire.

> C'est la loi 4 (« un contrôle existe s'il a un effet ») appliquée à un
> INDICATEUR : une pastille d'état existe si elle peut dire le contraire. Celle-ci
> n'avait aucun chemin vers « sondage » une fois passée à « direct ».

## Ce que le lot écrit

- **L'abonnement est rejoué sur `authenticated`** — le motif exact des trois
  modules qui tiennent déjà des salles côté client. La jonction d'origine reste :
  l'observateur peut s'accrocher à une socket déjà authentifiée.
- **`disconnect` désarme `live`** : le sondage prend le relais pendant le trou,
  ce qui est le point de la ceinture et des bretelles — même si la
  ré-authentification n'arrivait jamais, l'écran continue de vivre.
- **Un accusé qui REFUSE désarme aussi.** Défaut TROUVÉ en écrivant le
  correctif, pas dans l'issue : `handleSubscribe` est derrière un `subscribeGate`
  par utilisateur et peut répondre `ok: false, code: 'RATE_LIMITED'` ou
  `'FORBIDDEN'`. L'ancien code faisait `if (snapshot === null) return;` — sans
  toucher à `live`. Au PREMIER abonnement c'est sans effet (`live` est déjà
  faux) ; **au RÉ-abonnement, cela rejouait exactement le gel qu'on vient de
  corriger**, une couche plus bas. Un correctif de reconnexion qui ne regarde
  pas le cas « la reconnexion est refusée » ne corrige que le chemin heureux.
- **`emitWithAck` absent ne jette plus avant de rendre le détachement.**
  `socket.emitWithAck?.(…).then(…)` lève un `TypeError` SYNCHRONE sur un socket
  sans accusé (le bouchon de fixtures, un faux socket de témoin) : l'écoute des
  échantillons, posée une ligne plus haut, était alors **posée sans jamais être
  rendue** — une fuite d'écoute. L'extraction de `subscribe()` imposait la garde ;
  elle ferme la fuite au passage.
- **`live-socket-watchers` : un détachement qui lève ne retient plus les
  autres** (`release`, symétrique d'`attach`). Le doc-comment du module l'exigeait
  déjà en toutes lettres — « un observateur qui échoue ne retient pas les
  autres » — et seul `attach` l'honorait. Piège armé (tous les détachements du
  dépôt sont des `socket.off`), fermé parce qu'il est dans le même cycle de vie.

## La preuve de ROUGE

Six témoins neufs, tous rouges sur le code d'avant (`28 pass / 6 fail`), verts
après (`34 pass / 0 fail`) :

| témoin | ce qu'il attrape |
|---|---|
| la coupure désarme « En direct » | `live` restait `true`, le sondage restait gardé |
| la ré-authentification rejoue l'abonnement | `1` abonnement au lieu de `2` ; pastille `socket` sur un socket hors room |
| un ré-abonnement REFUSÉ ne laisse pas affirmer le direct | le gel rejoué par le `return` sans `setLive` |
| quitter détache les DEUX écoutes de cycle de vie | `authenticated` et `disconnect` restaient attachés |
| un détachement qui lève ne retient pas les autres | la boucle de `connect` s'interrompait, les suivants restaient sur la socket morte |
| cesser d'observer malgré un détachement qui lève désinscrit | `registrations.delete(id)` n'était jamais atteint : l'observateur revenait à la connexion suivante |

## Le relevé qui a borné le lot

Avant de corriger, les jonctions de room du dépôt ont été énumérées
(`socket.join(` côté passerelle), et chacune rapprochée de son rejeu :

| room | qui la rejoint | rejeu après reconnexion |
|---|---|---|
| `user:`, `feed:`, conversations, room d'appareil E2EE | la passerelle, à l'authentification | **inféré serveur** |
| `post:<id>` | le client (`post:join`) | `publication-rooms.ts` sur `authenticated` |
| conversation (visiteur), `viewing:` | le client | `conversation-viewing.ts` sur `authenticated` |
| `call:<id>` | le client | `call-socket-bridge.ts` + `call:check-active` |
| `admin:host-metrics` | le client | **aucun** ⇒ ce lot |
| `admin:agent` | — | **aucun client ne l'émet** (mesuré : `admin:agent-subscribe` n'apparaît que dans `event-names.ts`) |

La dernière ligne est un piège armé, pas une panne : notée ici, pas corrigée —
un abonnement sans abonné n'a pas de reconnexion à rater.

## Gates

| gate | résultat |
|---|---|
| `bun test` (les deux fichiers touchés) | **34 verts / 0 rouge**, et 6 rouges sur le code d'avant |
| `tsc --noEmit` (`apps/web`) | **0** |
| `bun test` (suite web complète) | voir le commentaire de clôture de #20304 |
