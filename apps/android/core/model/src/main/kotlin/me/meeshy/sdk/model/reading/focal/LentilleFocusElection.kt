package me.meeshy.sdk.model.reading.focal

import kotlin.math.abs

/**
 * Bande de focus de la liste Lentille : le seul endroit qui sait OÙ elle se trouve. Le centre de
 * la région visible, sauf près du haut de la liste où la bande remonte au bord haut au repos et
 * descend linéairement jusqu'au centre sur la première demi-hauteur de défilement. L'élection et la
 * perspective des rangées lisent cette même bande : une carte élue là où la perspective ne pique
 * pas serait une incohérence visible. Miroir de `LentilleFocusBand` (`LentillePerspective.swift`).
 */
public object LentilleFocusBand {

    /** Distance parcourue depuis le haut, positive en descendant (le relais publie un offset négatif). */
    public fun offsetFromTop(relayOffset: Double): Double = -relayOffset

    public fun centerY(viewportTop: Double, viewportBottom: Double, offsetFromTop: Double): Double {
        val center = (viewportTop + viewportBottom) / 2
        val travel = center - viewportTop
        if (travel <= 0) return center
        val t = (offsetFromTop / travel).coerceIn(0.0, 1.0)
        return viewportTop + travel * t
    }
}

/**
 * Élection de la focus card de la liste : la loi partagée désigne le gagnant
 * ([FocalFocusCurve.electFocusRow], hystérésis de la demi-bande), puis une zone morte refuse tout
 * changement d'élu qui ne rapporte pas une demi-rangée. Sans elle, au pas réel de la liste
 * (rangée 84 + espacement 6 = 90 = deux demi-bandes) la bascule avant et la bascule arrière tombent
 * au même point et la magnification saute d'une rangée à sa voisine à chaque tremblement.
 *
 * Fonctions pures : la carte suit le défilement, jamais les événements. Miroir de
 * `LentilleFocusElectionHost.elect` / `holdingCurrent`.
 */
public object LentilleFocusElection {

    /** `LentilleMetrics.Row.height` : hauteur d'une rangée de la liste. */
    public const val ROW_HEIGHT: Double = 84.0

    /** Avance qu'une rangée doit prendre sur l'élu, en distance au foyer, pour le détrôner. */
    public const val SWITCH_MARGIN: Double = ROW_HEIGHT / 2

    public fun elect(
        candidates: List<FocalFocusCurve.RowCandidate>,
        viewportTop: Double,
        viewportBottom: Double,
        offsetFromTop: Double,
        currentId: String?,
    ): String? {
        val focusY = LentilleFocusBand.centerY(viewportTop, viewportBottom, offsetFromTop)
        val lawWinner = FocalFocusCurve.electFocusRow(
            candidates = candidates,
            focusY = focusY,
            currentId = currentId,
            hysteresis = FocalFocusCurve.FOCUS_BAND_HALF_HEIGHT,
        )
        return holdingCurrent(lawWinner, currentId, candidates, focusY)
    }

    /**
     * Garde le courant si le gagnant de la loi n'est pas plus proche du foyer que lui d'au moins
     * [margin]. Un courant sorti des candidats ou l'absence de courant laissent la loi décider.
     */
    public fun holdingCurrent(
        lawWinner: String?,
        currentId: String?,
        candidates: List<FocalFocusCurve.RowCandidate>,
        focusY: Double,
        margin: Double = SWITCH_MARGIN,
    ): String? {
        if (lawWinner == null || currentId == null || lawWinner == currentId) return lawWinner
        val current = candidates.firstOrNull { it.id == currentId } ?: return lawWinner
        val challenger = candidates.firstOrNull { it.id == lawWinner } ?: return lawWinner
        val gain = abs(current.midY - focusY) - abs(challenger.midY - focusY)
        return if (gain < margin) currentId else lawWinner
    }
}

/**
 * Perspective de liste (Lentille) : pour chaque rang visible, la distance à la bande puis
 * l'opacité et l'échelle de la loi `list`, fondues vers l'identité selon le niveau de scène.
 * Jamais une hauteur ni une police. Reduce motion : identité.
 */
public object LentillePerspective {

    /** Pivot du zoom (`transform-origin` du rang) : près de l'avatar, pas autour du milieu. */
    public const val TRANSFORM_ORIGIN_X: Double = 0.16
    public const val TRANSFORM_ORIGIN_Y: Double = 0.5

    /** Distance d'un rang à la bande, positive au-dessus de la bande. */
    public fun distance(rowMidY: Double, viewportTop: Double, viewportBottom: Double, offsetFromTop: Double): Double =
        LentilleFocusBand.centerY(viewportTop, viewportBottom, offsetFromTop) - rowMidY

    /** Loi `list` sur la distance ABSOLUE (la bande est au centre : pas de fondu sous la bande). */
    public fun pass(distance: Double, level: Double, reduceMotion: Boolean): FocalFocusCurve.Result {
        if (reduceMotion) return FocalFocusCurve.Result.IDENTITY
        return LentilleSceneActivity.blend(
            FocalFocusCurve.focusCurve(abs(distance), FocalFocusCurve.Variant.LIST),
            level,
        )
    }
}
