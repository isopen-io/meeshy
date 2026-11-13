## Un TITRE de témoin fait le travail de conviction, et personne ne relit l'assertion — « la panne est NOMMÉE » gardée par `toHaveBeenCalledTimes`

*2026-11-08 — #17086*

### Ce qui s'est passé

Le lot #17086 enrobe quatre audiences de `message:new` séparément, et se
félicitait, dans son journal comme dans son message de commit, d'une moitié que
l'issue ne demandait pas : « la panne est **NOMMÉE à l'appelant**, une fois par
audience perdue, avec sa room ».

Elle ne l'était pas. `safeBroadcast(label, emit, onError)` faisait :

```ts
if (onError) onError(error);
else enhancedLogger.error(`[broadcast] ${label}`, error);
```

**Le label n'atteignait jamais `onError`.** Les deux appelants de production en
passent un : les onze étiquettes composées par le lot étaient mortes, et quatre
audiences perdues rendaient quatre journaux identiques et anonymes.

Et le lot faisait RÉGRESSER son prédécesseur : le chemin par lecteur passait
`safeBroadcast(label, fn)` *sans* `onError`, donc tombait dans le `else` et
publiait l'identité de la cible. Lui donner un `onError` l'a sortie.

### Pourquoi aucun témoin ne l'a vu

Les deux témoins qui gardaient la propriété s'appelaient « la panne est NOMMÉE
à l'appelant, une fois par audience perdue, **avec sa room** ». Leur assertion
était `expect(onError).toHaveBeenCalledTimes(2)`.

Mesuré : remplacer les onze étiquettes par la constante `'MUTANT'` laissait
**46/46 témoins verts**. Et la ligne que le lot AJOUTAIT pour descendre
`onEmissionError` dans le chemin par lecteur n'était couverte par rien — la
retirer laissait **1072/1072 verts sur 29 suites**.

> **Un titre qui énonce la propriété et une assertion qui compte les appels est
> la forme la plus crédible d'un témoin qui n'atteste rien** : le titre fait le
> travail de conviction, et personne ne relit l'assertion. C'est « un
> commentaire qui ÉNONCE une contrainte est une AFFIRMATION » (cycle 94),
> appliqué à l'intitulé d'un `it(...)`.

### La règle

Quand la propriété gardée est *ce qui est DIT* — une étiquette, une clé de
localisation, une raison, un code d'erreur —, l'assertion porte sur
l'**ARGUMENT**, jamais sur le nombre d'appels :

```ts
// ✗ passe sous n'importe quelle étiquette, y compris aucune
expect(onError).toHaveBeenCalledTimes(2);
// ✓ tombe dès que l'étiquette change ou disparaît
expect(labels).toEqual(['message:new (masqué user:h1)', '…']);
```

Et la mesure qui le prouve n'est pas une relecture : c'est une mutation de la
VALEUR dite. Remplacer toutes les étiquettes par une constante est le test d'un
témoin d'observabilité, comme faire lever `emit` est celui d'un témoin de
remise.

### Le corollaire, et c'est le plus cher

**Le code qu'on écrit en bonus n'est pas relu comme le code qu'on écrit sous
contrainte.** Sur ce lot, la moitié difficile — quatre audiences disjointes, la
fidélité d'une extraction entre deux jumelles déjà divergentes — était juste, et
un audit l'a prouvée par comptage. La moitié *ajoutée en plus*, celle dont le
journal se félicitait, était fausse de bout en bout : une étiquette jetée, une
régression du lot précédent, deux témoins inertes.

Devant une phrase de journal qui commence par « et la moitié que l'issue ne
demandait pas », demander : **qu'est-ce qui la MESURE ?**
