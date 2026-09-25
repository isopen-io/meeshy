## Leçon 258 — gouverner ce qu'une garantie CONTIENT ne dit rien de la façon dont on l'ATTEINT

Cycle 116. Six cycles avaient durci la file de remise hors ligne : le nom
d'événement qu'une entrée rejoue (109 bis), la forme minimale de sa charge
(111), l'adressabilité de sa conversation (112), la corrélation du couple
`(eventType, payload)` (106), le verdict d'indélivrabilité du drain (114).
Tous portent sur des entrées **déjà écrites**.

Aucun n'a demandé si l'écriture a lieu. Elle était, sur les DEUX producteurs de
`message:new`, suspendue au succès de synchronisations que le code qualifie
lui-même de non-bloquantes :

- REST/ZMQ : l'enfilage était la DERNIÈRE instruction d'un `try` dont tout le
  reste est cosmétique, sous un `catch` journalisant « non-bloquant ». Un
  `emit` qui lève — l'adaptateur ou l'encodeur en défaut, ce que le dépôt écrit
  lui-même ailleurs — annulait le rejeu pour tous les absents ;
- WS : la requête participants avait bien son `try` dédié, mais retombait sur
  `[]`, que l'unité partagée lit comme « voici la liste, elle est vide » et non
  comme « je ne sais pas » (`params.participants ?? sa propre requête` —
  `[]` n'est pas nullish).

### La question à poser

> Pour toute garantie DURABLE : **de quoi son exécution dépend-elle, et ces
> dépendances ont-elles le droit d'échouer ?**

Ici les deux dépendances avaient ce droit — écrit, assumé, journalisé. La
garantie, elle, ne l'avait pas. Le dépôt connaissait déjà la règle et
l'appliquait à l'instantané de reconnexion (le drain est placé HORS du `try`
pour qu'un accroc cosmétique n'échoue jamais le rejeu destructif) ; elle n'avait
jamais été portée aux deux chemins d'ENVOI.

### Corollaire — un défaut choisi pour la commodité du site d'appel décide à la place du consommateur

`let xs: T[] = []` rend le code d'après plus court (`.map`, `.length` sans
garde) et transforme une IGNORANCE en AFFIRMATION. Le consommateur qui savait
distinguer les deux — et qui avait un comportement pour chacune — n'a jamais eu
l'occasion de le faire.

C'est la même distinction que `bridgeComputed(undefined)` / `bridgeNotComputed()`
(cycle 63), un étage plus bas et sans le vocabulaire pour la dire : les deux
états y partageaient une valeur.

### Corollaire — une étiquette de `catch` ne qualifie que ce que son auteur avait en tête

« non-bloquant » était vrai des deux premières instructions du `try` et faux de
la troisième. Personne ne relit un `try` pour vérifier son étiquette : c'est
l'étiquette qu'on lit. Même famille que « un commentaire qui ÉNONCE une
contrainte est une AFFIRMATION » (cycle 94) et que le commentaire
d'impossibilité périmé (cycle 108) — avec cette variante : ici l'étiquette
décrit une PORTÉE, et une portée grandit toute seule à chaque instruction
qu'on ajoute au bloc.


---
