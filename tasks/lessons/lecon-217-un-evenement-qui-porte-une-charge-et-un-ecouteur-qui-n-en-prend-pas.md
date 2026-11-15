## Leçon 217 — un événement qui PORTE une charge et un écouteur qui n'en prend pas : le rangement fait passer la perte pour un traitement (2026-08-17, routine messagerie, cycle 55)

**Le constat.** `PreferencesSyncService` abonnait cinq événements à un même
écouteur `() => void` — quatre événements de catégorie, plus
`user:preferences-reordered`. Les quatre premiers ne portent rien que le
consommateur lise ; le cinquième porte `updates[]`, c'est-à-dire **l'ordre de la
liste, que rien d'autre n'annonce**. Il était jeté à l'entrée, avant d'atteindre
un consommateur. Un glisser-déposer fait sur un autre appareil n'atteignait
jamais l'onglet ouvert, et la liste tournant sur `staleTime: Infinity`, l'ordre
restait faux indéfiniment.

**Pourquoi cela ne se voit pas.** Le rangement produit exactement l'apparence du
traitement : l'événement EST abonné, le seau EXISTE, une invalidation PART. Rien
ne ressemble à un trou. Un abonnement muet se remarque ; un abonnement qui fait
quelque chose de proche mais pas la bonne chose ne se remarque pas — et il
n'existe aucun type qui l'interdise, puisqu'en TypeScript un `(data: T) => void`
est légalement satisfait par un `() => void`. **La règle : un événement qui
déclare une charge utile doit avoir sa PROPRE sortie, typée par cette charge.
Le regroupement d'événements est légitime seulement entre événements qui ne
portent rien.**

**Le second défaut, et il se cachait derrière le premier.** Le même seau
invalidait `queryKeys.preferences.categories()` — une clé React Query **sans
aucun observateur en production** (son hook n'est importé que par le baril et par
son propre test), alors que la liste rend ses catégories depuis le store Zustand,
dont l'action de rechargement n'avait elle non plus aucun appelant. Deux moitiés
d'un même geste, chacune inerte, se donnant mutuellement l'air d'être branchées.
C'est le motif « une dizaine d'écrivains, zéro lecteur » que `apps/web/CLAUDE.md`
documente déjà pour la forme plate de la liste de conversations, réapparu sur
l'axe des préférences : **invalider n'est pas rafraîchir tant qu'on n'a pas
nommé le composant monté qui relit.**

**La question de suivi, et elle est mécanique** (au sens de la leçon 215) : *pour
chaque critère que l'écran trie ou groupe, où vit-il, et quel écrivain temps réel
l'atteint VRAIMENT ?* Elle se pose colonne par colonne, en tableau, depuis le
rendu — jamais depuis l'événement. Un cycle qui instruit un ÉVÉNEMENT y répond
pour lui seul et laisse ses voisins intacts avec l'air d'être couverts : c'est
exactement ce qui est arrivé au correctif de l'épinglage, qui a branché
`user:preferences-updated` sans voir que cinq autres événements écrivaient la
même vue.

**Le corollaire de vérification.** Avant de déclarer qu'un événement « est
traité », suivre sa charge utile jusqu'au composant MONTÉ qui la relit. Le
suivi s'arrête à un `() => void`, à une clé de cache sans observateur, ou à une
action de store sans appelant — trois formes de la même impasse, et aucune ne
produit d'erreur.
