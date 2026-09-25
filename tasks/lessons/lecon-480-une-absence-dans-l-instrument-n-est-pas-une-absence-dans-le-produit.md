## Leçon 480 — Une absence dans l'INSTRUMENT n'est pas une absence dans le PRODUIT

**Deux faux positifs évités en une seule session de vérification (2026-09-03),
tous deux à un geste de devenir des issues contre du code JUSTE.**

### Cas 1 — « les cinq outils du composer ne sont pas accessibles »

`idb ui describe-all` sur le composer rend **8 éléments** : `Close`,
`Publication format`, la zone de texte, un **`Group "Document tools"`**,
`Audience`, `Publish`. Photos, Camera, Emoji, Background et File n'y figurent
pas. Conclusion tentante : le lecteur d'écran ne les atteint pas — défaut de
dimension 5.

**Faux.** `ComposerDocumentSurface.swift:626` pose
`.accessibilityElement(children: .contain)`, et chaque outil porte son propre
`accessibilityLabel` (ligne 678). `.contain` est *précisément* le modificateur
qui PRÉSERVE les enfants : VoiceOver entre dans le conteneur. Ce que la mesure
établit, c'est qu'`idb` **n'énumère pas** les enfants d'un conteneur `.contain`.

> **Discriminant** : avant de conclure d'un arbre d'accessibilité, vérifier que
> l'outil DESCEND. Ici il descendait ailleurs — sur le fil, les `Like` / `Repost`
> / `Save` imbriqués dans chaque carte étaient bien listés. C'est ce contraste
> qui rendait l'absence crédible, et c'est lui qu'il fallait interroger.

### Cas 2 — « redo est manquant dans l'éditeur d'objet »

L'écran ne montrait **qu'une** flèche d'historique, là où la directive porteur
demande « undo redo au même endroit ». Capture à l'appui.

**Faux.** Redo est ABSENT quand il n'y a rien à rétablir — la **loi 4**
correctement appliquée (*un contrôle sans effet est absent, jamais grisé*).
Après une action puis une annulation, **les deux flèches sont là**.

> **Discriminant** : un contrôle conditionnel ne se vérifie pas en REGARDANT,
> mais en **créant sa condition**. Agir, annuler, puis regarder. Sans ce geste,
> on fait corriger un comportement juste — et le « correctif » casserait la loi.

### Ce que les deux ont en commun

Dans les deux cas **l'outil a répondu correctement à une question VOISINE** de
celle que je posais :

| je demandais | l'instrument répondait |
|---|---|
| « ces contrôles sont-ils atteignables ? » | « ces contrôles sont-ils ÉNUMÉRÉS par `describe-all` ? » |
| « redo existe-t-il ? » | « redo est-il visible DANS CET ÉTAT ? » |

C'est la même racine que la 468 (les rouges qui ne mesurent rien) et la 475 (le
filtre qui ne trouve pas sa cible), vue depuis la vérification manuelle plutôt
que depuis le gate : **un instrument ne dit jamais « je ne sais pas » — il rend
une réponse parfaitement formée à la question qu'il a comprise.**

La parade n'est pas la prudence en général. C'est de poser, à côté de la valeur
cherchée, **une seconde grandeur que la bonne réponse contraint** : un contraste
qui prouve que l'outil sait descendre, une condition fabriquée qui prouve que le
contrôle sait paraître.

Voisine côté production, même semaine : une garde fermée sur des `rawValue`
alors que la moitié jumelle était un cas d'union, qui n'en a pas (#4960). *Une
garde qui contrôle une des deux déclarations jumelles ne garde pas la paire.*
