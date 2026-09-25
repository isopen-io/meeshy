## Leçon 484 — Une capacité peut être servie à VoiceOver et à PERSONNE D'AUTRE, et c'est l'inverse du défaut qu'on cherche

Le dépôt a une leçon bien rodée : *« une chaîne pour l'œil ET pour VoiceOver
sert un seul des deux »*. Elle a toujours été instruite dans le même sens — le
chemin accessible est le parent pauvre, on l'oublie, on le rattrape.

Mesuré le 2026-09-03, en cherchant pourquoi rien ne distinguait un sticker animé
d'un sticker immobile dans la palette du composer :

| ce qui déclare le mouvement | ce qui le RESTITUE |
|---|---|
| `StickerTemplateCatalog+*.swift` — `animation: .tada`, `.pulse`, `.wobble`… ou `nil` | — |
| `StoryStickerAccessibility.withMotion` — onze libellés localisés, « qui palpite », « qui bat » | **VoiceOver** |
| `StickerPickerView+Templates.swift` — `grep -n animation` ⇒ **zéro ligne** | *personne* |
| `StoryRenderer.swift:305` — la pose, gardée par `mode == .play` | le **lecteur**, jamais le composer |

**Le lecteur d'écran était le SEUL servi.** Un utilisateur non voyant savait
lesquelles bougent ; un utilisateur voyant, non. Et il ne pouvait pas
l'apprendre en posant la décoration, puisque la scène d'édition ne joue pas le
mouvement.

> La question à poser n'est donc pas « le chemin accessible est-il servi ? »
> mais, pour tout fait que l'app DÉCLARE à une modalité : **quelles autres
> modalités le reçoivent ?** Les onze libellés étaient la PREUVE que la donnée
> existait, était localisée, et avait déjà été jugée utile à dire. Rien n'était
> à décider — seulement à montrer.

Corollaire de méthode : la table ci-dessus se remplit en quatre `grep`, un par
site de restitution, et c'est elle qui a rendu la conclusion évidente. Chercher
« où est la donnée » aurait rendu trois sites et fait croire à une couverture ;
chercher « qui la RESTITUE » en rend un.

Et le remède qui coûte le moins à l'utilisateur n'est pas une légende mais la
chose même : la vignette BOUGE (la même `pose(at:)` qui dessinera sur la scène),
plus un glyphe qui survit à ce que le mouvement ne dit pas — une capture
d'écran, un défilement rapide, « Réduire les animations ». Deux marques, un seul
prédicat (`animation != nil`), donc aucune règle à tenir d'accord.
