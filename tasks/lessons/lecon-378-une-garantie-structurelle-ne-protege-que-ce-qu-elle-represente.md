## Leçon 378 — Une garantie STRUCTURELLE ne protège que ce qu'elle REPRÉSENTE

**Contexte (2026-09-01, #4632).** Le porteur signale que l'ajout d'un son depuis
un fichier « ne semble pas fonctionner ». Mesure : le bouton « Fichiers » de la
feuille du son est **inerte**. Il pose `showsFileImporter = true` en laissant
`presentedPortal = .sound` monté ; les deux présentations vivent sur le même
corps de vue, et iOS n'en honore pas une seconde depuis un présentateur occupé.
Aucun crash, aucune trace, rien à l'écran.

Le composer avait pourtant réglé ce problème un mois plus tôt. `ComposerPortal?`
(#4467) a rendu **deux feuilles simultanées non représentables** : une variable
ne porte qu'une valeur, et ouvrir la seconde ferme la première. Le doc-comment du
type dit, mot pour mot : « Rien à retenir, rien à vérifier en revue : l'état
invalide n'est plus représentable. »

C'était vrai — **pour les feuilles**. Un `.fileImporter` n'est pas une valeur de
`ComposerPortal` ; il échappe donc au type, et avec lui à sa preuve.

Ce qui a rendu le défaut invisible est la **ressemblance des deux branches** :

```swift
case .library: presentedPortal = .soundLibrary   // remplace : protégé par le type
case .files:   showsFileImporter = true          // ajoute  : rien ne le protège
```

Elles se lisent comme deux variantes du même geste. Elles empruntent deux
mécanismes de présentation différents, dont **un seul** est couvert par
l'invariant, et la relecture ne le voit pas parce que l'invariant ne se relit
pas — on lui fait confiance.

> **La question à poser à une garantie structurelle n'est pas « tient-elle ? »
> mais « quel est l'ENSEMBLE de ses valeurs, et qu'est-ce qui vit à côté ? ».**
> Un type somme qui interdit deux A concurrents ne dit rien d'un A et d'un B.
> Le jour où B arrive, il arrive sans bruit : il ne fait rougir aucun `switch`
> exhaustif, puisqu'il n'est pas un cas.

**Le correctif nomme le mécanisme** plutôt que de patcher le site :
`ComposerSoundHandoff` rend, par provenance, `portal` / `systemImporterAfterDismiss`
/ `sheetSurface`. Une quatrième provenance ne compile pas sans dire par quelle
présentation elle passe — ce que le type somme des feuilles ne pouvait pas
demander.

Corollaire mesuré dans le même lot : **le second défaut ne se voyait pas parce
que le premier tenait la porte fermée.** L'ingestion versait tout dans la liste
média du DOCUMENT ; un audio n'y devenait jamais un son de scène. Quand un
contrôle est inerte, ce qu'il aurait fait n'est jamais testé — corriger la
présentation sans relire la destination aurait livré un bouton qui s'ouvre et se
trompe.

Voir [[reference_inert_control_vs_unfed_feature]].

---
