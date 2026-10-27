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

    /** [reach] : largeur à céder, du bord de [side] jusqu'au contenu ; [top]/[bottom] : la hauteur du disque, air compris. */
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
                top = disc.y - half - CLEARANCE,
                bottom = disc.y + half + CLEARANCE,
                reach = if (leading) disc.x + half + CLEARANCE else screenWidth - (disc.x - half) + CLEARANCE,
            )
        }
    }

    /**
     * La marge que cède une rangée de hauteur [rowTop]…[rowBottom]. [startGap] / [endGap] : ce qui sépare déjà la
     * rangée du bord de l'écran de chaque côté (une rangée posée dans une carte en retrait ne cède que le complément).
     */
    public fun insets(
        bands: List<Band>,
        rowTop: Float,
        rowBottom: Float,
        startGap: Float = 0f,
        endGap: Float = 0f,
    ): Insets {
        val touching = bands.filter { it.top < rowBottom && it.bottom > rowTop }
        fun reach(side: FloatingButtonSide, gap: Float): Float =
            ((touching.filter { it.side == side }.maxOfOrNull { it.reach } ?: 0f) - gap.coerceAtLeast(0f)).coerceAtLeast(0f)
        return Insets(
            leading = reach(FloatingButtonSide.LEADING, startGap),
            trailing = reach(FloatingButtonSide.TRAILING, endGap),
        )
    }
}
