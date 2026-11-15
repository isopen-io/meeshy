## Leçon 325

**Une « décision produit » peut n'en être pas une — demander d'abord quelle MESURE la trancherait.**

#4317 demandait, en la classant `décision-produit` : « laquelle des deux implémentations de
"supprimer pour moi" survit ? ». Formulée ainsi, la question appelait un arbitrage de goût, et
l'issue a attendu. Trois mesures l'ont close en vingt minutes :

1. **Les deux moitiés n'écrivent pas dans la même colonne.** La riche écrit
   `Participant.deletedForMe` ; la pauvre `UserConversationPreferences.deletedForUserAt`.
2. **Une seule des deux colonnes est LUE par la liste.** `conversations/core.ts` construit son
   `whereClause` sur `deletedForMe` ; `deletedForUserAt` n'est consultée par aucune requête de
   liste.
3. **Les trois clients appellent la même moitié.** iOS et Android la riche, le web ni l'une ni
   l'autre. L'adresse perdante n'a, mesuré, aucun appelant.

Après ça il ne restait aucune décision — seulement un constat et un alias à mettre en sursis.

> **Le test :** devant une étiquette `décision-produit`, demander *« quelle observation rendrait
> cette question sans objet ? »* avant de demander *« que préfère-t-on ? »*. Si la réponse existe
> dans le code, dans le schéma ou dans les clients, l'étiquette est un diagnostic manquant déguisé
> en question ouverte. C'est la forme du § 277 (« un corps VIDE n'est pas un autre choix de
> produit ») portée un cran plus haut : là on contestait la réponse, ici on contestait que ce soit
> une question.

**Et ce que la mesure trouve À CÔTÉ vaut souvent plus que la décision.** En comptant les lecteurs
de `deletedForUserAt`, on découvre que ses deux SEULS lecteurs — `restore-for-me` et
`GET /user/deleted-conversations` — lisent une colonne dont l'unique écrivain serveur est la route
que personne n'appelle. La corbeille de conversations ne peut rien contenir : elle rend une liste
vide par construction et refuse toute restauration. Devenu #4332.
