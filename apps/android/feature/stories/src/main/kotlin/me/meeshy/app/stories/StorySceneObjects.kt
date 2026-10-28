package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.scene.SceneObjectNumbers
import me.meeshy.sdk.model.scene.StoryElementVisibility
import me.meeshy.sdk.model.scene.StoryMediaFadeResolver

/**
 * Un sticker posé sur une story, projeté pour le lecteur. [sideFraction] est le côté du
 * sticker en fraction de la LARGEUR de la scène — iOS `CanvasGeometry.stickerFontSize`
 * (`baseSize × scale` sur une scène de 1080) —, [x]/[y] son centre normalisé.
 */
@Immutable
data class StoryStickerView(
    val id: String,
    val emoji: String,
    val imageUrl: String?,
    val x: Double,
    val y: Double,
    val rotation: Double,
    val sideFraction: Double,
    val startTime: Double = 0.0,
    val duration: Double = 0.0,
    val fadeIn: Double = 0.0,
    val fadeOut: Double = 0.0,
) {
    fun isVisible(atSeconds: Float): Boolean =
        StoryElementVisibility.isVisible(startTime, duration, atSeconds.toDouble())

    fun opacity(atSeconds: Float): Double = StoryMediaFadeResolver.fadeOpacity(
        fadeIn = fadeIn.takeIf { it > 0.0 },
        fadeOut = fadeOut.takeIf { it > 0.0 },
        startTime = startTime,
        duration = duration.takeIf { it > 0.0 },
        currentTime = atSeconds.toDouble(),
    ) ?: 1.0
}

/**
 * La puce d'un son de premier plan — iOS `AudioForegroundChip` : une onde pour une voix
 * ou un son original ([credit] `null`), le crédit « titre · @auteur » pour un son emprunté.
 */
@Immutable
data class StoryAudioChipView(
    val id: String,
    val x: Double,
    val y: Double,
    val credit: String?,
    val waveform: List<Float>,
    val startTime: Double = 0.0,
    val duration: Double = 0.0,
) {
    fun isVisible(atSeconds: Float): Boolean =
        StoryElementVisibility.isVisible(startTime, duration, atSeconds.toDouble())
}

/** Projection pure des stickers et des puces audio d'une story vers le lecteur. */
object StorySceneObjectsProjection {

    /** Largeur de la scène de référence des tailles d'objets (iOS `CanvasGeometry.designWidth`). */
    const val DESIGN_CANVAS_WIDTH: Double = 1080.0

    /** Le crédit d'un son emprunté dont rien n'est connu (iOS `AudioChipDisplay.genericCredit`). */
    const val GENERIC_CREDIT: String = "♫ —"

    fun stickers(effects: StoryEffects?, mediaUrlOf: (String) -> String?): List<StoryStickerView> =
        SceneObjectNumbers.capped(
            effects?.stickerObjects.orEmpty()
                .sortedBy { it.zIndex }
                .mapNotNull { it.toView(mediaUrlOf) },
        )

    fun audioChips(effects: StoryEffects?): List<StoryAudioChipView> =
        effects?.audioPlayerObjects.orEmpty()
            .filterNot { it.isBackground == true }
            .sortedBy { it.zIndex ?: 0 }
            .map { it.toChip() }
            .let(SceneObjectNumbers::capped)

    private fun StorySticker.toView(mediaUrlOf: (String) -> String?): StoryStickerView? {
        val image = postMediaId.takeIf { it.isNotBlank() }?.let(mediaUrlOf)
        if (image == null && emoji.isBlank()) return null
        return StoryStickerView(
            id = id,
            emoji = emoji,
            imageUrl = image,
            x = SceneObjectNumbers.position(x),
            y = SceneObjectNumbers.position(y),
            rotation = SceneObjectNumbers.rotation(rotation),
            sideFraction = SceneObjectNumbers.stickerSideFraction(baseSize, scale),
            startTime = SceneObjectNumbers.seconds(startTime ?: 0.0),
            duration = SceneObjectNumbers.seconds(duration ?: 0.0),
            fadeIn = SceneObjectNumbers.seconds(fadeIn ?: 0.0),
            fadeOut = SceneObjectNumbers.seconds(fadeOut ?: 0.0),
        )
    }

    private fun StoryAudioPlayerObject.toChip(): StoryAudioChipView = StoryAudioChipView(
        id = id,
        x = SceneObjectNumbers.position(x),
        y = SceneObjectNumbers.position(y),
        credit = soundId?.let { creditLine(name, soundAuthorUsername) ?: GENERIC_CREDIT },
        waveform = waveformSamples,
        startTime = SceneObjectNumbers.seconds(startTime?.toDouble() ?: 0.0),
        duration = SceneObjectNumbers.seconds(duration?.toDouble() ?: 0.0),
    )

    private fun creditLine(title: String?, username: String?): String? =
        listOfNotNull(
            title?.takeIf { it.isNotBlank() },
            username?.takeIf { it.isNotBlank() }?.let { "@$it" },
        ).joinToString(" · ").ifBlank { null }
}
