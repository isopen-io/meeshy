package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** Où se range l'identité d'un héros : au début sous la bannière, au centre, ou avatar et titre sur une même ligne (héros bas). */
public enum class MeeshyCollapsingHeroAlignment { Leading, Center, Compact }

@Immutable
public data class MeeshyCollapsingHeroValues(
    val height: Double,
    val bannerStretch: Double,
    val avatarSize: Double,
    val titleSize: Double,
    val subtitleSize: Double,
    val bannerOpacity: Double,
    val glassOpacity: Double,
    val controlsDiscOpacity: Double,
    val titleRise: Double,
    val controlSize: Double,
    val controlShift: Double,
    val barOwnsIdentity: Boolean,
    val isPinned: Boolean,
    val alignment: MeeshyCollapsingHeroAlignment,
)

/**
 * **La recette de K28 en valeurs** : un seul nombre, `progress`, de 0 à 1, mène la hauteur, l'avatar, le titre, la bannière et le
 * verre. Hauteur = déplié − (déplié − replié) × progress ; l'avatar et le titre finissent à 55 % ; la bannière s'efface de 0 à
 * 50 %, le verre apparaît de 50 à 100 % ; l'identité passe dans la barre au-delà de 50 %. Jumeau iOS : `MeeshyCollapsingHeroRecipe`.
 */
public object MeeshyCollapsingHeroRecipe {
    public const val EXPANDED_HEIGHT: Double = 318.0
    public const val COLLAPSED_HEIGHT: Double = 96.0
    public const val IDENTITY_OVERFLOW: Double = 132.0
    public const val FINISH_SHARE: Double = 0.55
    public const val HANDOVER_SHARE: Double = 0.5
    public const val DISC_FADE_SHARE: Double = 0.7
    public const val TITLE_RISE_END: Double = 0.7
    public const val AVATAR_EXPANDED: Double = 112.0
    public const val AVATAR_COLLAPSED: Double = 36.0
    public const val TITLE_EXPANDED: Double = 36.0
    public const val TITLE_COLLAPSED: Double = 17.0
    public const val SUBTITLE_EXPANDED: Double = 15.0
    public const val SUBTITLE_COLLAPSED: Double = 12.0
    public const val CONTROL_INSET_EXPANDED: Double = 16.0
    public const val CONTROL_INSET_COLLAPSED: Double = 12.0
    public const val BAR_CORNER_RADIUS: Double = 28.0
    public const val CONTROL_TARGET: Double = 44.0

    @Suppress("LongParameterList")
    public fun resolve(
        progress: Double,
        expandedHeight: Double = EXPANDED_HEIGHT,
        collapsedHeight: Double = COLLAPSED_HEIGHT,
        alignment: MeeshyCollapsingHeroAlignment = MeeshyCollapsingHeroAlignment.Leading,
        hasAvatar: Boolean = true,
        hasSubtitle: Boolean = true,
        overscroll: Double = 0.0,
    ): MeeshyCollapsingHeroValues {
        val raw = if (progress.isFinite()) progress else 0.0
        val share = clamp01(progress)
        val travel = minOf(share / FINISH_SHARE, 1.0)
        val distance = scrollDistance(expandedHeight, collapsedHeight)
        val pulled = maxOf(maxOf(if (overscroll.isFinite()) overscroll else 0.0, 0.0), if (raw < 0) -raw * distance else 0.0)
        return MeeshyCollapsingHeroValues(
            height = expandedHeight - (expandedHeight - collapsedHeight) * share,
            bannerStretch = pulled,
            avatarSize = if (hasAvatar) lerp(AVATAR_EXPANDED, AVATAR_COLLAPSED, travel) else 0.0,
            titleSize = lerp(TITLE_EXPANDED, TITLE_COLLAPSED, travel),
            subtitleSize = if (hasSubtitle) lerp(SUBTITLE_EXPANDED, SUBTITLE_COLLAPSED, travel) else 0.0,
            bannerOpacity = clamp01((1 - share) / HANDOVER_SHARE),
            glassOpacity = clamp01((share - HANDOVER_SHARE) / (1 - HANDOVER_SHARE)),
            controlsDiscOpacity = clamp01(1 - share / DISC_FADE_SHARE),
            titleRise = clamp01((share - HANDOVER_SHARE) / (TITLE_RISE_END - HANDOVER_SHARE)),
            controlSize = CONTROL_TARGET,
            controlShift = CONTROL_INSET_EXPANDED - lerp(CONTROL_INSET_EXPANDED, CONTROL_INSET_COLLAPSED, travel),
            barOwnsIdentity = share > HANDOVER_SHARE,
            isPinned = share >= 1.0,
            alignment = alignment,
        )
    }

    /** La distance de défilement : le héros déplié occupe 450 (318 + 132), la barre 96, d'où 354. */
    public fun scrollDistance(expandedHeight: Double = EXPANDED_HEIGHT, collapsedHeight: Double = COLLAPSED_HEIGHT): Double =
        expandedHeight + IDENTITY_OVERFLOW - collapsedHeight

    /** L'avancée du doigt ramenée en `progress` : le défilement divisé par la distance. */
    public fun progress(offset: Double, expandedHeight: Double = EXPANDED_HEIGHT, collapsedHeight: Double = COLLAPSED_HEIGHT): Double {
        if (!offset.isFinite()) return 0.0
        val distance = scrollDistance(expandedHeight, collapsedHeight)
        return if (distance > 0) offset / distance else 0.0
    }

    /** `progress` borné de 0 à 1 ; un non-nombre vaut 0. */
    public fun clamped(progress: Double): Double = clamp01(progress)

    private fun clamp01(value: Double): Double = if (value.isFinite()) value.coerceIn(0.0, 1.0) else 0.0

    private fun lerp(from: Double, to: Double, share: Double): Double = from + (to - from) * share
}
