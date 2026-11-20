## Un `where` n'est pas une PROJECTION — et la loi jugée en code exige les deux colonnes (cycle 195, #20100)

`announceStartedGroup` lit les membres d'un groupe pour DEUX questions : trouver le
CRÉATEUR (au `role` de sa ligne de participation — `Conversation` ne porte aucune
colonne d'auteur, mesuré) et composer l'AUDIENCE des invités. Resserrer le `where`
aurait servi la seconde et cassé la première : un créateur banni-mais-actif
disparaissant du relevé, `creator` devient introuvable, l'unité rend avant
d'annoncer, et **plus aucun invité légitime ne reçoit son invitation** — la garde
retournée contre la personne qu'elle protège.

La loi s'applique donc **après lecture**, sur l'audience seule :
`invitees = members.filter(m => m.userId !== creator.userId && participationEstVivante(m))`.

Et c'est là que le piège se referme : `participationEstVivante` exige
`row.isActive === true`. Un champ **non projeté vaut `undefined`**, donc la
fonction rend `false` pour **tout le monde** et l'annonce ne part plus à personne.

> Deux choses rendent l'omission crédible, et elles se renforcent : le `where`
> filtre DÉJÀ sur `isActive`, ce qui fait lire la colonne comme redondante dans le
> `select` ; et le compilateur ne voit rien, les deux champs de la loi étant
> optionnels — ils doivent l'être, puisqu'elle juge des lignes partiellement
> projetées. **Une loi qui juge une ligne DÉJÀ LUE a besoin que la lecture l'ait
> demandée, et le `where` n'est pas cette demande.**

Attrapé par le témoin de comportement, jamais à la relecture. Même famille que
« une projection trop étroite rend une loi impossible en aval sans qu'aucun témoin
ne rougisse » (cycle 124, `utils/recipient-language.ts`), et que « un cliquet qui
garde la REQUÊTE ne dit rien de la PROJECTION » (#19938) : à chaque fois, le
`select` est la condition qu'aucun témoin de verdict ne peut voir.
