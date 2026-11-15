## Leçon 471 — Une cible tactile INVISIBLE qui en recouvre une VISIBLE n'apprend pas une erreur, elle apprend une fausse RÈGLE

Dix tentatives perdues à atteindre le composer de story au simulateur. Je tapais
le `+` au centre de sa cible ; l'app ouvrait le Feed. J'ai cru à un mauvais
calcul de coordonnées, puis à un simulateur coincé, puis j'ai lu les frames :

    Feed          {{19.25, 125.25}, {53.5, 53.5}}   → x 19,25 … 72,75
    Add a story   {{14.75, 136.75}, {36.5, 36.5}}   → x 14,75 … 51,25

`Add a story` est CONTENU dans `Feed` sauf une bande de **4,5 pt**. Un tap à
(17, 155) ouvre le composer ; à (33, 155), le Feed. La géométrie explique le
comportement au pixel près.

`Feed` n'a aucun glyphe à cet endroit : c'est une zone tactile invisible posée
sur la rangée de stories. L'auteur voit un `+`, tape dessus, arrive sur le Feed —
et n'a **aucun moyen de savoir qu'il a raté une cible**, puisqu'il n'y avait rien
à rater. Il en conclut que « le + ouvre le Feed », et cesse de chercher la porte.

> Un recouvrement de cibles ne se voit sur AUCUNE capture, et l'œil ne le
> soupçonne pas : les deux boutons ont l'air distincts. Il ne se lit qu'aux
> FRAMES. Devant un contrôle qui « ne répond pas », lire les frames avant de
> mettre en cause le geste, l'outil ou l'appareil.

Suivi : #4931. Et la note de méthode : mon propre repli — viser les pixels d'une
capture — est ce qui a coûté les dix tentatives. Un utilitaire qui tape par
LIBELLÉ, en lisant l'arbre, les aurait toutes évitées.
