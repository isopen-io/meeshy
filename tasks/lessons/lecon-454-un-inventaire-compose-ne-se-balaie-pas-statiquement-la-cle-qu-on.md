## Leçon 454 — Un inventaire COMPOSÉ ne se balaie pas statiquement : la clé qu'on cherche n'existe nulle part sous forme de texte

Pour mesurer ce que le pont v1⇄v3 perd (#4833), j'ai grepé les clés émises :

```
grep -oE 'payload\["[a-zA-Z]+"\]' CanvasV3Migration.swift
```

La réponse pour la famille `text` : neuf clés, et un manque apparent de seize
champs — `textStyle`, `textColor`, `textAlign`, `fontWeight`, `frameShape`,
`borderColor`… J'étais à une phrase d'écrire dans une issue que le pont perdait
la COULEUR d'un texte de story.

Il n'en perd aucune. `textPayload` compose ses clés depuis des **tables de
tuples** :

```swift
let strings: [(String, String?)] = [("textStyle", text.textStyle), …]
for (key, value) in strings { if let value { payload[key] = .string(value) } }
```

Aucune de ces seize clés n'apparaît jamais à côté d'un `payload[…]`. Le balayage
statique ne rendait pas un résultat partiel : il rendait un résultat **faux dans
le sens le plus dangereux**, celui qui accuse.

> **Un inventaire dont les entrées sont CALCULÉES est invisible à toute mesure
> statique.** Boucle sur une table, `mapValues`, clé construite par
> interpolation, `Dictionary(uniqueKeysWithValues:)` : dès que la clé n'est pas
> un littéral au point d'écriture, `grep` ne peut plus rien affirmer — ni la
> présence, ni l'absence. La seule mesure valide est à l'EXÉCUTION : peupler,
> traverser, comparer.

Ce qui m'a arrêté n'est pas une relecture de principe : j'ai ouvert la fonction
**parce que j'allais la citer dans l'issue**. C'est la leçon 440 (« une preuve
CITÉE oblige à rouvrir la source ») qui a payé, une seconde fois et dans l'autre
sens : la première m'avait épargné une accusation contre `tasks/lessons.md`,
celle-ci contre un fichier de production.

Et la même journée, la même erreur sous une autre forme : `gh project item-list
--limit 600` a rendu « #4899 ABSENT du tableau » sur une liste **tronquée à
600 items** pour un tableau qui en porte 799. Le second appel, à 5000, a rendu
« PRÉSENT ». **Une réponse négative tirée d'une liste bornée ne dit rien** — et
comme la liste ne dit pas qu'elle est bornée, c'est à l'appelant de comparer le
nombre rendu à sa limite avant de croire une absence.

---
