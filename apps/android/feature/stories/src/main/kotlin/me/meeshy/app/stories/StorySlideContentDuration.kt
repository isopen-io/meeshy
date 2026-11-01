package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.StoryTextObject

/**
 * **La durée qu'une diapo prend de son contenu** (#14280, iso iOS `StoryEffects.contentDerivedDuration`) : la donnée la plus
 * longue gagne — la vidéo de fond (sa fenêtre gardée), chaque vidéo posée (depuis son départ, sur sa fenêtre d'apparition ou
 * sa fenêtre de source), chaque son — avec 6 s au moins et le texte long qui allonge. [videoSourceSeconds] donne la durée de
 * SOURCE d'un fichier vidéo, `null` pour une image ou une vidéo pas encore mesurée : elle ne compte pas encore.
 * [backdropId] est le fond PEINT — le désigné, sinon le premier média non posé de la diapo, celui que l'auteur voit : une
 * vidéo choisie sur une diapo vierge est peinte en fond sans être désignée (recette S8 du 2026-11-01).
 */
internal object StorySlideContentDuration {

    fun seconds(
        slide: StorySlide,
        backdropId: String? = slide.backgroundMediaId,
        videoSourceSeconds: (String) -> Double? = { null },
    ): Double =
        StorySlideDuration.contentDerivedSeconds(
            mediaObjects = (listOfNotNull(background(slide, backdropId, videoSourceSeconds)) + placedVideos(slide, videoSourceSeconds))
                .takeIf { it.isNotEmpty() },
            audioPlayerObjects = slide.audio.takeIf { it.isNotEmpty() },
            textObjects = slide.elements.filter { it.isPublishable }.map { StoryTextObject(id = it.id, text = it.text) },
        )

    private fun background(slide: StorySlide, backdropId: String?, videoSourceSeconds: (String) -> Double?): StoryMediaObject? {
        val id = backdropId ?: return null
        val source = videoSourceSeconds(id) ?: return null
        return StoryMediaObject(
            id = id,
            postMediaId = id,
            mediaType = "video",
            isBackground = true,
            duration = slide.backgroundTrim?.takeIf { slide.backgroundMediaId == id }?.duration ?: source,
        )
    }

    private fun placedVideos(slide: StorySlide, videoSourceSeconds: (String) -> Double?): List<StoryMediaObject> =
        slide.placedMedia.mapNotNull { placed ->
            val source = videoSourceSeconds(placed.mediaId) ?: return@mapNotNull null
            val played = placed.trim?.duration ?: source
            StoryMediaObject(
                id = placed.id,
                postMediaId = placed.mediaId,
                mediaType = "video",
                startTime = placed.timing.startSeconds.toDouble().takeIf { placed.timing.hasStart },
                duration = if (placed.timing.isTimed) placed.timing.durationSeconds.toDouble() else played,
            )
        }
}

/** La durée de source d'un fichier vidéo, envoyé ou encore en file d'envoi, `null` pour une image ou une durée inconnue. */
internal fun StoryComposerUiState.videoSourceSeconds(fileId: String): Double? {
    val sent = attachments.firstOrNull { it.id == fileId }?.let { it.mimeType to it.durationMs }
    val (mime, millis) = sent ?: pendingUploads.firstOrNull { it.cmid == fileId }?.item?.let { it.mimeType to it.durationMs } ?: return null
    if (!mime.startsWith("video", ignoreCase = true)) return null
    return millis?.let { it / 1000.0 }?.takeIf { it.isFinite() && it > 0.0 }
}
