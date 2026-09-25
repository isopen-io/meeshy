## Leçon 344 — une garde négative posée sur un FICHIER attrape les jumelles innocentes de ce qu'elle vise

**Le fait.** Six titres d'action du SDK étaient des littéraux français en dur ; je les ai fait passer par le
catalogue, et j'ai écrit la garde qui interdit leur retour :

```swift
for interdit in ["case.edit:return\"", "case.duplicate:return\"", …] {
    XCTAssertFalse(compact(sourceDuFichier).contains(interdit))
}
```

Elle était **rouge en permanence**, sur le code corrigé comme sur l'ancien. La cause tient en une ligne :
`systemImage`, la propriété calculée VOISINE, rend `case .edit: return "pencil"` — un nom de symbole SF,
parfaitement légitime, et de la **même forme syntaxique** que l'interdit.

> **Un interdit de forme se cherche dans une PORTÉE, jamais dans un fichier.** Deux propriétés voisines
> peuvent avoir la même syntaxe et des sens opposés : l'une rend des mots à traduire, l'autre des
> identifiants système qu'il serait faux de traduire. Le fichier ne les distingue pas ; la déclaration,
> si.

**Ce que le cadrage a rendu possible, en plus de la justesse.** Une fois la garde bornée au corps de
`title`, un SECOND témoin devient écrivable et utile : `systemImage` **doit** continuer de rendre des
littéraux, et rien ne le protégeait d'une « correction » par excès de zèle par la personne suivante qui
lirait la première garde. Deux gardes opposées sur deux voisines — l'une interdit le littéral, l'autre
l'exige — ne sont écrivables que si chacune sait où elle s'applique.

**Le témoin du témoin.** Le cadrage introduit son propre mode d'extinction : si l'ancre (`public var
title: String`) est renommée, `corpsDe` rend `nil` et la garde passe au vert en n'ayant rien lu. D'où
l'assertion positive AVANT les négatives — « le corps lu contient bien `story.canvas.action.edit` » —
qui est le fusible de la portée elle-même. Une garde de portée sans fusible de portée est une garde qui
s'éteint au premier renommage.

**Comment je l'ai vue.** Pas en relisant la garde : en la rejouant sur l'état AVANT et l'état APRÈS, et
en constatant `6/6` des deux côtés. **Une garde négative qui rend le même verdict sur les deux états ne
mesure pas ce qu'elle prétend** — qu'elle soit verte des deux côtés (née morte, leçon des gardes
positives) ou rouge des deux côtés (mal cadrée). Le test d'une garde n'est pas son verdict, c'est
l'ÉCART entre ses deux verdicts.

Voir la leçon 335 (le commentaire qui explique une absence) et la 336 (l'extraction qui perd une
capacité) : trois formes du même angle mort, où ce qui est écrit à côté de la chose corrigée décide de
la validité du correctif.
