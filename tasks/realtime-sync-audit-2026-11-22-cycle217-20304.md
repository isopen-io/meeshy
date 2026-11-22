# Cycle 217 — le tableau d'exploitation se ré-abonne après une reconnexion (#20304)

**Date** : 2026-11-22 · **Branche** : `claude/exciting-planck-diecrr` · **Issue** : #20304

## Ce que ce cycle a livré

`apps/web` tient son tableau d'exploitation (`/admin/operations`) en direct par
la socket : `admin-metrics:subscribe` rend l'instantané dans son accusé, puis
chaque `admin-metrics:sample` nourrit les jauges et les quatre graphes.

**Cet abonnement n'est pas un écouteur : c'est une jonction de room côté
serveur.** `AdminMetricsHandler.handleSubscribe` fait
`socket.join(ROOMS.adminHostMetrics())` — mesuré, l'UNIQUE site de jonction de
cette room dans le dépôt — et une room est tenue PAR SOCKET.

Une reconnexion socket.io donne une socket neuve côté serveur. `AuthHandler`
reconstruit `user:`, `feed:`, les rooms de conversation et la room d'appareil
E2EE à chaque ré-authentification ; **celle-ci, jamais**. Et
`createLiveSocketWatchers.connect()` ne rejoue ses observateurs que lorsque
l'OBJET de connexion change (changement d'identité, fermeture — `bridgeCalls`
dans `keepRealtimeConnection`), ce qu'une reconnexion ne fait pas : même
instance de `SocketClient`, écouteurs toujours attachés.

Le gel était donc **définitif, pas transitoire** : `setLive(false)` n'était
atteignable que depuis le `.catch` de l'accusé, celui de `liveSource` et le
détachement de l'observateur — aucun des trois ne tourne sur une reconnexion.
`live` restait `true`, et le repli par sondage REST est gardé exactement
là-dessus (`if (!enabled || live) return;`). Les courbes gelaient, la pastille
continuait d'annoncer `data-admin-ops-live="socket"`, et rien ne prenait le
relais. Seul un démontage/remontage réparait.

**Le déclencheur le plus courant est l'application elle-même** :
`bindAppStatePresence` fait `socket.disconnect(); socket.connect()` après 10 s
d'onglet masqué (`app-state-presence.ts:86-88`). Un administrateur qui laisse
`/admin/operations` ouvert dans un onglet de fond — l'usage même d'un tableau
d'exploitation — tombait dedans sans aucune panne réseau.

## Le correctif

L'observateur se ré-abonne lui-même sur `authenticated`, le motif qu'emploient
déjà `publication-rooms.ts`, `conversation-viewing.ts` et
`call-socket-bridge.ts`, et rend `live` à `false` sur `'disconnect'` pour que le
sondage tienne le trou. Rien ne change pour les cinq autres consommateurs de
`watchLiveSocket` (`conversation-details-sheet`, `discover-circles`,
`blood-ritual-dialog`, `shared-translations-session`, `watch-realtime`) : ils
n'enregistrent que des écouteurs, sans abonnement serveur.

Côté passerelle, rien à changer : `socket.join` est idempotent, et le
réabonnement part au plus une fois par (ré)authentification — sous la borne de
`subscribeGate`.

## La note de forme jointe, soldée

`live-socket-watchers.ts` gardait l'ACCROCHE (`try/catch` dans `attach`) et pas
le DÉTACHEMENT (`detach?.()` nu, dans `connect` comme dans la fermeture rendue
par `watch`). La règle du module — « un observateur qui échoue ne retient pas
les autres » — ne distingue pas les deux sens. Inatteignable aujourd'hui, tous
les détachements du dépôt étant des `socket.off` : un piège armé, pas une
panne. Désarmé par `release()`.

## Preuve

| témoin | ce qu'il atteste | rouge d'abord |
|---|---|---|
| `admin-operations.test.tsx` — « une reconnexion ré-abonne » | un second `admin-metrics:subscribe` part après `disconnect` + `authenticated`, et un échantillon reçu ensuite atteint les jauges | oui (1 abonnement au lieu de 2) |
| `admin-operations.test.tsx` — « la coupure rend la main au sondage » | `data-admin-ops-live` passe à `polling` pendant le trou | oui (`socket`) |
| `live-socket-watchers.test.ts` — « un adieu qui lève ne retient pas la migration » | les observateurs suivants s'accrochent à la nouvelle socket | oui (exception) |
| `live-socket-watchers.test.ts` — « cesser malgré un adieu qui lève » | l'inscription part quand même | oui (exception) |

Les témoins lisent l'EFFET, jamais l'écouteur : « un échantillon émis après la
reconnexion atteint-il les jauges ? », « la pastille cesse-t-elle d'affirmer le
direct ? ». La socket de témoin GARDE ses écouteurs à travers la coupure —
c'est ce que fait socket.io, et c'est ce qui rend le défaut observable.

`bunx tsc --noEmit` : 0. Suite `apps/web` complète : voir le commentaire de
clôture de #20304.

## Ce que ce cycle laisse

Rien d'ouvert. Le balayage du cycle de vie de la socket (cycle 213) est
désormais entièrement soldé : les cinq abonnements que la passerelle ne peut
pas inférer étaient déjà ré-émis sur `authenticated`, le sixième l'est.
