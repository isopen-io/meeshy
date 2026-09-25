## Leçon 462 — Un instrument répond à une question VOISINE de celle qu'on pose, et c'est une SECONDAIRE incompatible qui le trahit

Quatre pièges de mesure en une soirée, sur deux sessions, dans quatre matières
différentes. La forme est la même, et elle est plus utile que les quatre cas :

| on demande | l'instrument répond | ce qu'il a vraiment dit |
|---|---|---|
| « cette clé est-elle perdue ? » | `grep` → 0 | *ce TEXTE n'apparaît pas* — or la clé venait d'une table de tuples, d'un `rest` spread, d'un `payload.str("…")` |
| « ma vue peint-elle ? » | compteur de pixels → 23 196 « rouges » | *cette TEINTE est présente* — la photo de test était un massif de fleurs magenta |
| « mon code tourne-t-il ? » | `simctl install` → succès | *le bundle est à jour* — `install` par-dessus ne remplace PAS `Meeshy.debug.dylib` |
| « mon conteneur fait-il 74 ? » | arbre d'accessibilité → `44` | *cet ÉLÉMENT mesure 44* — c'étaient les ENFANTS, 44 + 30 = 74 |

> **Dans les quatre cas, ce qui trahit n'est jamais la valeur principale** — elle
> se relit toujours comme une réponse plausible à la question posée. C'est une
> **secondaire incompatible** qui sauve : la ligne du fichier, la boîte
> englobante (`y 90→669` pour un bandeau de 74), la date du dylib, la somme des
> hauteurs enfants.

D'où la parade, qui coûte une ligne : **à côté de la valeur, relever une seconde
grandeur que la bonne réponse contraint.** Un compte de pixels sans sa boîte
englobante ne se relit pas ; un zéro de `grep` sans un contre-exemple positif
non plus ; un `install` sans la date du dylib non plus.

Et le corollaire qui vaut pour une couleur de sonde, mais se généralise :
**l'instrument doit être ABSENT du milieu mesuré.** Un rouge sur des fleurs
magenta, un mot-clé qui existe déjà dans le fichier, un marqueur de log commun —
tous mesurent le milieu au lieu de la chose.

Formulation due à la session voisine, au terme d'un échange où chacun de nous a
retiré une conclusion : elle « branche 2 confirmée » (sonde jamais exécutée), moi
« le verdict dépend de la vitesse de la machine » (leçon 461). **Deux
rétractations valent mieux qu'un accord** : c'est en cherchant à départager nos
mesures qu'aucune des deux n'a survécu.
