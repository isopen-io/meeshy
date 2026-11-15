## Leçon 140 — L'unanimité des LECTURES est ce qui rend un trou d'ÉCRITURE invisible

Suite des leçons 137 à 139, mais le geste est inverse : là où elles trient un champ mort par sa
CONSOMMATION, celle-ci porte sur une règle **vivante et partout appliquée** — sauf à un endroit.

`deletedAt: null` était écrit dans chaque lecture de message du service : la liste, la recherche,
et la liste des messages ÉPINGLÉS, cent lignes sous les deux routes d'épinglage qui, elles, ne
l'écrivaient pas. Épingler un message supprimé répondait donc 200, écrivait sur un tombstone, et
diffusait `message:pinned` dans la room ET dans la file de rattrapage hors-ligne.

**Pourquoi ça ne se voyait pas — et c'est le cœur de la leçon.** Ce n'est pas MALGRÉ l'unanimité
des lectures, c'est À CAUSE d'elle. Aucune lecture ne rendant plus jamais la ligne fautive :

| Surface | Ce qu'elle montre du défaut |
|---|---|
| Base | La colonne est écrite, mais aucune requête ne la relit |
| Réponse HTTP | `200`, indiscernable du succès nominal |
| Liste des épinglés | Vide — elle filtre `deletedAt: null` |
| **Le fil temps réel** | **Le seul endroit où le défaut existe** |

Un `where` manquant à l'écriture ne produit donc pas une donnée fausse qu'on peut lire : il produit
un **événement** qui nomme un objet qu'aucune lecture ne rendra plus. Et l'événement ne se répare
pas tout seul — le client qui l'applique à son cache (web `handleMessagePinned`, iOS `updatePinned`)
n'a plus AUCUNE source pour le détromper, et la file hors-ligne le rejoue à chaque reconnexion
jusqu'à son TTL.

**La méthode** : devant une règle appliquée par toutes les lectures, ne pas conclure à l'invariant.
Lister les ÉCRITURES et vérifier une par une. Une règle n'est un invariant que si le chemin qui
CRÉE l'état la porte aussi.

**Corollaire de symétrie, prouvé par mutation** : quand un geste a deux sens (épingler/dépingler,
bloquer/débloquer, archiver/désarchiver), la garde va sur les DEUX. N'en garder qu'un rouvre le trou
par l'autre. La mutation-proof doit le montrer séparément — ici, retirer la garde du `PUT` fait
rougir exactement ses 2 témoins, celle du `DELETE` exactement les 2 autres, sans recouvrement. Un
recouvrement aurait signifié qu'un seul des deux tenait vraiment.

**Corollaire de non-geste, du même cycle** : l'épingle qui SURVIT à une suppression (épingler puis
supprimer) reste en base, inatteignable. La nettoyer demandait la même ligne dans les QUATRE chemins
qui écrivent `deletedAt` — la duplication en N exemplaires dont un finit par manquer. Elle n'est
visible nulle part et le tombstone part au balayage : **pas de défaut observable, pas de geste.**
Fermer la porte au point de lecture vaut mieux que la répéter à N points d'écriture.
