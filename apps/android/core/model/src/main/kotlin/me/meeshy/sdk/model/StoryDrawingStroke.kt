package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The active brush at capture time — parity with the iOS `StrokeTool`. `ERASER` is
 * never persisted onto an existing stroke: it is a capture-side action that removes
 * the strokes it hits. [wire] is the exact gateway string (mirrored by the
 * [SerialName] so serialization and any non-serialization read agree), so no surface
 * hardcodes the literal.
 */
@Serializable
enum class StrokeTool(val wire: String) {
    @SerialName("pen") PEN("pen"),
    @SerialName("marker") MARKER("marker"),
    @SerialName("eraser") ERASER("eraser"),
}

/**
 * The smoothing applied when a stroke is rendered — parity with the iOS
 * `StrokeSmoothing`: `RAW` renders the captured points as-is, `CURVE` interpolates
 * (Catmull-Rom), `LINE` simplifies to straight segments. [wire] is the exact gateway
 * string (mirrored by the [SerialName]).
 */
@Serializable
enum class StrokeSmoothing(val wire: String) {
    @SerialName("raw") RAW("raw"),
    @SerialName("curve") CURVE("curve"),
    @SerialName("line") LINE("line"),
}

/**
 * A single captured point along a stroke — parity with iOS `StoryDrawingStrokePoint`.
 * [pressure] comes from a stylus when available (1.0 for finger input); the renderer
 * can modulate width along the stroke from it. Coordinates live in the canonical
 * design space (1080×1920) so a stroke stays portable across screen sizes.
 */
@Serializable
data class StoryDrawingStrokePoint(
    val x: Double,
    val y: Double,
    val pressure: Double = 1.0,
)

/**
 * A single freehand stroke — parity with iOS `StoryDrawingStroke`, and the SINGLE
 * home of the drawing wire model (this `:core:model` type is the one the
 * [StoryEffects.drawingStrokes] wire field and the `:feature:stories`
 * `StoryDrawingBoard` reducer both hold, exactly as iOS keeps one
 * `MeeshySDK/Models/StoryDrawingStroke` for both its `StoryEffects` wire and its
 * editor ViewModel — no divergent twin between the wire and the editor).
 *
 * Points live in the canonical design space; [width] is in design-pixels (the
 * renderer projects to the real display size). [captureVersion] `0` = legacy
 * constant-width render, `≥1` = each point carries a real pressure driver
 * (variable-width render).
 *
 * [createdAt] (epoch seconds) is a pure passthrough the reducer never reads (draw
 * order is already the strokes-list order): it is carried only so a decoded v3/v1
 * stroke round-trips its full wire back out. Optional here because Android has no
 * drawing-capture path yet and an older writer may omit it — a strictly-decoding
 * caller must still read the stroke, unlike iOS which requires the key.
 */
@Serializable
data class StoryDrawingStroke(
    val id: String,
    val points: List<StoryDrawingStrokePoint> = emptyList(),
    val colorHex: String,
    val width: Double,
    val tool: StrokeTool = StrokeTool.PEN,
    val smoothing: StrokeSmoothing = StrokeSmoothing.RAW,
    val createdAt: Double? = null,
    val captureVersion: Int = 0,
)
