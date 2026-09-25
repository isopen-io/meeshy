## Leçon 367 — Une livraison POUSSÉE et VERTE mais NON TAGUÉE est invisible : mon propre inventaire la comptait comme faite

Audit du 2026-08-31 06:20 UTC. J'ai comparé les issues que mes commits citent
(`Refs #n`) aux labels `to-integrate` réellement posés, en lisant les DEUX
depuis leur source — l'historique git d'un côté, `list_issues --labels
to-integrate` de l'autre. Trois livraisons poussées, vertes et **non taguées** :
#4536, #4526, #4528. Ma liste de suivi de la veille les comptait comme taguées.

Ce n'est pas une négligence isolée, c'est une propriété du dispositif. Une
livraison non taguée n'est **rouge nulle part** : le commit est là, la CI est
verte, l'issue est ouverte et sans label. Rien ne rougit, personne ne la
réclame, et la session d'intégration — dont le seul filtre est le label — ne la
voit pas. C'est le pire mode de perte : silencieux, et qui a l'air normal.

> **Un décompte est une AFFIRMATION, y compris le mien d'hier.** Il se recompte
> contre le FICHIER — ici les labels réels — jamais contre le journal qui l'a
> produit. Un inventaire recopié d'un inventaire ne mesure plus rien : il
> propage.

Parade, tenue depuis : l'inventaire des livraisons à taguer se reconstruit à
chaque tour depuis `git log` ∩ `list_issues`, jamais depuis la liste du tour
précédent. Et le rapprochement s'écrit dans les deux sens — ce que j'ai livré
sans taguer, ET ce que j'ai tagué sans livrer (le second sens n'a rien rendu,
mais c'est la vérification qui le dit, pas moi).

Corollaire déjà payé deux fois : **vérifier l'ascendance au MOMENT de poser le
label** (leçon 365), et non sur la mémoire du lot — une preuve de CI s'attache
à un SHA, et le SHA du run n'est pas celui qu'on avait en tête.
