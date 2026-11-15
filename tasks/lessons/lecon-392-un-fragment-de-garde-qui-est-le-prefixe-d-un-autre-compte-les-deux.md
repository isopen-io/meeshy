## Leçon 392 — Un fragment de garde qui est le PRÉFIXE d'un autre compte les deux

**Même lot.** La garde neuve devait prouver qu'aucun fichier hôte n'ouvre la
feuille audio hors du site unique :

```swift
code.components(separatedBy: "presentedPortal = .sound").count - 1
```

Elle a rougi à sa première exécution sur `MeeshyComposerHost+Intake.swift`, qui
ne l'ouvre pas. Le fichier contient `presentedPortal = .soundLibrary` — **un
autre portail**, dont le fragment cherché est le préfixe.

> Un compteur de sous-chaînes ne connaît pas les frontières de token. Deux cas
> d'énumération dont l'un préfixe l'autre (`.sound` / `.soundLibrary`,
> `.media` / `.mediaLibrary`, `.text` / `.textStyles`) rendent toute garde
> écrite sur le premier ALÉATOIREMENT vraie.

Le remède est de compter les deux et de retrancher. Le signe qui l'attrape : une
garde neuve qui rougit sur un fichier dont on sait qu'il ne fait pas la chose —
avant d'accuser le code, relire le FRAGMENT.
