## Leçon — une API qu'on ne compile pas se vérifie sur sa surface exacte, pas sur son allure (2026-08-22)

Itération 237i. Le correctif tenait en une ligne, écrite de mémoire :

```swift
count.formatted(.number.notation(.compact).locale(locale))
```

La CI l'a rendue **deux fois fausse**, et les deux erreurs sont de natures
différentes — ce qui est précisément l'intérêt du cas :

1. `type 'BinaryInteger' has no member 'number'`. `.number` est un membre
   statique porté par une extension conditionnelle de `FormatStyle` ; à travers
   la surcharge générique `BinaryInteger.formatted(_:)`, il n'a **pas de base à
   inférer**. L'expression est bien formée à l'œil, et le compilateur n'a
   pourtant rien pour la résoudre.
2. `cannot infer contextual base in reference to member 'compact'`. Celle-là est
   plus simple et plus humiliante : **`.compact` n'existe pas**.
   `NumberFormatStyleConfiguration.Notation` n'offre que `.automatic`,
   `.scientific` et `.compactName`. Le nom plausible n'était pas le nom réel.

Le second message masquait le premier autant que l'inverse : « cannot infer
contextual base » se lit volontiers comme une conséquence de l'échec de
`.number`, alors que c'est un défaut indépendant. Corriger l'un sans l'autre
aurait donné un second rouge.

> **Écrire du Swift sans compilateur oblige à préférer, à qualité de rendu
> égale, la forme qui demande le MOINS d'inférence.** Un style nommé et
> construit — `IntegerFormatStyle<Int>(locale:).notation(.compactName).format(count)`
> — n'a aucune base contextuelle à deviner : il compile ou il ne trouve pas le
> symbole, et dans ce dernier cas l'erreur nomme le symbole. La forme abrégée,
> elle, échoue sur l'inférence et l'erreur parle du protocole, pas du membre.

Corollaire, qui vaut au-delà de Swift :

> **Le doute doit porter sur les NOMS, pas seulement sur la forme.** J'avais
> vérifié que la notation compacte existait depuis iOS 15 et que le plancher du
> projet était iOS 16 — j'ai vérifié la *disponibilité* et pas l'*orthographe*.
> Quand on ne peut pas compiler, une API mémorisée mérite qu'on énumère les cas
> réels de son enum, ou qu'on la cite depuis un site d'appel déjà présent dans
> le dépôt.

Ce qui a bien fonctionné, et qu'il faut garder : les **tests de propriétés**
n'ont eu à changer d'aucune façon. Ils n'affirmaient aucune chaîne CLDR ni
aucune forme d'appel — seulement que le rendu français diffère du rendu
anglais. Un test écrit sur le contrat et non sur l'implémentation survit à la
correction de l'implémentation.
