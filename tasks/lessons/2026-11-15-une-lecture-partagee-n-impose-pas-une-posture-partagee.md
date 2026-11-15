# Une lecture PARTAGÉE n'impose pas une posture PARTAGÉE

*2026-11-15, cycle 166, #18615.*

## La règle

Quand deux gardes interrogent la même ligne, **mutualiser la LECTURE est
presque toujours juste ; mutualiser le `catch` est presque toujours faux.**
L'unité qui lit rend un état — « lu » ou « illisible » — et ne décide RIEN de ce
qu'il faut en faire. Chaque consommateur arbitre chez lui.

## Ce qui a produit la règle

Le rejeu hors ligne porte deux gardes qui lisent la même ligne `Message` :

| garde | sa question | ce qui manque à l'échec | verdict |
|---|---|---|---|
| vivacité (#16685) | ce message existe-t-il encore ? | la preuve d'une **MORT** | fail-**OPEN** |
| plancher (#18615) | ce lecteur peut-il le lire ? | la preuve d'un **DROIT** | fail-**CLOSED** |

La seconde ne demande qu'une colonne de plus (`createdAt`) sur la requête que la
première fait déjà, et le drain est le chemin de la tempête de reconnexions :
partager la lecture était la bonne idée, et le dépôt la prescrit (« avant de
conclure qu'une garde coûterait une requête, regarder ce que le site lit déjà »).

**Ce qui ne l'était pas : laisser la lecture garder son `catch`.** Le `catch` de
la vivacité est fail-open, écrit et justifié. Brancher le gate de plancher
dessus lui aurait donné cette posture — et c'est le fail-open qui aurait gagné,
la vivacité existant d'abord. La garde de confidentialité qu'on ajoute aurait
été **désarmée par la lecture qu'on lui a fait partager, sans qu'un seul témoin
ne tombe** : elle serait restée juste sur tout son chemin nominal.

## Pourquoi ça ne se voit pas

Un `catch` se lit comme une propriété de la LECTURE (« cette requête peut
échouer, voici ce qu'on fait »). Il est en réalité une propriété de la
QUESTION : la même panne ne veut pas dire la même chose selon ce qu'on
cherchait à prouver. Tant qu'une lecture n'a qu'un consommateur, les deux sont
confondus sans conséquence — et c'est l'état de toute lecture, jusqu'au jour où
on la partage.

## La forme juste

```ts
// La lecture : elle rend un ÉTAT, elle n'arbitre pas.
export type QueuedMessageFacts =
  | { kind: 'read'; byId: ReadonlyMap<string, Row> }
  | { kind: 'unreadable'; error: unknown };

// Consommateur A — il manque la preuve d'une mort : on livre.
if (facts.kind === 'unreadable') return { kept: entries, refused: [] };

// Consommateur B — il manque la preuve d'un droit : on se tait.
if (facts.kind === 'unreadable') return 'message-date-unreadable';
```

Et le corollaire de propriété : **la posture d'une lecture qu'on EMPRUNTE ne se
change pas en silence.** Le gate de plancher partage aussi la lecture des lignes
`Participant` avec le gate d'appartenance, dont le `catch` fail-open est un
arbitrage ancien et motivé. Ajouter une question à une lecture ne donne pas le
droit de réécrire ce que son échec décide pour le consommateur d'origine — on
documente le résidu, et on le laisse à celui qui voudra rouvrir cet arbitrage.

## La question à poser

Devant toute mutualisation de lecture : **« les deux consommateurs veulent-ils
la même chose d'un échec ? »** — et si la réponse est non, la lecture ne doit
porter aucun `catch` qui conclut.
