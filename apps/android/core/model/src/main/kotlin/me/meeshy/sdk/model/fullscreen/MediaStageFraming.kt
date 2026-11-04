package me.meeshy.sdk.model.fullscreen

import kotlin.math.max
import kotlin.math.min

/**
 * Le solveur de cadrage de la galerie (miroir de `MediaStageFraming.swift`) : les couloirs d'abord (zone sûre, menu,
 * pellicule, bande de progression, gouttière), puis le cadre prend le reste. L'équilibre ne dépend pas du ratio du média.
 */
public object MediaStageFraming {
    public enum class Presentation { Carded, Full }

    public data class Size(val width: Float, val height: Float) {
        public companion object { public val Zero: Size = Size(0f, 0f) }
    }

    public data class Corridors(
        val safeTop: Float,
        val top: Float,
        val rail: Float,
        val transport: Float,
        val safeBottom: Float,
        val gutter: Float,
    ) {
        public val reservedHeight: Float get() = safeTop + top + rail + transport + safeBottom + gutter
    }

    public data class Input(
        val viewport: Size,
        val mediaRatio: Float,
        val corridors: Corridors,
        val presentation: Presentation,
        val cardedCornerRadius: Float,
        val minimumFrameHeight: Float,
        val minimumFrameWidth: Float,
    )

    public data class Result(val frame: Size, val media: Size, val cornerRadius: Float) {
        public val letterboxes: Boolean
            get() = frame.width > 0 && frame.height > 0 && (media.width < frame.width - 0.5f || media.height < frame.height - 0.5f)

        /** Plie le cadre à un conteneur réellement mesuré, le média rétrécissant d'autant sans jamais grandir. */
        public fun fitted(container: Size): Result {
            if (container.width <= 0 || container.height <= 0 || !container.width.isFinite() || !container.height.isFinite()) return this
            val bounded = Size(min(frame.width, container.width), min(frame.height, container.height))
            if (bounded == frame) return this
            val shrink = minOf(
                1f,
                if (media.width > 0) bounded.width / media.width else 1f,
                if (media.height > 0) bounded.height / media.height else 1f,
            )
            return Result(bounded, Size(media.width * shrink, media.height * shrink), cornerRadius)
        }
    }

    public val Zero: Result = Result(Size.Zero, Size.Zero, 0f)

    public fun resolve(input: Input): Result {
        if (input.mediaRatio <= 0f || input.viewport.width <= 0f || input.viewport.height <= 0f) return Zero
        return when (input.presentation) {
            Presentation.Full -> Result(input.viewport, aspectFit(input.mediaRatio, input.viewport), 0f)
            Presentation.Carded -> {
                val regionWidth = max(0f, input.viewport.width - 2 * max(0f, input.corridors.gutter))
                val regionHeight = max(0f, input.viewport.height - input.corridors.reservedHeight)
                if (regionWidth <= 0f || regionHeight <= 0f) return Zero
                val media = aspectFit(input.mediaRatio, Size(regionWidth, regionHeight))
                val frame = Size(
                    floored(media.width, input.minimumFrameWidth, regionWidth),
                    floored(media.height, input.minimumFrameHeight, regionHeight),
                )
                Result(frame, media, input.cardedCornerRadius)
            }
        }
    }

    /** L'échelle qui fait remplir le cadre par le média (jamais sous 1). */
    public fun coverScale(frame: Size, media: Size): Float {
        if (media.width <= 0 || media.height <= 0 || frame.width <= 0 || frame.height <= 0) return 1f
        return max(1f, max(frame.width / media.width, frame.height / media.height))
    }

    private fun floored(value: Float, minimum: Float, bound: Float): Float = min(max(value, minimum), bound)

    private fun aspectFit(ratio: Float, box: Size): Size {
        val width = box.height * ratio
        return if (width > box.width) Size(box.width, box.width / ratio) else Size(width, box.height)
    }
}
