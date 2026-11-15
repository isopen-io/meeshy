## Leçon 292 — un état posé à la RACINE d'un pager coûte à chaque page réalisée, et le prix ne se voit qu'après vingt swipes (2026-08-25, galerie média iOS)

La galerie plein écran d'une conversation (`ConversationMediaGalleryView`)
freezait au défilement, et — c'est le détail qui nomme la cause — **le
ralentissement s'AGGRAVAIT avec le nombre de médias traversés**. Une lenteur
constante accuse un rendu trop cher ; une lenteur qui CROÎT accuse quelque chose
qu'on accumule sans jamais le rendre.

Trois causes, toutes de la même famille : **de l'état vivant à la racine que
seule UNE page consomme.**

| état à la racine | qui le lit | ce qu'il coûtait |
|---|---|---|
| `scale` / `offset` (zoom, glissement) | la page VISIBLE, elle seule | réécrits à la fréquence d'affichage pendant un geste → invalidation racine → pager → **toutes** les pages réalisées, à chaque frame |
| `currentIndex` (`@State` + `firstIndex(where:)`) | l'habillage bas | une écriture d'état et un balayage linéaire par page traversée, pour une valeur DÉRIVABLE en O(1) |
| `.animation(value: showControls)` sur le `ZStack` racine | l'habillage | une transaction animée installée sur TOUT l'arbre à chaque bascule |

Et par-dessus, la propriété du `LazyHStack` que sa paresse fait oublier : **il
réalise à la demande mais ne libère JAMAIS**. Après vingt swipes, vingt images
plein format restaient décodées, vingt pages vidéo gardaient leurs trois
abonnements Combine — et chacune avait résolu sa disponibilité puis lancé son
auto-téléchargement au passage. Traverser une conversation de vingt vidéos en
téléchargeait vingt.

> **« Lazy » décrit quand une vue NAÎT, jamais quand elle MEURT.** La question à
> poser à tout conteneur paresseux n'est pas « combien de pages sont montées à
> l'écran ? » mais **« combien en restent vivantes après un parcours complet, et
> que fait chacune ? »**. La réponse par défaut est *toutes*, et *tout ce que sa
> `.task` fait*.

Les trois règles du correctif, dans l'ordre où elles portent :

1. **L'état de transformation appartient à la PAGE.** Un pincement ne peut alors
   plus invalider que sa propre page.
2. **Chaque page est `Equatable` et montée en `.equatable()`.** Sans quoi une
   réévaluation de la racine re-rend toutes les pages réalisées, fenêtre de
   rendu ou pas : la fenêtre borne le TRAVAIL, la comparaison borne les
   RÉVEILS, et aucune des deux ne remplace l'autre.
3. **Une fenêtre de rendu bornée** (`GalleryRenderWindow`, ±1) : au-delà, la
   page rend un aperçu et sa `.task` sort immédiatement. Le coût devient
   constant, quel que soit le nombre de médias.

Corollaire de vérification, et c'est là que la leçon se paie : **un
ralentissement ne se lit sur aucune valeur de retour.** Un `@State` remonté à la
racine par mégarde compile, s'exécute et se voit correct — la régression est
invisible à toute assertion de comportement. D'où l'extraction des deux règles
en types PURS (`GalleryRenderWindow`, `FilmstripMetrics`), testables pour ce
qu'elles décident, doublée d'une garde de source pour ce qui reste structurel
(« pas de `@State` de transformation dans la vue racine », « les deux types de
page sont montés en `.equatable()` », « la tâche de la page vidéo sort hors
fenêtre »). C'est la seule forme sous laquelle une propriété de coût peut
rougir.

### Et la géométrie d'une tête de lecture se DÉMONTRE

La pellicule ajoutée sous les détails de l'auteur pose une règle produit —
*le média le plus à DROITE est celui affiché en plein écran* — qui repose sur
une coïncidence arithmétique entre deux ancrages différents : le `viewAligned`
(qui aligne sur le bord de contenu de tête) et le `scrollPosition(anchor:
.trailing)` (qui lit le bord droit). Ils ne tombent sur la même grille que
parce que la marge de tête vaut `largeur − vignette − marge de queue`.

> **Une intention de mise en page qui repose sur une égalité arithmétique n'est
> pas une intention : c'est un théorème, et il se teste.** Retoucher une marge
> sans retoucher l'autre ferait diverger les deux ancrages d'un reste — la bande
> s'immobiliserait sur un média coupé, et « le plus à droite » deviendrait
> ambigu sans qu'aucune ligne ne change de sens. `FilmstripMetrics` rend cette
> égalité vérifiable à toute largeur de fenêtre et à tout nombre de médias, aux
> deux extrémités de la course.
