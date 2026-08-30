package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject

/**
 * Size of a story canvas in design pixels — the Android stand-in for iOS's
 * `CGSize` in `CanvasReprojector` (a source or target canvas shape). Positions
 * on the canvas are normalized `[0, 1]`; the size only feeds the source→target
 * rescale ratio, so a portrait `1080×1920` and a landscape `1920×1080` produce
 * opposite reprojection factors — exactly what a repost across aspect ratios
 * needs.
 */
internal data class CanvasSize(val width: Double, val height: Double)

/**
 * A warning raised when a reprojected position fell outside `[0, 1]` in the
 * target space and had to be clamped back into bounds — port of iOS
 * `CanvasReprojector.ReprojectionWarning`. The composer counts these to surface
 * the discreet "N item(s) repositioned for the new aspect ratio" banner.
 */
internal sealed interface ReprojectionWarning {
    data class Clamped(val originalX: Double, val originalY: Double) : ReprojectionWarning
}

/** One reprojected object paired with its optional clamp [warning]. */
internal data class ReprojectedItem<T>(val value: T, val warning: ReprojectionWarning?)

/**
 * The canvas objects carried by a repost, in the four positioned families the
 * pure reprojector handles. Mirrors the spatial subset of iOS `RepostPayload`;
 * `StoryLocationObject` (no Android model yet) and the PencilKit drawing blob
 * (device-bound; Android's freehand strokes are the pure `StoryDrawingStroke`
 * wire model, reprojected on a separate follow-up) are deliberately left out.
 */
internal data class CanvasObjects(
    val textObjects: List<StoryTextObject> = emptyList(),
    val mediaObjects: List<StoryMediaObject> = emptyList(),
    val stickers: List<StorySticker> = emptyList(),
    val audioPlayerObjects: List<StoryAudioPlayerObject> = emptyList(),
)

/**
 * The full result of reprojecting a [CanvasObjects] set to a target canvas: the
 * reprojected objects plus every clamp [warnings]. [repositionedCount] drives
 * the composer's "items repositioned" banner (iOS `reprojectionWarnings.count`);
 * [hasClampedItems] gates whether the banner shows at all (iOS `hasClampedItems`).
 */
internal data class RepostReprojection(
    val objects: CanvasObjects,
    val warnings: List<ReprojectionWarning>,
) {
    val hasClampedItems: Boolean get() = warnings.isNotEmpty()
    val repositionedCount: Int get() = warnings.size
}

/**
 * Reprojects canvas object positions from one aspect ratio to another — the
 * Android port of iOS `CanvasReprojector` (`MeeshyUI/Story/Canvas`).
 *
 * Positions are normalized `[0, 1]` in both source and target. The center
 * `(0.5, 0.5)` is always preserved; an object projected outside `[0, 1]` is
 * clamped back into bounds and reported with a [ReprojectionWarning.Clamped].
 * Scale, aspect ratio and rotation are invariant under reprojection — only the
 * position moves.
 *
 * SOTA over iOS: a degenerate target (a non-positive width or height, which
 * iOS's raw `CGSize` division would turn into `Infinity`/`NaN`) is treated as an
 * identity reprojection — the position is returned unchanged with no warning —
 * so a malformed canvas size can never corrupt an object's coordinates.
 */
internal class CanvasReprojector(
    private val source: CanvasSize,
    private val target: CanvasSize,
) {
    fun reproject(text: StoryTextObject): ReprojectedItem<StoryTextObject> {
        val p = reprojectNormalized(text.x, text.y)
        return ReprojectedItem(text.copy(x = p.x, y = p.y), p.warning)
    }

    fun reproject(media: StoryMediaObject): ReprojectedItem<StoryMediaObject> {
        val p = reprojectNormalized(media.x, media.y)
        return ReprojectedItem(media.copy(x = p.x, y = p.y), p.warning)
    }

    fun reproject(sticker: StorySticker): ReprojectedItem<StorySticker> {
        val p = reprojectNormalized(sticker.x, sticker.y)
        return ReprojectedItem(sticker.copy(x = p.x, y = p.y), p.warning)
    }

    /** Audio has no spatial position — pass-through identity, never a warning. */
    fun reproject(audio: StoryAudioPlayerObject): ReprojectedItem<StoryAudioPlayerObject> =
        ReprojectedItem(audio, null)

    /**
     * Reprojects every object in [objects] to the target canvas, collecting the
     * clamp warnings in encounter order (text → media → sticker; audio is
     * identity and contributes none). Port of iOS `UnifiedPostComposer`'s
     * `RepostReprojectionResult.reproject(payload:targetSize:)`.
     */
    fun reprojectAll(objects: CanvasObjects): RepostReprojection {
        val warnings = mutableListOf<ReprojectionWarning>()
        val texts = objects.textObjects.map { reproject(it).also { r -> r.warning?.let(warnings::add) } }
        val media = objects.mediaObjects.map { reproject(it).also { r -> r.warning?.let(warnings::add) } }
        val stickers = objects.stickers.map { reproject(it).also { r -> r.warning?.let(warnings::add) } }
        val audios = objects.audioPlayerObjects.map { reproject(it) }
        return RepostReprojection(
            objects = CanvasObjects(
                textObjects = texts.map { it.value },
                mediaObjects = media.map { it.value },
                stickers = stickers.map { it.value },
                audioPlayerObjects = audios.map { it.value },
            ),
            warnings = warnings.toList(),
        )
    }

    private data class Projected(val x: Double, val y: Double, val warning: ReprojectionWarning?)

    private fun reprojectNormalized(x: Double, y: Double): Projected {
        if (target.width <= 0.0 || target.height <= 0.0) return Projected(x, y, null)
        val scaleX = source.width / target.width
        val scaleY = source.height / target.height
        val projectedX = 0.5 + (x - 0.5) * scaleX
        val projectedY = 0.5 + (y - 0.5) * scaleY
        val needsClamp = projectedX < 0.0 || projectedX > 1.0 || projectedY < 0.0 || projectedY > 1.0
        val clampedX = projectedX.coerceIn(0.0, 1.0)
        val clampedY = projectedY.coerceIn(0.0, 1.0)
        return Projected(clampedX, clampedY, if (needsClamp) ReprojectionWarning.Clamped(x, y) else null)
    }
}
