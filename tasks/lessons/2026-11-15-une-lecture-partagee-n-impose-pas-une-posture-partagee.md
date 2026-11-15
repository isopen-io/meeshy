## Une lecture PARTAGÉE n'impose pas une posture PARTAGÉE — et un refus PROUVÉ ne se récupère pas comme un aveu d'IGNORANCE (2026-11-15, #18615)

*Cycle 166 de la routine d'amélioration continue du temps réel.*

**La règle, en une phrase : quand deux gardes interrogent la même ligne, mutualiser la LECTURE est presque toujours juste ; mutualiser son `catch` est presque toujours faux.** L'unité qui lit rend un ÉTAT — « lu » ou « illisible » — et ne décide RIEN de ce qu'il faut en faire. Chaque consommateur arbitre chez lui.

Ce qui a produit la règle : le rejeu hors ligne porte deux gardes qui lisent la même ligne `Message`. La VIVACITÉ (#16685) demande « ce message existe-t-il encore ? » et, à l'échec, il lui manque la preuve d'une **MORT** — donc elle livre (fail-OPEN). Le PLANCHER D'HISTOIRE (#18615) demande « ce lecteur peut-il le lire ? » et, au même échec, il lui manque la preuve d'un **DROIT** — donc il se tait (fail-CLOSED). La seconde ne demandait qu'une colonne de plus (`createdAt`) sur la requête que la première faisait déjà, et le drain est le chemin de la tempête de reconnexions : partager la lecture était la bonne idée, et le dépôt la prescrit (« avant de conclure qu'une garde coûterait une requête, regarder ce que le site lit déjà »).

Ce qui ne l'était pas : laisser la lecture garder son `catch`. Celui de la vivacité est fail-open, écrit et justifié. Y brancher le gate de plancher lui aurait donné cette posture — et c'est le fail-open qui aurait gagné, la vivacité existant d'abord. **La garde de confidentialité qu'on ajoute aurait été désarmée par la lecture qu'on lui a fait partager, sans qu'un seul témoin ne tombe** : elle serait restée juste sur tout son chemin nominal.

Pourquoi ça ne se voit pas : un `catch` se lit comme une propriété de la LECTURE (« cette requête peut échouer, voici ce qu'on fait »). Il est en réalité une propriété de la QUESTION — la même panne ne veut pas dire la même chose selon ce qu'on cherchait à prouver. Tant qu'une lecture n'a qu'un consommateur, les deux sont confondus sans conséquence, et c'est l'état de toute lecture, jusqu'au jour où on la partage.

La forme juste : la lecture rend `{ kind: 'read', … } | { kind: 'unreadable', error }` et n'arbitre pas ; le consommateur A traduit `'unreadable'` par « on livre », le consommateur B par « on se tait ». Corollaire de propriété : **la posture d'une lecture qu'on EMPRUNTE ne se change pas en silence.** Le gate de plancher partage aussi la lecture des lignes `Participant` avec le gate d'appartenance, dont le `catch` fail-open est un arbitrage ancien et motivé ; ajouter une question à une lecture ne donne pas le droit de réécrire ce que son échec décide pour le consommateur d'origine. On documente le résidu, et on le laisse à qui voudra rouvrir cet arbitrage.

**La seconde moitié, trouvée par l'audit adversarial du même lot : un code de raison qui range ensemble un refus PROUVÉ et un aveu d'IGNORANCE les rend indistinguables pour tout le code en aval.** Le lot refusait trois choses sous une seule branche, avec la justification « il n'y a rien à faire relire au client ». Elle n'était vraie que de la première :

| raison | ce que la garde SAIT | c'est |
|---|---|---|
| `below-history-floor` | le message EST sous le plancher | un refus **PROUVÉ** — rien à relire, aucune porte REST ne le sert |
| `floor-unreadable` | on ne sait pas quel est le plancher | un aveu d'**IGNORANCE** — donc une PERTE |
| `message-date-unreadable` | on ne sait pas de quel côté il tombe | un aveu d'**IGNORANCE** — donc une PERTE |

Le drain étant DESTRUCTIF (l'entrée a déjà quitté Redis quand la garde s'exécute), taire les deux dernières faisait perdre définitivement et en silence, sur une simple panne transitoire, tout l'arriéré texte d'un lecteur borné — c'est-à-dire exactement l'arbitrage que le gate d'appartenance voisin a explicitement REFUSÉ d'avoir (« échangerait une fuite rare contre une perte probable »), réintroduit un étage plus bas par la garde qu'on venait d'ajouter. Et la correction ne coûte aucune confidentialité : la relecture REST qu'on déclenche en nommant la conversation repasse par `historyFloorClause`, donc elle ne peut pas servir ce que la garde vient de refuser.

**La question à poser à toute garde fail-closed n'est donc pas seulement « refuse-t-elle au bon moment ? » mais « sait-elle POURQUOI elle refuse, et l'appelant peut-il encore le savoir ? »** — un fail-closed qui ne distingue pas la preuve de l'ignorance est un fail-closed qui perd des données sans le dire.

Et le témoin qui gardait ce troisième signal NE POUVAIT PAS TOMBER : il assertait un compteur vide dans une scène où l'événement n'est pas émis du tout. Mesuré par l'audit : faire exactement l'inverse de ce qu'il prétendait garder ne faisait tomber aucun des 1 396 témoins du sous-arbre. La scène juste est un lot MIXTE sur DEUX conversations, où l'événement EST émis, avec la liste assert en ÉGALITÉ — et la propriété tombe alors dans les deux sens.
