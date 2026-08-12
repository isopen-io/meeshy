package me.meeshy.ui.component.chrome

/**
 * Pure geometry + stagger math for the animated "stacked-dashes" brand mark shown on
 * [MeeshySplashScreen] — the Compose analogue of iOS `AnimatedLogoView`'s staggered dash
 * reveal (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/AnimatedLogoView.swift`: three
 * dashes, `.trim(from: 0, to:)` stroke-draw, delays 0 / 0.1s / 0.2s). Reuses the exact bar
 * geometry pixel-measured for the app launcher icon
 * (`apps/android/app/src/main/res/drawable/ic_launcher_foreground.xml`, itself derived from
 * `apps/ios/Meeshy/Assets.xcassets/AppIcon.appiconset/Icon-Light-1024x1024.png`) so the glyph
 * never drifts between the two brand surfaces — kept in lockstep by citation, not runtime
 * coupling, since `:sdk-ui` cannot depend on the `:app` module's resources.
 */
internal object SplashLogoGeometry {

    /** One bar of the glyph, normalized to a 0f..1f square viewport (top-left origin). */
    data class Bar(
        val left: Float,
        val top: Float,
        val right: Float,
        val bottom: Float,
        val cornerRadius: Float,
    ) {
        val width: Float get() = right - left
        val height: Float get() = bottom - top
    }

    private const val VIEWPORT = 108f
    private const val CORNER_RADIUS_PX = 3.541f

    private fun bar(left: Float, top: Float, right: Float, bottom: Float) = Bar(
        left = left / VIEWPORT,
        top = top / VIEWPORT,
        right = right / VIEWPORT,
        bottom = bottom / VIEWPORT,
        cornerRadius = CORNER_RADIUS_PX / VIEWPORT,
    )

    /**
     * Three bars, decreasing width, left-aligned, evenly stacked — same source numbers as
     * `ic_launcher_foreground.xml`'s bounding boxes on its 108x108 viewport.
     */
    val bars: List<Bar> = listOf(
        bar(31.588f, 38.984f, 76.412f, 46.066f),
        bar(31.588f, 50.459f, 67.447f, 57.541f),
        bar(31.588f, 61.934f, 58.483f, 69.016f),
    )

    /**
     * Fraction of the total entrance animation at which bar [index] starts revealing — a
     * staggered cascade (top bar first), mirroring iOS's 0 / 0.1s / 0.2s dash delays.
     */
    private val startOffsets = listOf(0f, 0.2f, 0.4f)

    /**
     * Bar [index]'s own 0f..1f reveal progress given the logo's overall [globalProgress]
     * (0f..1f, clamped). Each bar is inert until the animation reaches its [startOffsets]
     * fraction, then races to 1f over the remaining span — so every bar still lands at
     * exactly 1f once [globalProgress] reaches 1f, regardless of its stagger.
     */
    fun barProgress(globalProgress: Float, index: Int): Float {
        val offset = startOffsets[index]
        val clampedGlobal = globalProgress.coerceIn(0f, 1f)
        return ((clampedGlobal - offset) / (1f - offset)).coerceIn(0f, 1f)
    }
}
