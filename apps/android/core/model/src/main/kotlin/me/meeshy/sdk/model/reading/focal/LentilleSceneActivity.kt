package me.meeshy.sdk.model.reading.focal

/**
 * Activité de la SCÈNE de la liste : le niveau (0 à 1) vaut 1 pendant le défilement et
 * [FocalMetrics.Scene.REST_DELAY_MS] après le dernier tick, 0 au repos. Il ne change que deux fois
 * par session de défilement, jamais par tick : la peau anime vers [targetLevel] en
 * [transitionDurationMs]. L'offset est une boîte inerte relue par frame, jamais publiée.
 * Miroir de `LentilleSceneActivity.swift`, sans horloge murale : l'instant est injecté.
 */
public object LentilleSceneActivity {

    public data class State(val lastScrollAtMs: Long? = null, val offset: Double = 0.0)

    /** Un tick de défilement : l'offset depuis le haut est noté, le compte à rebours d'aplatissement est réarmé. */
    public fun noteScroll(state: State, offset: Double, nowMs: Long): State =
        State(lastScrollAtMs = nowMs, offset = offset)

    /** Retour à plat immédiat (changement de mode, retour à l'écran). */
    public fun flatten(state: State): State = state.copy(lastScrollAtMs = null)

    public fun isActive(state: State, nowMs: Long): Boolean {
        val last = state.lastScrollAtMs ?: return false
        return nowMs - last < FocalMetrics.Scene.REST_DELAY_MS
    }

    /** Instant où la scène s'aplatit si rien ne bouge, null au repos. */
    public fun flattenAtMs(state: State): Long? = state.lastScrollAtMs?.plus(FocalMetrics.Scene.REST_DELAY_MS)

    public fun targetLevel(state: State, nowMs: Long): Double = if (isActive(state, nowMs)) 1.0 else 0.0

    /** Durée de l'animation vers [targetLevel] : entrée vive (0,25 s), aplatissement doux (0,45 s). */
    public fun transitionDurationMs(targetLevel: Double): Long =
        if (targetLevel >= 1.0) FocalMetrics.Scene.ENTER_DURATION_MS else FocalMetrics.Scene.FLATTEN_DURATION_MS

    /** Pose d'une rangée fondue vers l'identité : niveau 0 = identité (Script), 1 = la loi telle quelle. */
    public fun blend(result: FocalFocusCurve.Result, level: Double): FocalFocusCurve.Result {
        val clamped = level.coerceIn(0.0, 1.0)
        return FocalFocusCurve.Result(
            alpha = 1 - (1 - result.alpha) * clamped,
            scale = 1 - (1 - result.scale) * clamped,
        )
    }
}

/**
 * L'heure et les points de la liste ne paraissent qu'au défilement : au repos une rangée ne montre
 * ni l'heure ni les points ; un défilement les révèle, ils s'effacent [ScrollTimePillLaw.LINGER_MS]
 * après le dernier tick (fondu [FADE_DURATION_MS]). À l'ouverture, ils se montrent une fois, dès que
 * la première rangée est posée. Opacité seule : la place reste réservée. Miroir de `LentilleRowMetaReveal`.
 */
public object LentilleRowMetaReveal {

    public const val FADE_DURATION_MS: Long = 180

    public data class State(
        val scrollState: ScrollActivityState = ScrollTimePillLaw.initialState(),
        val openingArmed: Boolean = false,
    )

    public fun noteScroll(state: State, nowMs: Long): State =
        State(
            scrollState = ScrollTimePillLaw.reduce(state.scrollState, ScrollActivityEvent.Scrolled(nowMs.toDouble())),
            openingArmed = false,
        )

    /** La liste s'ouvre : la prochaine rangée posée révélera la méta une fois. */
    public fun armOpening(state: State): State = state.copy(openingArmed = true)

    /** Une rangée vient de se poser : la première après l'ouverture révèle. */
    public fun noteRowShown(state: State, nowMs: Long): State =
        if (state.openingArmed) noteScroll(state, nowMs) else state

    public fun isRevealed(state: State, nowMs: Long): Boolean =
        ScrollTimePillLaw.isVisible(state.scrollState, nowMs.toDouble())
}
