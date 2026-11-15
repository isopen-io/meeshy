package me.meeshy.ui.component.game

/** Les deux figures qui tiennent un écu, une coupe ou le revers d'une Meesh (identifiants de [MeeFilmCatalog]). */
public data class GameFigures(val meeFilmId: String, val meoFilmId: String) {
    public companion object {
        /** Mee qui sourit, Meo qui salue : la paire de la planche. */
        public val standard: GameFigures = GameFigures(MeeFilmCatalog.MEE_SOURIRE, MeeFilmCatalog.MEO_SALUT)
    }
}

/** Une boîte de figure en unités du dessin : centre et côté. */
public data class GameFigureSlot(val centerX: Float, val centerY: Float, val side: Float)

/** Une boîte de figure ramenée à la place offerte, en pixels. */
public data class GameFigureBox(val centerX: Float, val centerY: Float, val side: Float)

public data class GameTenantsPlacement(val mee: GameFigureBox, val meo: GameFigureBox, val meoMirrored: Boolean)

/** Géométrie pure des tenants : mise à l'échelle des boîtes du dessin, miroir de Meo, silence sous le blason. */
public object GameTenantsGeometry {
    /** Sous cette largeur (dp), la place est celle d'un blason : les tenants se taisent. */
    public const val MIN_WIDTH_DP: Float = 60f

    public fun hushed(widthDp: Float): Boolean = widthDp < MIN_WIDTH_DP

    /** `null` quand les tenants se taisent ou que la place ou le dessin sont dégénérés. */
    public fun place(
        widthDp: Float,
        widthPx: Float,
        viewBoxWidth: Float,
        mee: GameFigureSlot,
        meo: GameFigureSlot,
    ): GameTenantsPlacement? {
        if (hushed(widthDp) || widthPx <= 0f || viewBoxWidth <= 0f) return null
        val k = widthPx / viewBoxWidth
        fun scaled(slot: GameFigureSlot) = GameFigureBox(slot.centerX * k, slot.centerY * k, slot.side * k)
        return GameTenantsPlacement(mee = scaled(mee), meo = scaled(meo), meoMirrored = true)
    }
}
