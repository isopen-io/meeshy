## Leçon 422 — Un témoin qui remonte une chaîne d'UN cran mesure la LONGUEUR de la chaîne, pas son propre sujet

Deux témoins de `apps/web-v3/e2e/visual/v3-network-vitals.spec.ts` tenaient le
critère de #4495 : un lien partagé s'ouvre en un aller-retour. Ils rougissaient
sur `dev`, et ils accusaient le lien. Chaîne réellement observée :

```
/l/8fz3-lagos  --302-->  /chats/8fz3-lagos  --302-->  /login?returnUrl=…
```

Le premier lisait `finale.request().redirectedFrom()` — UN cran en arrière — et
recevait donc `/chats/…` là où il attendait `/l/…`. Le second comptait TOUTES
les 302 de la navigation et en trouvait deux. **Aucun des deux ne mesurait le
lien : ils mesuraient la longueur totale de la navigation.** Le second saut est
le comportement VOULU de la destination — `/chats/:cle` renvoie un lecteur sans
session vers `/login`, couvert par `__tests__/fil.test.ts:250`.

Ce qui rend le cas instructif, c'est POURQUOI ils passaient avant. Tant que
`/chats/:cle` n'existait pas, la navigation s'arrêtait sur un 404 : un seul cran
à remonter, une seule 302 à compter. Les deux témoins avaient donc gelé un trou
qui n'était même pas dans leur propre sujet — il était chez le VOISIN.

> « Un témoin qui GÈLE un trou tombe quand le trou se ferme » est déjà écrit.
> La forme qui manquait : **le trou gelé n'est pas forcément dans le sujet du
> témoin.** Ici il était dans la route d'à côté, et le témoin est tombé en
> accusant son propre sujet — qui n'avait pas bougé d'une ligne depuis sa
> livraison. Un rouge qui désigne un fichier dont `git log` ne montre aucun
> changement depuis le dernier vert désigne le VOISIN, pas le fichier.

Le remède n'est pas de relâcher l'assertion — ce serait la faire passer pour la
mauvaise raison. Il est de lui faire énoncer son invariant : remonter la chaîne
jusqu'à SA RACINE et épingler nommément le premier saut (`chaine[0]` est
`/l/:token`, sans ancêtre, en 302 ; `chaine[1]` est `/chats/:token`), et
reconnaître la 302 DU LIEN à l'adresse qui l'a produite (`redirectResponse.url`)
plutôt qu'à son seul statut. **La précision AUGMENTE** : l'atterrissage du lien
est désormais épinglé, alors qu'il n'était que déduit de la dernière adresse
visitée. Rouge prouvé par mutation — `destination.ts` renvoyant
`/chats-mutant/:token` fait tomber le témoin exactement sur `chaine[1]`.

Deux notes de méthode :

- **Reproduire AVANT d'expliquer.** La lecture du journal de CI donnait
  « Received length: 2 » sans dire d'où venait la seconde. Rejouer les deux
  tests localement a rendu la valeur qui tranche —
  `Received: "http://127.0.0.1:38245/chats/8fz3-lagos"` — et c'est elle, pas le
  raisonnement, qui a nommé le voisin.
- **Chercher la décision AVANT d'ouvrir un suivi.** J'allais ouvrir « un lecteur
  sans session paie deux sauts sur un lien partagé ». #4522 portait déjà la
  directive du porteur du 2026-09-01 : le lien va vers `/chat/:lien` au
  SINGULIER, sans redirection, précisément parce que `/chats/:cle` est le fil
  connecté. Le témoin le dit maintenant dans son doc-comment, pour que le rouge
  du jour-là se lise comme une attente et non comme une panne.
