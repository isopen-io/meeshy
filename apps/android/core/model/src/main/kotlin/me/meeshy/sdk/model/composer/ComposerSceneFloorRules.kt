package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.StoryBackgroundTransform
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.composer.scene.StoryFitMode

/** La clé du SOL de la scène : ce qui en change le hachage (#8370). */
data class ComposerSceneFloorKey(
    val slideId: String,
    val background: String?,
    val media: List<String>,
    val texts: List<String>,
    /** Cadrage puis fond du panneau Cadre (#8414) : ils changent le composite. */
    val framing: List<String?>,
    val imagesVersion: Long,
)

/**
 * Le SOL de la scène (miroir de `ComposerSceneFloorRules` iOS) : le sol n'est recalculé que si la clé change. Une
 * position, une échelle ou une rotation ne la touchent pas — un hachage de 32 pixels ne verrait pas la différence.
 */
object ComposerSceneFloorRules {

    /** Le fond choisi au Cadre quand la scène AJUSTE un média de fond ; le flou garde le hachage (`null`). */
    fun backdropHex(hasBackgroundMedia: Boolean, transform: StoryBackgroundTransform?): String? {
        if (StoryFitMode.rendersFilled(transform?.videoFitMode) || !hasBackgroundMedia) return null
        return StoryBackdrop.resolve(transform?.backdrop).solidHex
    }

    fun key(
        slideId: String,
        background: String?,
        mediaIds: List<String>,
        textIds: List<String>,
        transform: StoryBackgroundTransform?,
        imagesVersion: Long,
    ): ComposerSceneFloorKey = ComposerSceneFloorKey(
        slideId = slideId,
        background = background,
        media = mediaIds,
        texts = textIds,
        framing = listOf(transform?.videoFitMode, transform?.backdrop),
        imagesVersion = imagesVersion,
    )
}
