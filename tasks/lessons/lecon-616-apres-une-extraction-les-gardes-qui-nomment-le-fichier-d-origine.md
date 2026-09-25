## Leçon 616 — Après une EXTRACTION, les gardes qui NOMMENT le fichier d'origine tombent

Même journée, même intégration. L'extraction de `CommentRowView` hors de
`FeedCommentsSheet.swift` (2 519 → 2 127 lignes, pour respecter le budget) a fait
rougir **deux** gardes qu'aucun témoin du lot ne jouait :

| garde | ce qu'elle exigeait | pourquoi elle tombe |
|---|---|---|
| `CommentMediaGalleryWiringGuardTests` | `carrierText: comment.displayContent` dans `FeedCommentsSheet.swift` | la ligne est partie avec la vue |
| `SheetEnvironmentObjectGuardTests` | le type `CommentRowView` DÉCLARÉ dans `FeedCommentsSheet.swift` | le type est parti avec la vue |

Aucune des deux ne mesure un comportement de l'extraction : elles tiennent un
INVENTAIRE indexé par **fichier**, quand le risque qu'elles gardent voyage avec
le **type**.

> **Une extraction ne change rien au comportement et fait pourtant rougir tout ce
> qui indexe par fichier.** Avant d'extraire, `grep` le nom du fichier d'origine
> ET le nom du type déplacé dans les témoins : ce que la recherche rend est la
> liste exacte des gardes à faire suivre, et elle se fait DANS le commit
> d'extraction.

Le correctif juste n'est pas de rapatrier le code : c'est d'apprendre à la garde
que la règle a deux étages (l'hôte déclare la galerie, la ligne passe la
légende), ou de la faire suivre le TYPE. Une garde qui force à re-fusionner ce
qu'un budget vient de séparer travaille contre la directive qu'elle sert.

Prolonge [[reference_inventory_guards_are_the_ones_parallel_lots_never_play]] :
la leçon 614 disait QUI ne les joue pas ; celle-ci dit QUAND elles tombent.
