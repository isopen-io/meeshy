package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.edit.ComposerBackgroundEditLevel
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool
import me.meeshy.sdk.model.composer.sound.SoundTrimLaw
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.media.MediaTrimRule

/**
 * La durée de SOURCE de la vidéo de fond [id], seule matière de son Couper (#13973) : `null` pour une image, un média qui
 * n'est pas le fond peint, ou une vidéo dont la durée n'est pas mesurée — aucun bouton sans effet.
 */
internal fun StoryComposerUiState.backgroundTrimSourceOf(id: String): Double? {
    if (id != selectedSlideBackdropMediaId || !placedMediaIsVideo(id)) return null
    val millis = attachments.firstOrNull { it.id == id }?.durationMs ?: pendingUploads.firstOrNull { it.cmid == id }?.item?.durationMs ?: return null
    return (millis / 1000.0).takeIf { it.isFinite() && it >= MediaTrimRule.MINIMUM_DURATION }?.coerceAtMost(SoundTrimLaw.MAX_SOURCE_SECONDS)
}

/** La fenêtre EFFECTIVE de la vidéo de fond [id] dans sa source : entière tant qu'elle n'est pas coupée. */
internal fun StoryComposerUiState.backgroundTrimOf(id: String): MediaTrimBounds? {
    val source = backgroundTrimSourceOf(id) ?: return null
    val trim = deck.selectedSlide.backgroundTrim.takeIf { deck.selectedSlide.backgroundMediaId == id }
    return MediaTrimRule.resolved(trim?.start, trim?.end, source)
}

/** Ce que le fond peint est, pour son niveau « Modifier » : une image ou une vidéo, coupable ou non, qui reçoit les looks de l'appel ou non. */
internal val StoryComposerUiState.backgroundEditTools: List<ComposerBackgroundTool>
    get() {
        val id = selectedSlideBackdropMediaId ?: return emptyList()
        return ComposerBackgroundEditLevel.tools(
            ComposerBackgroundEditLevel.Media(video = placedMediaIsVideo(id), trimmable = backgroundTrimSourceOf(id) != null, look = offersLook(id)),
        )
    }

/** La fenêtre d'un fond lue sur le fil ou dans le brouillon : deux bornes ordonnées et finies, sinon « entière ». */
internal object StoryBackgroundTrimWire {
    fun read(start: Double?, end: Double?): MediaTrimBounds? {
        if (start == null && end == null) return null
        val from = (start ?: 0.0).takeIf { it.isFinite() && it >= 0.0 } ?: return null
        val to = end?.takeIf { it.isFinite() } ?: return null
        return MediaTrimBounds(from, to).takeIf { to - from >= MediaTrimRule.MINIMUM_DURATION }
    }
}
