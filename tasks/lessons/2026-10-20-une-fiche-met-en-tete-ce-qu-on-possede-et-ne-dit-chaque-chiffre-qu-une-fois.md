## Une fiche met en tête ce qu'on POSSÈDE, et ne dit chaque chiffre qu'une fois

**Contexte** (2026-10-20, captures iPhone du porteur, servies par la production) : deux fiches du jeu.

- Fiche **Meeshes** : le plus gros chiffre est le PRIX de la prochaine pièce (10 423), pas les 88 Meeshes possédées, reléguées dans un second cadre. Le prix paraît trois fois (titre, pastille « Coûte », phrase « Où j'en suis »). 108 233 paraît deux fois côte à côte, sous « En poche » et « Convertibles » : le même nombre sous deux noms, que le porteur avait déjà déclarés synonymes le 2026-10-17 (#10860, leçon `2026-10-17-un-synonyme-n-est-pas-une-dette.md`). 91 paraît deux fois, dont une sous un faux nom (« Record de Meeshes » : c'est le nombre de pièces frappées). Le calcul (« Prix de base 12 948 · 80,5 % au niveau 61 ») et une soustraction (« Restera ») occupent la carte. « +1000 Gloire » flotte, sans lien avec le bouton qui la donne.
- Fiche **Étincelles** : l'en-tête montre 377 752, tout ce qui a été reçu sur le cycle, au lieu des 108 233 possédées. « Où j'en suis » dit 108 233 deux fois dans le même cadre, et redit le prix de la Meesh n° 92.

**Correction du porteur** : « Plus de scroll horizontal permis, dans chaque cadre éviter la redondance d'information et afficher les informations prioritaires en gros et secondaires en petit. » Et, sur la fiche Étincelles : « [elle] s'intéresse à la somme maximale qu'on a jamais atteinte au lieu de la somme en notre possession actuellement ? »

**Pourquoi les gardes existantes n'ont rien vu** :

1. Le dédoublonnage de #9564 compare des CHAÎNES (`filter { $0 != head }`, `filter { $0.value != head }` dans `ProgressionConceptModel.swift`). Il attrape une ligne identique à la valeur de tête. Il ne voit pas le même FAIT habillé autrement : une pastille étiquetée, une phrase qui l'enchâsse, un autre nom. Et il ne court que dans un cadre, jamais sur l'écran entier.
2. L'en-tête iOS des Étincelles lit `game.level.score`, qui est « la base du niveau », et non la poche par son nom. Il ne montre la poche que tant que la loi du niveau lit la poche (#10892, 2026-10-17 23 h 09). La production, promue pour la dernière fois à 22 h 17 le même jour, lit encore le niveau sur le cycle : l'en-tête y montre le cycle (377 752), le niveau y vaut 61 au lieu de 32. Le web, lui, lie sa valeur à `sparks.pocket` (`apps/web/src/lib/view/progression-concepts.ts`).

**Règles** :

1. Un écran répond à UNE question ; sa valeur de tête est la réponse, en grand. Pour une ressource, c'est ce que le joueur POSSÈDE maintenant. Le cumul « depuis toujours » va en petit.
2. Un fait ne paraît qu'une fois par écran. Le dédoublonnage se fait par l'IDENTITÉ du fait (sa source), sur tout l'écran : tête, pastilles, phrases, lignes. Jamais par égalité de chaîne dans un seul cadre.
3. Sous la tête, deux tailles au plus : secondaire, puis tertiaire. Aucun calcul sur une fiche (prix de base, pourcentage, soustraction) : il vit dans les règles.
4. Une valeur de tête se lie à la donnée qu'elle NOMME, jamais à un champ technique qui la recouvre aujourd'hui par coïncidence de loi.
5. Rien ne glisse de côté, nulle part dans le jeu : tout s'empile ou passe à la ligne.
6. Un nom désigne un seul fait : « record » ne nomme pas un nombre de frappes.

**Comment l'appliquer** : avant de livrer un écran du jeu, lister chaque chiffre rendu avec sa source ; deux rendus de même source sont un défaut. Puis se demander : « quelle est la question de cet écran, et le plus gros chiffre y répond-il ? »
