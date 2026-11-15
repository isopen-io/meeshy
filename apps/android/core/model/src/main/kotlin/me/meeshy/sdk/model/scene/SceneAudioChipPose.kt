package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryAudioPlayerObject

/**
 * La pose de la puce d'un son posé sur la scène (#16293) : elle se pince, se zoome et se tourne comme un sticker ou un
 * texte — la même [SceneObjectScalePolicy] (aucun plafond, un plancher de 5 pixels de design sur son plus petit côté),
 * la même rotation repliée sur un demi-tour.
 */
public object SceneAudioChipPose {

    /** La hauteur de la puce à l'échelle 1 sur la scène de référence 1080 : 34 points d'une scène de 390 (iOS `AudioForegroundChip`). */
    public const val SMALLEST_SIDE_DESIGN_PX: Double = 34.0 * 1080.0 / 390.0

    public fun scale(audio: StoryAudioPlayerObject): Double = SceneObjectScalePolicy.served(audio.scale ?: 1.0)

    public fun rotation(audio: StoryAudioPlayerObject): Double = wrapped(audio.rotation ?: 0.0)

    /** Un pas de pincer ou de rotation : l'échelle multipliée par [scaleBy], la rotation augmentée de [rotateByDeg]. */
    public fun transformed(audio: StoryAudioPlayerObject, scaleBy: Float, rotateByDeg: Float): StoryAudioPlayerObject = audio.copy(
        scale = SceneObjectScalePolicy.settled(scale(audio), scaleBy.toDouble(), SMALLEST_SIDE_DESIGN_PX),
        rotation = wrapped(rotation(audio) + rotateByDeg),
    )

    private fun wrapped(degrees: Double): Double {
        if (!degrees.isFinite()) return 0.0
        val turned = degrees % FULL_TURN
        return when {
            turned <= -HALF_TURN -> turned + FULL_TURN
            turned > HALF_TURN -> turned - FULL_TURN
            else -> turned
        }
    }

    private const val FULL_TURN = 360.0
    private const val HALF_TURN = 180.0
}
