## Deux énumérations du même tableau qui divergent par un FILTRE faussent l'index qui voyage entre elles — et l'index ne dit jamais de quelle énumération il parle

*(2026-11-22, #20287, cycle 211)*

### Le fait

`story:translation-updated` porte `{ postId, textObjectIndex, translations }` : un
RANG, pas une adresse. Côté serveur, ce rang est celui de `storyTranslatableTexts`
(`storyEffectsV3.ts`) — **tous** les objets `kind: 'text'` des scènes, dans
l'ordre —, remappé par `servedTextIndex` sur le canvas SERVI, dont les puces de
crédit sont retirées.

Côté web, une énumération des objets texte existait déjà, et elle avait l'air
faite pour ça : `sceneTextObjects` (`language-availability.ts`). Elle **écarte les
textes blancs**, parce qu'elle répond à une autre question — « cette story a-t-elle
du texte traduisible ? ».

Les deux rendent le MÊME tableau sur une story ordinaire. Elles divergent dès
qu'un texte vide traîne dans une scène — et la traduction se fusionne alors dans
le mauvais objet, sans erreur, sans log, sans rien.

### La règle

**Un index qui franchit une frontière ne transporte pas l'énumération qui lui
donne son sens.** Les deux côtés doivent la nommer — ici « tous les `kind: 'text'`,
à plat, dans l'ordre, puces retirées » — et le côté qui reçoit doit écrire la
sienne CONTRE celle de l'émetteur, jamais réutiliser celle qui traîne à côté
parce qu'elle parcourt le même tableau.

Le piège est que la réutilisation ressemble à une économie, et que le filtre
divergent n'est pas une faute : `sceneTextObjects` a raison d'écarter les blancs
pour SA question. Ce n'est pas une énumération fausse, c'est une AUTRE.

### Ce qui l'attrape

Un témoin dont le document porte un texte BLANC avant le texte visé. Sur un
vecteur ordinaire, l'énumération juste et l'énumération filtrée rendent le même
verdict — le témoin ne peut pas tomber (famille de la leçon 261, où un témoin de
RANG doit s'écrire sur un rang autre que le premier). Mesuré : la mutation « le
parcours écarte les textes blancs » fait tomber ce témoin-là, et lui seul, sur
neuf.

### Corollaire

Devant un champ qui porte un rang (`index`, `position`, `order`, `at`), demander
**« le rang de QUELLE liste ? »**, puis aller lire la fonction qui la produit chez
l'émetteur. Un nom de champ ne le dit jamais : `textObjectIndex` était parfaitement
exact, et parfaitement muet sur le filtre.
