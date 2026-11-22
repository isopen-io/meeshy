## Un abonnement qui JOINT UNE ROOM n'est pas un écouteur — et rien, côté client, ne les distingue

**2026-11-22 · #20304 · cycle 217 de la routine temps réel**

**Le fait.**

`apps/web` a six consommateurs de `watchLiveSocket`. Cinq posent des
`socket.on(...)` et rien d'autre. Le sixième — `use-host-metrics.ts`, le
tableau d'exploitation — pose un `socket.on(...)` **et** émet
`admin-metrics:subscribe`.

Dans le fichier, les deux ont exactement la même forme : un observateur qui
reçoit la socket et rend de quoi s'en détacher. Mais côté passerelle,
`handleSubscribe` fait `socket.join(ROOMS.adminHostMetrics())`, et **une room
est tenue PAR SOCKET**. Une reconnexion socket.io garde les écouteurs du client
(même instance) et perd l'appartenance à la room (nouvel id côté serveur). Les
cinq premiers traversent la coupure sans rien faire ; le sixième en sort
muet — définitivement, puisque rien ne le ré-abonne et que son seul chemin vers
`setLive(false)` ne passe pas par là.

**La règle.**

**Devant un observateur de socket, demander : son travail est-il entièrement
LOCAL au client, ou écrit-il un état CHEZ LE SERVEUR ?** Un `socket.on` est
local et survit à tout ; un `emit` qui fait joindre une room, ouvrir une
session, déclarer une présence ou armer un abonnement est un état serveur, que
la reconnexion détruit en silence. Le second doit se rejouer sur
`authenticated` — le motif déjà porté par `publication-rooms.ts`,
`conversation-viewing.ts` et `call-socket-bridge.ts`.

Et la réponse ne se lit pas dans le client : elle se lit dans le HANDLER de la
passerelle. Le nom n'aide pas non plus — `subscribe` ressemble à « j'écoute »
autant qu'à « inscris-moi ». La mesure qui tranche est un grep du côté serveur :
`socket.join(` pour ce nom d'événement.

**Le corollaire qui double le coût.**

Quand l'état gelé sert aussi de GARDE au repli, la panne n'est plus un trou,
c'est un verrou. Ici `live` reste `true`, donc la page AFFIRME le direct
au-dessus de données mortes **et** désarme le sondage REST qui existait
précisément pour ce cas (`if (!enabled || live) return;`). Un indicateur
d'état qui garde un chemin de secours doit retomber sur le signal de PANNE
(`'disconnect'`), jamais seulement sur le signal d'ÉCHEC d'une tentative : la
tentative n'a pas lieu pendant une coupure.

**Le geste.**

Un témoin de reconnexion se pose sur une socket de témoin qui **garde ses
écouteurs à travers la coupure** — c'est ce que fait socket.io, et une fausse
socket qui les jette rendrait le défaut invisible. Il lit l'EFFET (« un
échantillon reçu après la reconnexion atteint-il les jauges ? »), jamais la
présence d'un écouteur.

**Note de convergence — deux sessions, le même `release()`.**

Le correctif est celui de `dev` (#20321, cycle 215 d'une session parallèle),
retenu par la règle #18654 : **la correction déjà sur `dev` se garde**. Ce lot
avait mesuré le même défaut et écrit le même remède — jusqu'au nom de la
fonction qui garde le détachement, `release()`, à l'identique — et quatre
témoins dont deux que l'autre session a aussi écrits. Elle en a deux de plus
(un ré-abonnement REFUSÉ, et le détachement des DEUX écoutes de cycle de vie),
et sa version désarme `live` sur un accusé refusé comme sur une socket sans
accusé, là où celle-ci laissait le refus muet : c'est la version la plus
complète qui est en place.

Ce qui reste de ce lot est cette leçon, que l'autre session n'a pas tirée. Et
la convergence est elle-même la mesure d'une chose : quand deux lectures
indépendantes du même code produisent le même remède au même nom, le défaut
n'était pas subtil — il était seulement **invisible depuis le client**, qui est
exactement ce que la règle ci-dessus dit d'aller chercher ailleurs.

Le précédent est consigné au `CLAUDE.md` racine (« Note de convergence (merge
itération 257 ↔ cycle 123) ») : la règle de tranchage du dépôt — celui qui n'a
rien écrit cède — ne tranche pas quand les deux ont écrit, et c'est alors
l'ordre de fusion qui décide.

**Famille.**

Jumelle de la leçon « une énumération affirme AUSSI qu'elle est complète » : le
cycle 213 avait balayé le cycle de vie de la socket et conclu « les
abonnements que la passerelle ne peut pas inférer sont tous ré-émis sur
`authenticated` » — la liste était juste pour les cinq qu'elle avait regardés,
et le sixième n'y figurait pas parce qu'il ne RESSEMBLAIT pas à un abonnement.
