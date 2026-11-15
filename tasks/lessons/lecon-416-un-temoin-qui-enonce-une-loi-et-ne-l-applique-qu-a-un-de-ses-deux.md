## Leçon 416 — Un témoin qui ÉNONCE une loi et ne l'applique qu'à un de ses deux arguments

`ComposerMentionStripContrastTests` (#4122, 2026-09-01) portait ce doc-comment :
« composition alpha AVANT la luminance — mesurer une couleur translucide sans la
composer sur son fond rend un ratio qui n'existe nulle part à l'écran ». Il
composait scrupuleusement la CAPSULE… et mesurait le TEXTE brut.

Or `textMuted(isDark:)` vaut `indigo300.opacity(0.7)` et `textSecondary(isDark:)`
vaut `indigo300` — **mêmes composantes RVB**. `contrastRatio` passant par
`.luminance`, qui ignore l'alpha, les deux tokens rendaient le MÊME chiffre : le
témoin mesurait `textSecondary` en croyant mesurer `textMuted`, concluait que le
token discret tenait AA (6,65:1), et **contredisait le commentaire JUSTE du code
de production** qui annonçait 4,01:1. Vérifié par calcul WCAG hors Swift : la
production avait raison, le témoin avait tort.

> Une loi écrite dans un fichier ne s'applique pas d'elle-même aux deux côtés
> d'une comparaison. Ce qui manquait n'était pas la connaissance — elle était
> dix lignes plus haut — c'était son application au SECOND argument.

Correctif : la composition devient une fonction unique (`ratioRendu(_:sur:)`)
qui aplatit le texte avec SON PROPRE alpha ; opaque ⇒ identique à la mesure
directe, donc sûre pour tous les témoins. Plus un témoin qui garde la loi
elle-même — sans lui, remplacer `ratioRendu` par un appel direct laisserait
trois témoins VERTS (tokens opaques) et n'en ferait rougir qu'un, sans dire
pourquoi.

Voisines : leçon 275 (« qu'est-ce qui part À CÔTÉ »), et
`reference_a_deduced_value_is_not_a_read_value` — ici l'inverse instructif :
c'est la valeur MESURÉE qui était fausse, parce que la mesure était mal cadrée.
