package me.meeshy.sdk.model.scene

/**
 * La bande verticale (repère canvas, pixels) dans laquelle vit le texte en cours de saisie : entre le bas du bouton
 * « Terminé » et le haut des outils ou du clavier — miroir de `StoryInlineEditZone` (iOS).
 */
public data class InlineEditZone(public val top: Float, public val bottom: Float) {
    /** Jamais négative : des bornes croisées ne donnent pas une hauteur absurde. */
    public val height: Float get() = maxOf(0f, bottom - top)
    public val midY: Float get() = (top + bottom) / 2f
}

/** Où se pose le bloc édité : son centre (repère canvas) et la hauteur qui en reste visible. */
public data class InlineEditPlacement(public val centerX: Float, public val centerY: Float, public val visibleHeight: Float)

/**
 * Pose le texte édité dans la bande libre, SANS jamais muter x, y ni rotation du modèle : c'est une projection d'affichage,
 * recalculée à chaque frappe. Le centre ne dépend pas de la hauteur du bloc (un texte neuf naît là où se tiendra un texte de
 * trois lignes, la première frappe ne déplace rien) ; la hauteur visible est bornée à celle de la bande.
 */
public object InlineEditLayout {
    /** Marge entre le texte édité et chacune des deux bornes de la bande (dp). */
    public const val FLOOR_GAP_DP: Float = 12f

    /** En deçà, la bande mesurée n'a pas de sens (clavier à moitié levé, bornes croisées) : repli sur le centre du canvas (dp). */
    public const val MIN_ZONE_HEIGHT_DP: Float = 44f

    /** Opacité du voile posé sur le reste du canvas pendant la saisie. */
    public const val SCRIM_ALPHA: Float = 0.45f

    /** Largeur maximale du champ, en fraction du canvas. */
    public const val MAX_WIDTH_FRACTION: Float = 0.88f

    /**
     * La bande libre. [topChromeBottom] : bas du bouton « Terminé » ; [toolsTop] : haut des outils ; [imeTop] : haut du clavier
     * (insets IME). Chaque borne absente est le bord du canvas ; la plus basse des bornes du bas gagne. `null` quand la bande
     * est trop étroite pour être crédible.
     */
    public fun zone(
        topChromeBottom: Float?,
        toolsTop: Float?,
        imeTop: Float?,
        canvasHeight: Float,
        gap: Float,
        minHeight: Float,
    ): InlineEditZone? {
        val ceiling = (topChromeBottom ?: 0f).coerceAtLeast(0f)
        val floor = listOfNotNull(toolsTop, imeTop, canvasHeight).minOf { it }.coerceAtMost(canvasHeight)
        val zone = InlineEditZone(top = ceiling + gap, bottom = floor - gap)
        return zone.takeIf { it.height >= minHeight }
    }

    public fun centerY(zone: InlineEditZone?, canvasMidY: Float): Float = zone?.midY ?: canvasMidY

    public fun blockHeight(natural: Float, zoneHeight: Float?): Float =
        if (zoneHeight == null) natural else minOf(natural, zoneHeight)

    public fun place(zone: InlineEditZone?, canvasWidth: Float, canvasHeight: Float, naturalHeight: Float): InlineEditPlacement =
        InlineEditPlacement(
            centerX = canvasWidth / 2f,
            centerY = centerY(zone, canvasHeight / 2f),
            visibleHeight = blockHeight(naturalHeight, zone?.height),
        )
}
