## Leçon 473 — Un symptôme « main actor-isolated » a DEUX causes, et l'annotation est un INSTRUMENT DE MESURE avant d'être un correctif

**Le fait (2026-09-03, #4925).** Un décodeur d'image animée, écrit `nonisolated`
dans l'intention, ne compilait pas depuis ses témoins :

```
error: call to main actor-isolated static method 'decode(_:maxPixelSize:)'
       in a synchronous nonisolated context
```

Quatorze erreurs, **toutes** désignant les APPELS depuis les témoins. Aucune ne
désignait la cause. Le geste réflexe — annoter la classe de test `@MainActor` —
aurait fait compiler l'ensemble **en laissant le décodeur sur le thread
principal** : trente images décodées pendant un défilement, la dimension 4 en
échec, et un vert qui scelle le défaut.

**Les deux causes ne se distinguent pas au message :**

| cause | le bon geste |
|---|---|
| l'isolation par défaut du paquet (`defaultIsolation(MainActor)`) | annoter `nonisolated` — c'est juste |
| **une seule ligne non `Sendable` qui contamine le type** (ici une `static let [FormatKeys]` de `CFString`) | annoter ne suffit PAS ; il faut rendre la ligne Sendable |

**Le discriminant, et il est mécanique** : poser `nonisolated` sur le type et
LIRE ce que ça révèle. Si une erreur apparaît *à l'intérieur* du type —
`static property 'formats' is not concurrency-safe` —, la cause est la ligne. Si
tout compile, c'était le paquet.

> **L'annotation n'était pas le correctif, elle était la SONDE.** Elle a déplacé
> l'erreur de l'appelant vers la cause. Le réflexe « annoter jusqu'à ce que ça
> compile » et le geste juste commencent par le même caractère ; ce qui les
> sépare est de relire l'erreur suivante au lieu de la faire taire.

Retour d'une session voisine, qui resserre la règle : sur ses trois cas
identiques du jour, **deux fois annoter était le bon geste** — la cause était
vraiment le paquet. Une règle « ne jamais annoter » l'aurait envoyée chercher
deux fois une table inexistante. C'est bien la SONDE qui tranche, pas une
préférence a priori.
