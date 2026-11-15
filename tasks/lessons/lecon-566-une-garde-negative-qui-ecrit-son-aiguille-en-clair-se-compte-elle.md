## Leçon 566 — Une garde négative qui écrit son aiguille en clair se compte elle-même, et ne peut JAMAIS être verte

2026-09-11, SDK (#6057). J'ai remplacé neuf `Task.sleep` fixes par des
attentes sur condition, puis posé le témoin négatif qui interdit leur retour :

```swift
let sommeils = source.components(separatedBy: "try await Task.sleep").count - 1
XCTAssertEqual(sommeils, 0, "Un `try await Task.sleep` est réapparu…")
```

Verdict au premier run : **9 tests, 1 échec** — le mien. L'aiguille apparaît
TROIS fois dans le fichier qu'elle inspecte : le littéral de recherche, le
message d'échec, et le doc-comment qui explique la règle. Une garde qui lit
son propre fichier inclut sa propre définition.

> **Avant d'écrire une garde qui cherche une chaîne dans un fichier, demander
> si ce fichier est dans sa propre portée.** Si oui, l'aiguille doit être
> ASSEMBLÉE (`"try await " + "Task" + ".sleep"`) ou le fichier dépouillé de ses
> commentaires — sinon le témoin ne mesure plus le code, il mesure sa propre
> prose.

Le dépôt avait déjà payé la moitié de cette leçon par l'autre bout : le
cliquet des couleurs (#5883) comptait `Color(hex:` TEXTUELLEMENT et a rougi le
jour où un commit a ajouté la phrase qui justifiait sa propre correction —
« un garde qui punit la phrase qui le justifie apprend aux gens à ne plus
écrire la phrase ». Sa parade fut `stripComments`. La mienne est l'assemblage,
faute d'un dépouilleur dans cette cible de test (`ComposerSourceGuard` vit dans
`MeeshyUITests`, pas dans `MeeshySDKTests`).

**Ce qui a rendu le défaut visible tout de suite est une habitude, pas une
intuition** : le script de validation compile PUIS exécute, et le compte de
tests imprimé est passé de 8 à 9 — donc le témoin neuf tournait bien — avec
« 1 failure ». Sans cette ligne de compte, j'aurais pu lire « 1 échec » comme
un flake du lot que je venais de corriger.

Voisine de la 564 (« un rouge qui nomme un chemin déformé mesure la MACHINE »)
par sa forme : dans les deux cas, le rouge ne parle pas du code qu'on croit
mesurer. Ici il parle de la garde ; là, de l'atelier.
