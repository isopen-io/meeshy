# Un double ment aussi par ce qu'il FOURNIT — et un `as never` empêche de le savoir

**Cycle 146, #16948.** Le dépôt connaît « un double mente par ce qu'il ACCEPTE »
(cycle 112 : un faux `xcodebuild` valide toutes les formes d'appel, y compris
celles que le vrai refuse). Son pendant est plus courant et moins nommé.

Mon double de la couche socket exposait `socketsLeave`. Le collaborateur réel
déclare `in(room).fetchSockets()` (`MembershipRoomReader`). Sous ce double,
`endConversationMembership` levait sur une méthode absente au lieu d'agir — et
mon témoin d'éviction **rougissait pour la mauvaise raison** : il nommait le
défaut de production et mesurait une panne de harnais.

C'est le pire des rouges, parce qu'il ressemble au bon. On le corrige en
touchant la production, on le voit repasser au vert, et on a gelé une forme que
personne ne sert.

## Ce qui l'a permis : le cast au site d'appel

```ts
await endGuestSession({ prisma: h.prisma as never, io: h.io as never, manager: h.manager as never });
```

Le `as never` sur `io` est exactement la vérification qui aurait dit que le
double n'a pas la forme du collaborateur. **Un cast dans un témoin désarme la
seule garde qui sache que le collaborateur a changé de forme** — et un témoin
est le dernier endroit où l'on croit en avoir besoin, puisqu'« il n'y a que des
doubles ».

## La règle

Avant d'écrire un double, **lire l'interface que la production EXIGE**, pas
celle qu'on imagine depuis le nom de l'opération. `socketsLeave` est l'API de
socket.io et c'est une forme réelle — simplement pas celle que cette unité
appelle. Et quand un témoin rougit, **vérifier qu'il rougit pour le motif qu'il
nomme** avant de toucher la production : relire le message d'échec, et demander
si la ligne qui a levé est bien celle du défaut.

## Comment les deux se sont vus

**En cherchant le rouge**, pas en relisant l'assertion — la discipline que
`2026-11-08-un-temoin-qui-ne-peut-pas-tomber-se-trouve-en-chassant-le-rouge.md`
établit sur trois autres témoins le même jour, et qui vaut ici d'un cran plus
bas : elle ne dit pas seulement « vérifier que le témoin TOMBE », elle dit
**vérifier qu'il tombe pour le MOTIF qu'il nomme**. Le mien tombait ; sur une
panne de harnais.

(Le même lot en portait un second du type connu : `payloads.every(…)` rend
`true` sur une liste vide, donc il était vert avant le correctif, quand aucun
départ n'était annoncé du tout.)
