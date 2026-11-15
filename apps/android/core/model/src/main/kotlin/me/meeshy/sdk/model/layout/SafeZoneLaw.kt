package me.meeshy.sdk.model.layout

/** Marges par bord, en dp, dans le repere de la fenetre (left/right physiques, pas start/end). */
data class EdgeInsetsDp(
    val left: Float = 0f,
    val top: Float = 0f,
    val right: Float = 0f,
    val bottom: Float = 0f,
) {
    companion object {
        val Zero: EdgeInsetsDp = EdgeInsetsDp()
    }
}

/** Rectangle en dp dans le repere de la fenetre (origine en haut a gauche). */
data class RectDp(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
) {
    val width: Float get() = right - left
    val height: Float get() = bottom - top
    val centerX: Float get() = (left + right) / 2f
    val centerY: Float get() = (top + bottom) / 2f
}

/** Point en dp dans le repere de la fenetre. */
data class PointDp(val x: Float, val y: Float)

/**
 * Zone sure de la fenetre et geometrie de la decoupe camera.
 *
 * Zone sure = barres systeme UNION decoupe, bord par bord ; le clavier n'y entre jamais (un
 * element ancre a la zone sure ne saute pas quand le clavier s'ouvre — miroir de
 * `sceneSafeAreaInsets`, « clavier exclu », SceneWindowSize.swift).
 *
 * Decoupe : miroir de `IslandGeometry.swift`. Une banniere in-app nait au centre de la decoupe du
 * haut et se pose avec [CUTOUT_CLEARANCE_DP] d'air sous elle (« SANS Y ETRE COLLE ») ; sans
 * decoupe, elle nait au centre de la marge haute.
 */
object SafeZoneLaw {
    /** Air minimal entre le bas de la decoupe et le haut d'un element pose dessous. */
    const val CUTOUT_CLEARANCE_DP: Float = 12f

    fun insets(systemBars: EdgeInsetsDp, cutout: EdgeInsetsDp): EdgeInsetsDp = EdgeInsetsDp(
        left = maxOf(systemBars.left, cutout.left, 0f),
        top = maxOf(systemBars.top, cutout.top, 0f),
        right = maxOf(systemBars.right, cutout.right, 0f),
        bottom = maxOf(systemBars.bottom, cutout.bottom, 0f),
    )

    /** La fenetre moins ses marges ; des marges plus grandes que la fenetre donnent un rectangle vide, jamais inverse. */
    fun safeRect(windowWidthDp: Float, windowHeightDp: Float, insets: EdgeInsetsDp): RectDp {
        val width = windowWidthDp.coerceAtLeast(0f)
        val height = windowHeightDp.coerceAtLeast(0f)
        val left = insets.left.coerceIn(0f, width)
        val top = insets.top.coerceIn(0f, height)
        val right = (width - insets.right.coerceAtLeast(0f)).coerceAtLeast(left)
        val bottom = (height - insets.bottom.coerceAtLeast(0f)).coerceAtLeast(top)
        return RectDp(left = left, top = top, right = right, bottom = bottom)
    }

    /**
     * Centre vertical d'un element de demi-hauteur [halfHeight] ramene dans [zone]. Un element plus
     * haut que la zone s'epingle a son haut.
     */
    fun clampCenterY(centerY: Float, halfHeight: Float, zone: RectDp): Float {
        val low = zone.top + halfHeight
        val high = maxOf(low, zone.bottom - halfHeight)
        return centerY.coerceIn(low, high)
    }

    /**
     * La decoupe du bord haut, la plus proche du centre horizontal ; `null` sans decoupe en haut.
     *
     * Une decoupe appartient au bord haut quand elle en est plus proche que des bords gauche et
     * droit : un poincon flotte souvent a quelques dp du bord (comme l'ilot iOS, centre dans la
     * marge haute), il ne le touche pas forcement. Une decoupe laterale (paysage) ou basse n'en est pas.
     */
    fun topCutout(cutouts: List<RectDp>, windowWidthDp: Float): RectDp? {
        val middle = windowWidthDp / 2f
        return cutouts
            .filter { it.bottom > it.top && it.top <= minOf(it.left, windowWidthDp - it.right) }
            .minByOrNull { kotlin.math.abs(it.centerX - middle) }
    }

    /**
     * Ordonnee (depuis le haut de la fenetre) ou se pose une banniere : au moins [minimumDp] sous la
     * marge haute, et au moins [CUTOUT_CLEARANCE_DP] sous la decoupe du haut. Miroir de
     * `IslandGeometry.settledTopPadding` exprime depuis le haut de la fenetre.
     */
    fun bannerTop(cutouts: List<RectDp>, windowWidthDp: Float, safeTopDp: Float, minimumDp: Float): Float {
        val underSafeTop = safeTopDp.coerceAtLeast(0f) + minimumDp
        val cutout = topCutout(cutouts, windowWidthDp) ?: return underSafeTop
        return maxOf(underSafeTop, cutout.bottom + CUTOUT_CLEARANCE_DP)
    }

    /** Point d'ou nait (et ou revient) une banniere : le centre de la decoupe du haut, sinon le centre de la marge haute. */
    fun bannerEmergence(cutouts: List<RectDp>, windowWidthDp: Float, safeTopDp: Float): PointDp {
        val cutout = topCutout(cutouts, windowWidthDp)
            ?: return PointDp(x = windowWidthDp / 2f, y = safeTopDp.coerceAtLeast(0f) / 2f)
        return PointDp(x = cutout.centerX, y = cutout.centerY)
    }
}
