## Leçon 288 bis — j'ai publié un mécanisme faux en croyant avoir mesuré (2026-08-25, itération 246i, correction de 245i)

245i a conclu que les 355 signalements de la garde d'atteignabilité étaient
« dominés par des faux positifs structurels », et a nommé les **exigences de
protocole** comme première cause :

> chaque nom apparaît deux fois (l'exigence + l'implémentation), donc
> l'arithmétique `usages − déclarations` retombe à zéro **même quand le
> protocole est appelé**

**C'est faux, et la faute se voit en posant l'arithmétique.** Un appel ajoute
une occurrence SANS ajouter de déclaration : `protocol P { func foo() }` +
`class C: P { func foo() {} }` + `p.foo()` donne 3 occurrences / 2 déclarations
⇒ net 1 ⇒ non signalé. Une exigence de protocole ne peut donc pas, à elle
seule, produire un faux positif.

Vérifié sur le cas que j'avais cité : `bringForward` a **3 occurrences / 3
déclarations** en production (l'exigence + DEUX implémentations) et **zéro appel
de production** — ses seuls appelants vivent dans `MeeshySDK/Tests/`, que le
corpus de la garde exclut.

### Ce que la mesure JUSTE rend

| bucket | nombre |
|---|---|
| appelées **uniquement par les tests** | **241** (68 %) |
| aucun appelant nulle part | **115** (32 %) |

**La conclusion de 245i s'inverse.** Le signal n'est pas noyé : les deux tiers
des signalements sont le résultat le plus intéressant du lot — la
généralisation, à l'échelle de l'app, du constat `likePost`/`bookmarkPost` de
244i. Et le correctif que 245i spécifiait (« ne pas compter les déclarations
d'un corps de `protocol` ») **ne change rien** : retirer l'exigence des deux
côtés donne 2/2, toujours zéro.

> **« Mesurer avant d'asserter » n'est pas satisfait par un `grep` de
> plausibilité.** J'ai vu un `protocol` et un `DropDelegate` dans la liste, j'ai
> reconnu deux motifs connus, et j'ai extrapolé un mécanisme à 355 entrées sans
> jamais compter combien relevaient de chacun. La leçon 287 exigeait la mesure ;
> je l'ai citée en la sous-traitant à une intuition.

Le contrôle qui l'aurait attrapé tient en une ligne : **poser l'arithmétique sur
un cas concret avant de généraliser son mécanisme.** Trois occurrences, deux
déclarations — l'histoire ne tenait pas.

Et un corollaire de conception, gagné au passage : **le bucket « appelée
seulement par un test » ne doit pas être EXCLU mais CLASSÉ.** Une garde qui
l'exclut jette son meilleur résultat ; une garde qui le nomme rend un inventaire
exploitable.
