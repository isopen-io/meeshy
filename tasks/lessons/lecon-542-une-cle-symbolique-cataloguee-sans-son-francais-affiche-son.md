## Leçon 542 — Une clé SYMBOLIQUE cataloguée sans son français affiche son IDENTIFIANT

**2026-09-06, catalogue iOS (`apps/ios/Meeshy/Localizable.xcstrings`).**

Quatorze clés livrées dans la journée portaient un `defaultValue` français sans
entrée au catalogue. Trois gardes le disaient — leur texte français partait aux
**sept** locales : un lecteur arabophone lisait « Une grande, les autres à
côté ».

En les ajoutant, j'ai omis l'entrée `fr`, sur ce raisonnement :
*« `sourceLanguage` vaut `fr`, donc le français vient du `defaultValue` — une
entrée `fr` serait redondante »*. Un exemple du catalogue le confirmait : la
clé `%@` porte six locales, sans `fr`.

**Le raisonnement est juste pour une clé LITTÉRALE et faux pour une
SYMBOLIQUE.**

| forme | exemple | entrée `fr` ? |
|---|---|---|
| littérale — l'identifiant EST le français | `%@ Vues`, `%@ caractères` | inutile (381 clés dans ce cas) |
| symbolique — l'identifiant est un chemin | `composer.mosaic.hero` | **obligatoire** |

Dès qu'une clé symbolique EXISTE au catalogue, le `defaultValue` du code n'est
plus consulté pour la locale manquante : le système rend l'identifiant. L'app
affichait donc `composer.mosaic.hero` en français, et `"Slide 2 of 3"` là où le
test attendait `"Slide 2 sur 3"`.

> **Mon correctif était PIRE que le défaut qu'il corrigeait.** Avant : le
> français fuyait vers six locales étrangères. Après : le français lui-même
> était perdu, remplacé par un identifiant technique. C'est la forme
> [[reference_an_apparent_conformance_is_worse_than_an_absence]] appliquée au
> catalogue — une clé PRÉSENTE et vide bat une clé absente, dans le mauvais
> sens.

La distinction ne se voit **nulle part dans le code appelant** :
`String(localized:defaultValue:)` s'écrit pareil pour les deux formes. Elle
n'est nommée qu'à un seul endroit — le nom du test,
`test_noSymbolicKey_isCataloguedWithoutItsFrench`.

### Le corollaire de méthode, tombé dans le même quart d'heure

Mon balayage de contrôle annonçait **43 autres clés symboliques sans
français**. J'ai failli les « corriger ». Toutes fausses : elles portent leur
français sous `variations.plural` (`one` / `other`), pas sous `stringUnit`, et
mon détecteur ne lisait que le second.

> **Une absence rendue par un détecteur incomplet n'est pas une absence.**
> Avant d'agir sur ce qu'un balayage déclare MANQUANT, vérifier qu'il sait lire
> toutes les formes sous lesquelles la chose peut être présente — ici, deux
> (`stringUnit` et `variations`). Le même piège que la leçon 541 sous un autre
> angle : là, un comptage aveugle aux noms ; ici, un balayage aveugle à une
> forme.

**Règle de lot** (adoptée avec `v2-meeshy-dc`, dont les huit clés mosaïque
étaient concernées) : toute nouvelle `String(localized:defaultValue:)` reçoit
son entrée au catalogue, **dans les sept locales, dans le MÊME lot**. Et
`meeshy.sh test` complet avant commit — une suite ciblée (`-only-testing:`) ne
prouve que ce qu'on a pensé à interroger, alors qu'un cliquet surveille
précisément ce à quoi on ne pense pas.

**Placeholders** : `%1$d`/`%2$d` doivent survivre à la traduction — un ordinal
perdu inverse les deux nombres en arabe (« la slide 3 sur 2 »). Vérifier, pas
supposer.

---
