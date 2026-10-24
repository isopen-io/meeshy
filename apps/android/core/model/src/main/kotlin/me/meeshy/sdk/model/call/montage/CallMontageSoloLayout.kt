package me.meeshy.sdk.model.call.montage

import me.meeshy.sdk.model.call.frames.CallFrameRect

public enum class CallMontageTint(public val alpha: Double) { INDIGO(1.0) }

public data class CallMontageSoloScreen(
    val screen: CallFrameRect,
    val cornerRadius: Double,
    val statusBand: CallFrameRect,
    val reflection: List<CallMontagePoint>,
)

public data class CallMontageSoloMosaic(
    val slot: CallFrameRect,
    val columns: Int,
    val rows: Int,
    val joint: Double,
    val tiles: List<CallFrameRect>,
    val band: CallFrameRect,
)

public object CallMontageSoloLayout {
    public fun screen(bounds: CallFrameRect): CallMontageSoloScreen = CallMontageSoloScreen(bounds, 0.0, bounds, emptyList())
    public fun mosaic(bounds: CallFrameRect): CallMontageSoloMosaic = CallMontageSoloMosaic(bounds, 0, 0, 0.0, emptyList(), bounds)
    public fun tint(row: Int, column: Int): CallMontageTint = CallMontageTint.INDIGO
}
