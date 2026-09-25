## Leçon 489 — Une garde qui épingle l'expression qu'on vient d'écrire est un MIROIR, et un doc-comment ne garde que le site où il est ÉCRIT

Le 2026-09-03, en câblant le pied de la scène du composer (#5002), j'ai écrit
dans le contrat de la vue :

> `sceneHashtags` — les balises DÉRIVÉES du texte, sans leur `#`. La surface les
> REÇOIT : **les dériver ici ouvrirait un second chemin vers le même fait**, et
> `ComposerHashtags` est le premier.

Puis, dans la même heure, à douze lignes de là, chez l'appelant :

```swift
sceneHashtags: ComposerHashtags.tags(in: documentText),
```

Le meuble avait DÉJÀ son site unique de dérivation (`composerHashtags`,
`MeeshyComposerHost+Audience.swift`), que la feuille et le sélecteur lisent sans
le recalculer. J'ai donc enfreint, du côté APPELANT, une règle que je venais
d'écrire du côté APPELÉ.

> **Un doc-comment garde le site où il est ÉCRIT, jamais le site qui APPELLE.**
> Le contrat d'une vue est lu par qui la modifie, pas par qui la monte — et
> c'est le montage qui viole la règle, parce que c'est là qu'il faut trouver une
> valeur.

### Ce qui a failli sceller la faute

J'avais écrit, dans le même lot, une garde censée protéger exactement ça :

```swift
XCTAssertTrue(hote.contains("sceneHashtags: ComposerHashtags.tags(in: documentText)"))
```

Elle épingle l'expression **que je venais d'écrire**. Elle serait restée verte
pour toujours sur une faute, et aurait interdit le correctif — le prochain qui
aurait remplacé la dérivation par `composerHashtags` aurait fait rougir « sa »
protection et se serait demandé s'il n'avait pas raté quelque chose.

> **Une garde qui valide ce qu'on vient d'écrire n'est pas une garde, c'est un
> miroir.** Elle ne peut rougir que si quelqu'un change le code, jamais si le
> code est faux. Le test qui l'attrape se pose au moment de l'écrire : *cette
> assertion pourrait-elle échouer sur une version JUSTE du code ?* Si la
> réponse est oui, c'est un miroir.

Ce qui a réellement attrapé la faute est une garde ÉCRITE PAR QUELQU'UN D'AUTRE,
sur la règle et non sur l'expression : `ComposerAudienceAndHashtagTests
.test_lesBalises_neSontDeriveesQuUneFois` compte les occurrences de
`ComposerHashtags.tags(in:` dans tout le meuble et exige **1**. Une garde qui
compte les SITES survit à toute réécriture ; une garde qui cite une expression
meurt avec elle.

Corollaire de procédé, et c'est ce qui rend la leçon opérationnelle : elle n'a
été trouvée que parce que le run était le bundle ENTIER. `ComposerAudience
AndHashtagTests` n'est pas une suite que j'aurais nommée dans un filtre — mon lot
ne touche ni l'audience ni la feuille de hashtags.
