package me.meeshy.sdk.model.call.montage

import me.meeshy.sdk.model.call.frames.CallFrameRect

public object CallMontageLayout {
    public val captureSize: CallMontageCanvas = CallMontageCanvas(1080.0, 1920.0)
    public const val FACE_SIDE: Int = 1080
    public const val MAX_PARTICIPANTS: Int = 12
    public const val FILM_FRAME_ASPECT: Double = 0.75
    public const val GOLD_CAMEO_ASPECT: Double = 1.3
    public const val REDCARPET_ASPECT: Double = 4.0 / 3

    public fun frames(style: CallMontageStyle, count: Int, canvas: CallMontageCanvas): List<CallMontageSlot> = emptyList()
    public fun gridDimensions(count: Int): Pair<Int, Int> = 0 to 0
    public fun captionBand(style: CallMontageStyle, canvas: CallMontageCanvas): CallFrameRect? = null
    public fun polaroidCard(photo: CallFrameRect): CallFrameRect = photo
    public fun filmStrips(count: Int, canvas: CallMontageCanvas): List<CallFrameRect> = emptyList()
}
