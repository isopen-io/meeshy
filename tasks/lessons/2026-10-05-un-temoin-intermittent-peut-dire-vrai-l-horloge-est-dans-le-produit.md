## 2026-10-05 — Un témoin intermittent peut dire VRAI : l'horloge qui décide du verdict peut vivre dans le PRODUIT (#9216, #9219)

`check-thread-virtualization.mjs` rougissait « 179 px » sur un commit, « 0 px »
sur son voisin, sans un octet du fil changé. Les deux issues supposaient une
course de MESURE (« la garde lit avant la fin de l'ancrage »). Les traces image
par image des écritures de `scrollTop` (accesseur posé sur l'élément,
`scrollTo` enveloppé) ont dit autre chose : le fil sautait VRAIMENT, et
durablement. Le déclencheur était une horloge interne de
`@tanstack/virtual-core` — `isScrollingResetDelay`, 150 ms : arrivée dans cette
fenêtre, la page ne déclenchait aucune mesure au commit ; arrivée après, le
virtualiseur compensait les rangées préfixées par des `scrollTo` relatifs
qu'une écriture ABSOLUE de l'application effaçait. Le client de fixtures sert
sur-le-champ : seul un agent chargé franchissait les 150 ms.

> **Devant un témoin intermittent, ne pas conclure à une mesure fragile avant
> d'avoir regardé si l'état mesuré DURE.** Une mesure trop tôt donne un écart
> qui se résorbe ; un défaut donne un écart qui reste. Suivre la valeur
> plusieurs images après le verdict tranche en une trace. Et si le défaut est
> réel mais rare, chercher l'horloge qui sépare les deux régimes — elle peut
> être dans une dépendance — puis faire jouer les DEUX régimes au témoin à
> chaque passage (ici, une page sur deux retenue au-delà de la fenêtre), plutôt
> que d'attendre qu'une machine chargée tombe dans le mauvais.

Corollaire : deux mécanismes qui écrivent la même position (une écriture
absolue, des compensations relatives) ne composent pas — le dernier efface
l'autre. Laisser UN seul propriétaire de la position ; ici, le virtualiseur
(`anchorTo: 'end'` au rendu qui insère). Détail : `apps/web/decisions.md`
§ D-173.
