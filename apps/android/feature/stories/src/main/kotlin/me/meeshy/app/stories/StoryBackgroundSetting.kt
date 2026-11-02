package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryMediaRotation
import me.meeshy.sdk.model.scene.StoryVolumeCarrying

/**
 * Ce que l'auteur règle du média de FOND hors de son cadrage et de son look (#14083), comme l'objet `isBackground` d'iOS :
 * son quart de tour ([rotationDeg], dans [0, 360)) et le volume d'une vidéo de fond, de 0 à 1 — 0 est le muet, et
 * [mutedVolumeMemento] rend le niveau quitté. Au repos, il ne change rien au fil.
 */
data class StoryBackgroundSetting(
    val rotationDeg: Float = 0f,
    override val volume: Float = 1f,
    override val mutedVolumeMemento: Float? = null,
) : StoryVolumeCarrying

/**
 * Réécrit le réglage du fond [mediaId] de la diapo choisie ; comme sa coupe, le régler DÉSIGNE le média que le plateau
 * peignait en fond sans désignation. Inerte si [mediaId] n'est ni le fond ni le candidat, ou si rien ne change.
 */
fun StorySlideDeck.updateSelectedBackgroundSetting(mediaId: String, change: (StoryBackgroundSetting) -> StoryBackgroundSetting): StorySlideDeck {
    val selected = selectedSlide
    val designated = selected.backgroundMediaId
    if (mediaId !in selected.mediaIds || (designated != null && designated != mediaId)) return this
    val current = selected.backgroundSetting.takeIf { designated == mediaId } ?: StoryBackgroundSetting()
    val next = change(current)
    if (designated == mediaId && next == selected.backgroundSetting) return this
    return copy(slides = slides.map { slide ->
        if (slide.id != selected.id) slide
        else slide.copy(
            backgroundMediaId = mediaId,
            backgroundLoop = if (designated == null) true else slide.backgroundLoop,
            placedMedia = slide.placedMedia.filterNot { it.mediaId == mediaId },
            backgroundSetting = next,
        )
    })
}

/** Le réglage du fond relu du fil ou d'un brouillon, tolérant : un angle illisible se lit droit, un volume illisible plein, un mémento n'existe que sous un muet. */
internal object StoryBackgroundSettingWire {
    fun read(rotation: Double?, volume: Float?, mutedVolumeMemento: Float?): StoryBackgroundSetting {
        val level = volume?.takeIf { it.isFinite() }?.coerceIn(0f, 1f) ?: 1f
        return StoryBackgroundSetting(
            rotationDeg = rotation?.toFloat()?.takeIf { it.isFinite() }?.let(StoryMediaRotation::normalized) ?: 0f,
            volume = level,
            mutedVolumeMemento = mutedVolumeMemento?.takeIf { level == 0f && it.isFinite() && it > 0f }?.coerceAtMost(1f),
        )
    }
}

/** Le réglage du fond que le plateau peint : celui du fond désigné ; le repos pour un candidat encore sans désignation. */
internal val StoryComposerUiState.paintedBackgroundSetting: StoryBackgroundSetting
    get() {
        val slide = deck.selectedSlide
        return slide.backgroundSetting.takeIf { slide.backgroundMediaId != null && slide.backgroundMediaId == selectedSlideBackdropMediaId } ?: StoryBackgroundSetting()
    }
