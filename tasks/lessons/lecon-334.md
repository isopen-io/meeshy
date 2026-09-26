## Leçon 334

**Une mesure exacte n'est pas une conclusion — je l'ai oublié quatre fois en une nuit.**

Quatre fois, la même forme : j'observe correctement, puis j'affirme ce que l'observation ne dit pas.

| ce que j'ai mesuré (juste) | ce que j'en ai conclu (faux) |
|---|---|
| `keyGenerator` rend `contact-change:…:${userId}` | « donc la clé est le compte » — il ne RECEVAIT pas d'`authContext` |
| un doc-comment dit « sans `trustProxy` » | « donc un seul seau pour la plateforme » — `trustProxy` est posé depuis #4137 |
| `/attachments/:id/analysis` répond 200 à la racine | « donc une brèche non vue » — alias déprécié, documenté, annoncé |
| `/api/v1/me` absent de la liste OpenAPI | « donc omis du contrat » — il y figure sous `/api/v1/me/`, avec la barre |

Aucune des quatre mesures n'était fausse. Les quatre conclusions l'étaient.

> **Entre l'observation et la conclusion, il y a toujours une prémisse implicite.** « La chaîne n'est
> pas dans la liste » ne devient « la route est omise » que si l'on suppose que les deux sources
> écrivent les chemins pareil. « La route répond » ne devient « personne ne le sait » que si l'on
> suppose que personne ne l'a écrit. **La prémisse est ce qu'il faut aller vérifier, et c'est
> précisément ce qu'on ne pense pas à vérifier — parce qu'on ne la voit pas.**

Le test qui les aurait toutes attrapées tient en une question : *qu'est-ce qui devrait être vrai, en
plus de ce que je viens de mesurer, pour que ma phrase le soit ?* Puis aller le lire.

**Deux règles concrètes, tirées des instances :**

- **Comparer un chemin à une liste publiée exige de normaliser la barre finale.** Le générateur
  OpenAPI émet la forme DÉCLARÉE (préfixe + `'/'`), le serveur sert les deux (`ignoreTrailingSlash`).
  Une comparaison de chaînes brutes entre deux sources qui n'ont pas la même convention produit un
  faux négatif à tous les coups. C'est ce qui a produit #4372, fermée comme non-défaut.
- **Avant de déclarer une route « oubliée », lire `routes/index.ts`.** Un montage à préfixe vide y
  est déclaré avec sa motivation. Ce dépôt écrit ses décisions ; ne pas les chercher, c'est les
  redécouvrir comme des anomalies.

**Corollaire de coût.** Une conclusion fausse voyage plus vite qu'une mesure : la troisième a produit
une issue (#4367) qu'il a fallu re-cadrer, la quatrième une issue (#4372) qu'il a fallu fermer, et la
deuxième s'est propagée dans quatre messages de commit, trois commentaires et une leçon avant d'être
rattrapée. **Le coût d'une vérification de prémisse est de quelques minutes ; celui de sa propagation
se paie en rectifications publiques.**
