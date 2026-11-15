## Leçon 573 — Une liste d'annotations CI est plafonnée, et le rapport dit son propre total juste à côté

2026-09-11, iOS (#6078). Pour attribuer les rouges de `dev`, j'ai comparé la
liste des tests en échec de `main` à celle d'une PR. Les deux faisaient dix-neuf
noms ; j'en ai tiré « douze nouveaux, douze disparus » et je l'ai rapporté.

Le run de `main` portait une annotation de plus, que je n'avais pas lue :

```
notice: 24 test(s) en échec (liste en annotations ci-dessous)
```

**Vingt-quatre, pour dix-neuf noms publiés.** GitHub plafonne les annotations
d'un check-run ; le job, lui, écrit son total. Les deux chiffres se touchent
dans la même réponse d'API.

> **Une liste tronquée ne se signale pas comme tronquée** — elle se signale
> comme une liste. Ce qui la dénonce est le COMPTE que le rapport publie à
> côté, et il faut le lire AVANT de comparer deux listes. Sinon on mesure
> l'écart entre deux troncatures.

Parade : la liste complète vit dans le LOG du job
(`gh run view --job <id> --log`), jamais dans les annotations. Et quand un
rapport publie un total, comparer `len(liste) == total` coûte une ligne.

Même famille que la 567 (lire un rapport par ce qu'il devait produire) et que
le « chiffre absurde » de la série C : à chaque fois, le rapport contenait de
quoi se dénoncer lui-même.
