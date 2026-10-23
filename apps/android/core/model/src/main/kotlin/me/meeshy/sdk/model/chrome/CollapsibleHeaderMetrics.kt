package me.meeshy.sdk.model.chrome

/**
 * Courbes et constantes de l'en-tete repliable, en dp / sp (Float). Miroir de
 * `CollapsibleHeaderMetrics` et de `CollapsibleHeader` (packages/MeeshySDK/.../Navigation).
 *
 * Convention iOS conservee : le decalage de defilement est NEGATIF quand la liste a defile
 * (`-offset / 60`).
 */
object CollapsibleHeaderMetrics {
    const val EXPANDED_HEIGHT = 64f
    const val COLLAPSED_HEIGHT = 44f
    const val COLLAPSE_THRESHOLD = 60f
    const val BAR_HORIZONTAL_PADDING = 12f
    const val ROUND_CHROME_EDGE_GUTTER = 28f
    const val TRAILING_ACTIONS_INSET = ROUND_CHROME_EDGE_GUTTER - BAR_HORIZONTAL_PADDING
    const val LEADING_BACK_INSET = TRAILING_ACTIONS_INSET
    const val ROUND_CHROME_DIAMETER = 40f
    const val ACTION_TARGET = 48f
    const val TITLE_ACTIONS_GAP = 8f
    const val INLINE_ACCESSORY_REVEAL_START = 78f
    const val INLINE_ACCESSORY_REVEAL_END = 148f
    const val INLINE_ACCESSORY_HEIGHT = 48f
    const val ACCESSORY_COLLAPSED_HEIGHT = 60f
    const val ACCESSORY_TRAILING_CLEARANCE = 2 * ACTION_TARGET + ROUND_CHROME_EDGE_GUTTER
    const val CENTER_REVEAL_START = 0.6f
    const val CENTER_REVEAL_HEIGHT_FACTOR = 1.3f
    const val SUBTITLE_SWITCH = 0.7f

    private fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t

    fun progress(scrollOffsetDp: Float): Float = (-scrollOffsetDp / COLLAPSE_THRESHOLD).coerceIn(0f, 1f)

    fun titleSizeSp(progress: Float): Float = lerp(24f, 17f, progress)

    fun isTitleBold(progress: Float): Boolean = progress < 0.5f

    fun titleBottomPaddingDp(progress: Float): Float = lerp(6f, 0f, progress)

    fun backArrowSizeDp(progress: Float): Float = lerp(18f, 16f, progress)

    fun leadingScale(progress: Float): Float = lerp(1f, 0.8f, progress)

    fun titleViewScale(progress: Float): Float = lerp(1f, 0.65f, progress)

    fun showExpandedSubtitle(progress: Float): Boolean = progress < SUBTITLE_SWITCH

    fun showCollapsedSubtitle(progress: Float): Boolean = progress > SUBTITLE_SWITCH

    fun expandedSubtitleSizeSp(progress: Float): Float = lerp(15f, 12f, progress)

    fun expandedSubtitleAlpha(progress: Float): Float = (1f - minOf(1f, progress / 0.6f)).coerceIn(0f, 1f)

    fun collapsedSubtitleAlpha(progress: Float): Float =
        ((progress - SUBTITLE_SWITCH) / (1f - SUBTITLE_SWITCH)).coerceAtLeast(0f).coerceAtMost(1f)

    fun revealOpacity(progress: Float): Float =
        if (progress > CENTER_REVEAL_START) minOf(1f, (progress - CENTER_REVEAL_START) / (1f - CENTER_REVEAL_START)) else 0f

    fun revealOffsetDp(progress: Float): Float = lerp(6f, 0f, revealOpacity(progress))

    fun pinnedAccessoryReveal(scrollOffsetDp: Float, start: Float, end: Float): Float {
        val scrolled = -scrollOffsetDp
        if (end <= start) return if (scrolled >= end) 1f else 0f
        return ((scrolled - start) / (end - start)).coerceIn(0f, 1f)
    }

    fun inlineAccessoryReveal(scrollOffsetDp: Float): Float =
        pinnedAccessoryReveal(scrollOffsetDp, INLINE_ACCESSORY_REVEAL_START, INLINE_ACCESSORY_REVEAL_END)

    fun effectiveCollapsedHeight(hasCenterReveal: Boolean, hasTitleAccessory: Boolean, inlineReveal: Float): Float = when {
        hasCenterReveal -> COLLAPSED_HEIGHT * CENTER_REVEAL_HEIGHT_FACTOR
        !hasTitleAccessory -> COLLAPSED_HEIGHT
        else -> lerp(COLLAPSED_HEIGHT, ACCESSORY_COLLAPSED_HEIGHT, inlineReveal)
    }

    fun headerHeight(progress: Float, collapsedHeight: Float): Float = lerp(EXPANDED_HEIGHT, collapsedHeight, progress)
}
