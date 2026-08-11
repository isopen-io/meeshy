---
"@meeshy/gateway": patch
---

Une page delta de conversations tronquée se rattrape au lieu de sauter des lignes

`GET /conversations?updatedSince=` plafonne à 100 lignes et triait par `lastMessageAt`
décroissant — l'ordre de l'écran de liste, sans aucun rapport avec le filtre. Une fenêtre
de synchronisation ayant touché plus de 100 conversations rendait donc une page tronquée
dont les lignes coupées n'étaient pas « les moins récemment mises à jour ». Les deux
clients avancent pourtant leur watermark au max des `updatedAt` REÇUS : les lignes coupées
étaient enjambées définitivement, jusqu'à la réconciliation complète (1×/24 h sur iOS).
Entre-temps la liste affichait des compteurs de non-lus et des aperçus périmés sans qu'aucun
signal ne l'indique.

Une page delta est désormais triée par `updatedAt` croissant (`id` départage les égalités) :
les lignes coupées sont exactement celles d'`updatedAt` supérieur à la dernière ligne
rendue, donc le watermark qui les enjambait pointe dessus et l'appel suivant les rend. La
troncature devient une pagination naturelle, sans aucun changement client. Une page
ordinaire (sans `updatedSince`) garde l'ordre de récence.

Reste à la charge des clients, et le web le couvre déjà (`DELTA_PAGE_LIMIT` ⇒ relecture
complète) : plus de 100 conversations portant la MÊME milliseconde d'`updatedAt` débordent
d'une page que la borne stricte `gt` ne peut pas reprendre.
