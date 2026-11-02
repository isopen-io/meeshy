package me.meeshy.sdk.model.composer

import kotlin.math.max
import kotlin.math.min

/**
 * Solveur de cadrage du canevas de story — port de `StoryCanvasFraming` (iOS). Le canevas garde
 * ses bornes 9:16 intrinsèques (l'ajustement du viewport entier) ; ce solveur rend l'`échelle`,
 * le décalage vertical et le rayon d'angle qu'un conteneur applique pour le poser dans la région
 * libre `[headerInset … viewportHeight - bottomInset]`. Pur : aucune dépendance Android.
 */
object StoryCanvasFraming {
    const val PORTRAIT_RATIO: Float = 9f / 16f

    enum class Presentation { FREE, CARDED, IMMERSIVE }

    /** Alignement vertical de la carte DANS la région libre quand elle ne la remplit pas. */
    enum class VerticalAlignment { CENTER, TOP, BOTTOM }

    data class Input(
        val viewportWidth: Float,
        val viewportHeight: Float,
        val headerInset: Float,
        val bottomInset: Float,
        val presentation: Presentation,
        val cardedCornerRadius: Float,
        val sideInset: Float = 0f,
        val verticalAlignment: VerticalAlignment = VerticalAlignment.CENTER,
        val canvasRatio: Float = PORTRAIT_RATIO,
    )

    data class Result(val scale: Float, val offsetY: Float, val cornerRadius: Float) {
        companion object {
            val IDENTITY = Result(scale = 1f, offsetY = 0f, cornerRadius = 0f)
        }
    }

    /**
     * Vrai quand le canevas doit se réduire en carte : un panneau déployé ou la timeline réduisent
     * la zone visible. Le dessin et l'édition de texte sont des immersions qui l'emportent.
     */
    fun isCarded(
        bandPresent: Boolean,
        drawingActive: Boolean,
        textActive: Boolean,
        timelineActive: Boolean = false,
    ): Boolean {
        if (textActive || drawingActive) return false
        return bandPresent || timelineActive
    }

    /**
     * Politique Android de la zone visible : un panneau OU le clavier (éditeur de texte, légende)
     * la réduisent, le canevas se réduit alors en carte entière — jamais de bas masqué. Le dessin
     * garde le canevas plein cadre, dessinable jusqu'aux angles.
     */
    fun shouldCard(panelOpen: Boolean, keyboardVisible: Boolean, drawingActive: Boolean): Boolean =
        !drawingActive && (panelOpen || keyboardVisible)

    fun readerPresentation(isFullscreenSession: Boolean, chromeVisible: Boolean): Presentation = when {
        isFullscreenSession -> Presentation.IMMERSIVE
        chromeVisible -> Presentation.CARDED
        else -> Presentation.FREE
    }

    /** La colonne d'une légende : celle du CANEVAS (mis à l'échelle), jamais celle du conteneur. */
    fun captionColumnWidth(viewportWidth: Float, viewportHeight: Float, ratio: Float, scale: Float): Float {
        val (width, _) = aspectFit(viewportWidth, viewportHeight, ratio)
        return max(0f, width * max(scale, 0f))
    }

    fun resolve(input: Input): Result {
        val (iw, ih) = aspectFit(input.viewportWidth, input.viewportHeight, input.canvasRatio)
        if (input.presentation == Presentation.FREE) return Result.IDENTITY
        if (!(iw > 0f && ih > 0f)) return Result.IDENTITY
        if (input.presentation == Presentation.IMMERSIVE) {
            val cover = max(input.viewportWidth / iw, input.viewportHeight / ih)
            return Result(scale = cover, offsetY = 0f, cornerRadius = 0f)
        }
        val regionTop = max(0f, input.headerInset)
        val regionBottom = max(regionTop, input.viewportHeight - max(0f, input.bottomInset))
        val regionHeight = regionBottom - regionTop
        val regionWidth = max(0f, input.viewportWidth - 2f * max(0f, input.sideInset))
        if (!(regionHeight > 0f && regionWidth > 0f)) return Result.IDENTITY

        val cardHeight = min(regionHeight, regionWidth / input.canvasRatio)
        val scale = min(1f, max(0f, cardHeight / ih))
        val scaledHeight = ih * scale
        val centerY = when (input.verticalAlignment) {
            VerticalAlignment.CENTER -> regionTop + regionHeight / 2f
            VerticalAlignment.TOP -> regionTop + scaledHeight / 2f
            VerticalAlignment.BOTTOM -> regionBottom - scaledHeight / 2f
        }
        return Result(scale = scale, offsetY = centerY - input.viewportHeight / 2f, cornerRadius = input.cardedCornerRadius)
    }

    private fun aspectFit(width: Float, height: Float, ratio: Float): Pair<Float, Float> {
        if (!(width > 0f && height > 0f && ratio > 0f)) return 0f to 0f
        val w = min(width, height * ratio)
        return w to w / ratio
    }
}
