## Leçon 615 — Un témoin de DÉCODAGE qui fabrique son décodeur mesure la tolérance du RUNTIME

**Payée le 2026-09-15**, à l'intégration de #6578. Le lot rendait « Executed 16
tests, with 0 failures » dans son worktree ; sur `dev`, six de ces seize
tombaient — `dataCorrupted("Expected date string to be ISO8601-formatted")`.

Rien n'avait changé : les fichiers du lot et ceux de `dev` étaient **identiques**
(vérifié par `git diff` entre la branche et la fusion). Ce qui changeait était le
SIMULATEUR — le lot avait mesuré sur **iOS 26.1**, l'intégration sur **iOS 18.2**.

La cause : le témoin fabriquait son propre décodeur,

```swift
let decodeur = JSONDecoder()
decodeur.dateDecodingStrategy = .iso8601   // PLUS STRICT que la production
```

alors que la passerelle émet ses dates **avec fractions de seconde**
(`Date.toISOString()` → `…T10:00:00.000Z`), que `.iso8601` refuse. Le décodeur de
PRODUCTION (`APIClient.makeAPIPayloadDecoder()`) porte une stratégie `.custom`
qui les tolère — et il est `internal` plutôt que `private` **exactement pour que
les tests l'utilisent** : son doc-comment le dit en toutes lettres, comme celui
d'`APIMessage.init(from:)` (« la prod utilise une stratégie `.custom`, les tests
`.iso8601` »).

> **Un témoin qui reconstruit une pièce d'infrastructure ne teste plus le
> produit : il teste sa propre reconstruction.** Et quand cette pièce est plus
> STRICTE que la vraie, il ne rougit que là où le runtime est strict — donc il
> est vert sur la machine de son auteur et rouge chez le suivant.

Le geste : chercher si le dépôt EXPOSE déjà la pièce (un `internal` au lieu d'un
`private` est un aveu — quelqu'un l'a ouverte pour les tests), et l'appeler.

Corollaire de portée : le dépôt supporte **iOS 16→26**. Un témoin joué sur un
seul runtime ne dit rien des quinze autres — et le runtime le plus récent est le
plus permissif, donc le moins susceptible d'accuser. Voir
[[reference_a_green_on_both_sides_of_the_diff_measures_the_machine]].
