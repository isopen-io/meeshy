package me.meeshy.sdk.model.scene.export

/** Taille de sortie d'un export, en pixels. */
public data class StoryExportSize(val width: Int, val height: Int)

/**
 * Réglages d'encodage du MP4 de story (miroir de `StoryExportVideoSettings` iOS) : le plafond de
 * débit du pipeline. H.264 High, image-clé toutes les 2 s, 0,08 bit par pixel et par image.
 */
public object StoryExportVideoSettings {
    public const val BITS_PER_PIXEL_PER_FRAME: Double = 0.08
    public const val MINIMUM_BIT_RATE: Int = 2_000_000
    public const val MAXIMUM_BIT_RATE: Int = 9_000_000
    public const val KEY_FRAME_INTERVAL_SECONDS: Int = 2
    public const val VIDEO_MIME_TYPE: String = "video/avc"
    public const val H264_PROFILE: String = "High"

    public const val AUDIO_MIME_TYPE: String = "audio/mp4a-latm"
    public const val AUDIO_CHANNELS: Int = 2
    public const val AUDIO_SAMPLE_RATE: Int = 44_100
    public const val AUDIO_BIT_RATE: Int = 128_000

    public const val PORTRAIT_WIDTH: Int = 1080
    public const val PORTRAIT_HEIGHT: Int = 1920
    public const val LANDSCAPE_WIDTH: Int = 1080
    public const val LANDSCAPE_HEIGHT: Int = 607

    public val keyFrameIntervalFrames: Int = StoryExportFrameRate.FPS * KEY_FRAME_INTERVAL_SECONDS

    public fun outputSize(landscape: Boolean): StoryExportSize =
        if (landscape) StoryExportSize(LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT)
        else StoryExportSize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT)

    public fun averageBitRate(size: StoryExportSize): Int {
        val pixels = maxOf(1, size.width).toDouble() * maxOf(1, size.height).toDouble()
        val raw = (pixels * StoryExportFrameRate.FPS * BITS_PER_PIXEL_PER_FRAME).toLong()
        return raw.coerceIn(MINIMUM_BIT_RATE.toLong(), MAXIMUM_BIT_RATE.toLong()).toInt()
    }
}
