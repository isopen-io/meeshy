---
"@meeshy/web": patch
---

Le retour d'onglet ne relit plus la liste de conversations page par page

`useInfiniteConversationsQuery` héritait du `refetchOnWindowFocus: 'always'` global. Sur une
`useInfiniteQuery`, ce réglage rejoue TOUTES les pages chargées et REMPLACE le cache : dix pages
de scroll valaient dix requêtes sur une route lourde à chaque retour d'onglet, les écritures
socket concurrentes étaient écrasées, et — la route paginant par OFFSET sur un tri
`lastMessageAt` décroissant — un message arrivé entre deux pages décalait toutes les suivantes
d'un cran, dupliquant une ligne à la frontière et en faisant disparaître une autre.

Le focus tire désormais le MÊME delta borné que le reconnect socket : une requête, une fusion
non destructrice, débouncée 1 s.

La seule chose que le refetch de focus faisait et que le delta upsert-only ne peut pas faire —
purger une conversation hard-supprimée côté serveur — est reprise par une réconciliation
complète chaînée après un delta réussi et bornée à 1× par 24 h, pendant web de
`fullReconcileInterval` sur iOS. Elle court même sur un delta VIDE (une conversation supprimée
ne produit aucune ligne de delta), jamais sur un delta échoué (local-first : le cache reste
intact hors ligne), et sa fenêtre démarre au premier delta d'un navigateur neuf plutôt qu'à
l'époque zéro — le montage vient déjà de lire le serveur en entier.
