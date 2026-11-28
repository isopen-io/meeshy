## Un témoin de LIVRAISON compte ; un témoin de CONFIDENTIALITÉ cherche — et aucun ne subsume l'autre

**Date** : 2026-11-28 · **Lot** : #20779 (suivi de #20711) · **Mesuré**, pas supposé

### Le constat

Quinze témoins d'intégration gardaient la forme 1 de #20779 : chacun demandait
« ce texte est-il parti ? » (`toContain` / `not.toContain`) à une adresse donnée.
Une mutation — « rendre TOUS les sockets de la room sans filtrer sur la
séparation » — les laissait **tous les quinze VERTS**.

Ce que la mutation fait pourtant : le spectateur que rien ne sépare reçoit la
charge commune **ET** une charge à sa socket. **Deux `post:updated` pour une
édition** — la forme exacte du défaut que `emitToUserFeedAndPostRoom` existe
pour empêcher (le `+2` de compteur de réaction, cycle 100).

### Pourquoi aucun des quinze ne pouvait tomber

`toContain` est MONOTONE : ajouter une livraison ne peut que rendre l'assertion
plus vraie. Un doublon ajoute du texte juste à une adresse légitime — il ne
retire rien, ne falsifie rien, et n'apparaît dans aucune assertion de contenu.

```ts
expect(texteRecuPar(emissions, SOCKET_T)).toContain(TEXTE_COMMENTE);  // vert avec 1 livraison
                                                                      // vert avec 2
expect(recuPar(emissions, SOCKET_T).length).toBe(1);                  // le seul qui tombe
```

### La règle

**Les deux questions sont disjointes, et une boucle d'émission les pose toutes
les deux :**

| le témoin demande | ce qu'il garde | ce qu'il ne voit pas |
|---|---|---|
| « ce texte est-il parti ? » | la confidentialité | un doublon, une sur-livraison |
| « combien de fois ? » | la livraison | une fuite à une autre adresse |

**Tout lot qui AJOUTE une adresse à une émission déjà dédoublonnée doit poser la
seconde.** Socket.IO ne dédoublonne qu'à l'intérieur d'une émission
(`io.to([a, b])`) — jamais entre deux `emit` successifs. Donc dès qu'un
correctif de confidentialité sert « sa » charge à quelqu'un **en plus** d'une
émission commune, la question du compte se pose mécaniquement, et elle ne se
pose à aucun des témoins qu'on vient d'écrire.

### Le corollaire : un vert sous mutation a DEUX causes

Dans le même lot, une mutation est restée verte **à juste titre** : servir la
charge par `withAudienceListFor(post, readerId)` au lieu de
`withoutAudienceList(post)`. `mayReadAudienceList` exige
`post.authorId === viewerId`, et un spectateur n'est jamais l'auteur : les deux
expressions rendent le MÊME objet.

> **Avant de conclure d'un vert sous mutation qu'une garde n'est tenue par
> personne, vérifier que la mutation CHANGE quelque chose.** Les deux causes se
> ressemblent exactement à la lecture du résultat, et les confondre fait poser un
> témoin incapable de tomber — ce que le dépôt refuse d'appeler un témoin. La
> réponse se lit dans le code muté, pas dans le compte de rouges.

### La forme sœur, du même lot

« Ne rien énumérer quand personne n'est séparé » était écrit DEUX fois — dans le
module et dans la condition d'appel. Mutée, chaque couche était couverte par
l'autre : **131 témoins verts**. C'est « une défense en profondeur dont aucune
couche n'est tenue perd une couche en silence » (audit de #20711) appliqué à un
COÛT, où c'est plus discret encore : un coût n'a pas de symptôme.

**Devant deux couches qui disent la même chose, la question n'est pas
« laquelle tester ? » mais « laquelle est PROPRIÉTAIRE ? ».** Tester les deux
fige une duplication ; en retirer une laisse une règle avec un propriétaire, et
un témoin qui peut tomber.

### Sites

- `services/gateway/src/socketio/handlers/__tests__/post-spectateur-compagnon-20779.test.ts`
  (« … et il ne la reçoit qu'UNE fois »)
- `services/gateway/src/socketio/handlers/separatedCompanionSpectators.ts`
  (le court-circuit à propriétaire unique, et pourquoi)
- `services/gateway/decisions/2026-11-28-le-spectateur-de-la-room-d-un-post-recoit-sa-charge-a-sa-socket-20779.md`
