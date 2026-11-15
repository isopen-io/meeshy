## Leçon 218 — quand le SERVEUR délègue sa cohérence au client, la promesse doit être vérifiée chez le client (2026-08-17, routine messagerie, cycle 56)

**Le constat.** `ReactionHandler` (gateway) justifie cinq de ses chemins
dégradés par la même phrase — « peers reconcile on the next reaction:sync ».
Diffusion qui échoue après écriture, agrégation dégradée, retrait non annoncé :
à chaque fois, le serveur choisit délibérément de ne pas se rattraper lui-même
et délègue au sync suivant. Côté web, ce sync partait **une seule fois, au
montage**, sur une requête en `staleTime: Infinity` : pour un fil resté ouvert,
« le prochain sync » n'existait pas. Et quand le montage précédait la poignée de
main du socket — ce qui est le cas courant — la requête se résolvait en
**succès vide**, mémorisant « ce message n'a aucune réaction » comme une vérité
fraîche, sans qu'une seule demande soit partie.

**La règle.** Un commentaire serveur qui délègue un rattrapage au client est une
DETTE, pas une garantie. Chaque fois qu'un chemin serveur se déclare
best-effort « parce que le client resynchronisera », il faut aller nommer le
composant monté qui resynchronise, et à quel signal. S'il n'y en a pas, le
best-effort n'est pas dégradé : il est **perdant**, et la perte est silencieuse
et permanente. C'est la leçon 217 vue depuis l'autre bout du fil — non plus « où
va cette charge utile ? » mais « qui tient la promesse que ce commentaire a
faite ? ».

**Le corollaire sur les états vides.** Une requête qui ne peut pas interroger le
serveur ne doit jamais RÉSOUDRE ; elle doit ÉCHOUER. Un `resolve({ items: [] })`
sur canal absent est indiscernable d'un « le serveur dit : rien », et sous
`staleTime: Infinity` il devient définitif. L'absence de canal se signale comme
un échec — et l'échec correspondant ne se réessaie pas au compteur : c'est le
RETOUR DE LA CONNEXION qui doit relancer la demande, pas un `retry: n`.

**Le camouflage, et il est nouveau.** Le mis-routage voisin — `reaction:sync`,
un INSTANTANÉ, versé dans le seau de `reaction:added`, qui lit un DELTA — était
épinglé par un témoin vert nommé `forwards reaction:sync events to reactionAdded
listeners (full reconciliation)`. Un test qui décrit le défaut avec le
vocabulaire de l'intention est plus solide qu'une absence de test : il fait
lire « c'est voulu » là où il faudrait lire « les deux charges n'ont aucun champ
commun ». **Quand un témoin porte un nom qui justifie plutôt qu'il ne décrit,
relire la charge utile des deux côtés avant de lui faire confiance.**

**Le garde qui en sort, et il est exprimable.** Un écouteur socket posé sur un
nom que le contrat ne définit plus devient `socket.on(undefined, handler)` — un
abonnement muet que rien ne déclenche et qu'aucun type ne refuse. Le témoin de
`presence.service.test.ts` l'interdit désormais explicitement
(`expect(subscribed).not.toContain(undefined)`), ce qui attrape le mis-routage
sous ses DEUX formes : par la constante si elle existe, par `undefined` si elle
a été retirée.
