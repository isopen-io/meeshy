package me.meeshy.sdk.model.chrome

/**
 * La réserve LATÉRALE des disques flottants (#12497, #13299) : un disque parqué contre un bord, à mi-hauteur,
 * recouvre l'avatar, l'heure, la vignette ou l'interrupteur de la rangée qui passe à sa hauteur — la marge de fin de
 * contenu ([FloatingChromeReserve]) ne couvre que le BAS de la liste. Chaque rangée dont la bande verticale touche celle d'un
 * disque cède, de CE côté, la largeur du disque (du bord de l'écran au-delà du disque, plus un peu d'air) ; les disques
 * restent visibles et touchables, le contenu s'écarte.
 *
 * Toutes les mesures sont en dp, dans le repère de la fenêtre ; les côtés sont LOGIQUES (début / fin), comme le
 * placement des disques (`Modifier.offset`, miroité en RTL).
 */
public object FloatingChromeLateralReserve {

    /** Air laissé entre le disque et le contenu, en dp (le même que la réserve de fin). */
    public const val CLEARANCE: Float = FloatingChromeReserve.CLEARANCE

    /**
     * [reach] : largeur à céder, du bord de [side] jusqu'au contenu, air compris ; [top]/[bottom] : la hauteur du disque
     * SANS air — une rangée voisine qui ne passe pas sous le disque garde toute sa largeur (recette S8, titre réduit à « me… »).
     */
    public data class Band(val side: FloatingButtonSide, val top: Float, val bottom: Float, val reach: Float)

    public data class Insets(val leading: Float, val trailing: Float) {
        public companion object {
            public val None: Insets = Insets(0f, 0f)
        }
    }

    public fun bands(layout: FloatingButtonsLayout, screenWidth: Float): List<Band> {
        if (screenWidth <= 0f) return emptyList()
        val half = FloatingButtonGeometry.BUTTON_SIZE / 2f
        return listOf(layout.feed, layout.menu).map { disc ->
            val leading = disc.x < screenWidth / 2f
            Band(
                side = if (leading) FloatingButtonSide.LEADING else FloatingButtonSide.TRAILING,
                top = disc.y - half,
                bottom = disc.y + half,
                reach = if (leading) disc.x + half + CLEARANCE else screenWidth - (disc.x - half) + CLEARANCE,
            )
        }
    }

    /**
     * Largeur de contenu en deçà de laquelle une rangée ne cède plus les DEUX côtés à la fois : deux disques à la même
     * hauteur réduisaient le texte d'une notification à une colonne de syllabes (recette S8 #12497), et le texte, en
     * s'enroulant, allongeait la rangée qui touchait alors davantage les disques.
     */
    public const val MIN_CONTENT_WIDTH: Float = 260f

    /**
     * La marge que cède une rangée de hauteur [rowTop]…[rowBottom]. [startGap] / [endGap] : ce qui sépare déjà la
     * rangée du bord de l'écran de chaque côté (une rangée posée dans une carte en retrait ne cède que le complément).
     * Quand céder les deux côtés laisserait moins de [MIN_CONTENT_WIDTH] à une rangée de largeur [rowWidth], seul cède
     * le côté dont le disque touche la rangée le plus HAUT — la ligne de l'avatar, du titre et de l'heure ; ce choix ne
     * dépend que du haut de la rangée et des disques, jamais de sa hauteur, que la marge elle-même fait varier.
     */
    public fun insets(
        bands: List<Band>,
        rowTop: Float,
        rowBottom: Float,
        startGap: Float = 0f,
        endGap: Float = 0f,
        rowWidth: Float = Float.POSITIVE_INFINITY,
    ): Insets {
        val touching = bands.filter { it.top < rowBottom && it.bottom > rowTop }
        fun side(side: FloatingButtonSide) = touching.filter { it.side == side }
        fun reach(side: FloatingButtonSide, gap: Float): Float =
            ((side(side).maxOfOrNull { it.reach } ?: 0f) - gap.coerceAtLeast(0f)).coerceAtLeast(0f)
        val leading = reach(FloatingButtonSide.LEADING, startGap)
        val trailing = reach(FloatingButtonSide.TRAILING, endGap)
        if (leading == 0f || trailing == 0f || rowWidth - leading - trailing >= MIN_CONTENT_WIDTH) {
            return Insets(leading = leading, trailing = trailing)
        }
        fun firstContact(side: FloatingButtonSide): Float = side(side).minOf { maxOf(it.top, rowTop) }
        return if (firstContact(FloatingButtonSide.LEADING) < firstContact(FloatingButtonSide.TRAILING)) {
            Insets(leading = leading, trailing = 0f)
        } else {
            Insets(leading = 0f, trailing = trailing)
        }
    }
}
