## Leçon 311 — une annonce peut être reçue, décodée et routée, et n'atteindre personne : chercher le JUMEAU que la surface rend (2026-08-28, cycle 133)

Le cycle 132 cherchait, sur Android, « un magasin local dont l'unique source est
une diffusion ». Portée au web, la même question rend une réponse plus
embarrassante : la diffusion **arrive**. Elle est décodée, routée par la bonne
branche, et elle invalide la bonne clé.

Simplement, cette clé n'a d'observateur que pendant que l'écran de réglages de
la catégorie est monté — et la surface qui RENDAIT la préférence
(`DeliveryIndicator`, les bulles) lisait un SECOND exemplaire, un store Zustand
dont l'unique source était un `initialize()` appelé une fois au montage.

> **Un balayage « qui écoute cet événement ? » rend une liste de LECTEURS, pas
> une liste de SURFACES.** Un lecteur bien câblé sur un cache que personne
> n'observe est indiscernable, dans ce balayage, d'un lecteur qui met à jour
> l'écran. La question qui les sépare n'est pas « l'événement est-il traité ? »
> mais **« quel PIXEL change quand il l'est ? »**.

C'est la leçon 122 du Prisme (« qui AFFICHE ce que le résolveur élit ? ») portée
d'un résolveur de contenu à un routeur d'événements — et la loi 4 du web
(« un contrôle existe s'il a un effet ») portée d'un contrôle à une annonce.

### Le corollaire qui rend le défaut trouvable

Ce qui a produit le défaut n'est pas l'oubli d'un câblage, mais l'existence d'un
**jumeau**. Deux exemplaires de la même donnée, deux populations de lecteurs,
et une seule des deux nourrie par les annonces. Aucun des deux n'est faux
isolément ; c'est leur COEXISTENCE non déclarée qui l'est.

> Devant une donnée qu'une annonce doit rafraîchir, la question à poser avant
> toute autre est **« combien d'exemplaires en existe-t-il, et lequel la surface
> lit-elle ? »**. Un `grep` sur le nom du champ (`showReadReceipts`) répond ; un
> `grep` sur le nom de l'événement ne répond jamais — par construction, le
> jumeau n'y apparaît pas.

Ici, le cas le plus visible du défaut était le plus direct : l'écran de réglages
écrivait par React Query, les bulles lisaient le store Zustand, donc
**l'utilisateur qui coupait ses accusés de lecture dans son propre onglet
continuait d'y voir ses coches**. Un défaut de synchronisation entre appareils
qui, mesuré, ne demandait même pas un second appareil pour se produire.

### Et le pendant local d'une diffusion inter-onglets

`BroadcastChannel` **ne délivre jamais à l'émetteur**. Un mécanisme de
propagation dont on vérifie qu'il « atteint les autres onglets » a donc, par
construction, un trou à l'endroit exact où l'utilisateur regarde. Le site qui
diffuse doit APPLIQUER localement ce que les autres appliqueront en le recevant
— sans quoi l'auteur du geste est le dernier à le voir.
