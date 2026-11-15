## Leçon — une garde de source qui rougit sur son cas nominal n'apprend plus rien (2026-08-18)

`LentilleScreenNotMountedTests` interdisait toute référence aux composants
Lentille hors du dossier `Lentille/`, alors que son propre en-tête ET un
troisième témoin du même fichier nommaient `ConversationListView` comme le point
de greffe légitime. Trois endroits, deux règles contradictoires. Elle est passée
au rouge quand les montages y ont été écrits en clair — sans qu'aucune règle
produit ne soit violée.

Deux corrections, et la seconde est la vraie :
1. Dépouiller les commentaires (`AppSourceGuard.stripComments`) — 2 des 4 échecs
   portaient sur des commentaires.
2. Ce qui compte n'est pas l'absence du NOM, c'est que le montage soit GARDÉ. Le
   témoin de gating existant se contentait d'exiger que la chaîne du drapeau
   apparaisse quelque part dans le fichier : un montage sorti de son bloc
   l'aurait laissé vert, soit exactement la régression qu'il nomme. Remplacé par
   une preuve de contenance d'accolades — et prouvée ROUGE par contre-épreuve
   avant livraison.
