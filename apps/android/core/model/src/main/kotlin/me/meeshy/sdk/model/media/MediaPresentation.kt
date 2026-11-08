package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.SharedPlace

/**
 * Une presentation media plein ecran du chat (iOS `ConversationPresentedMedia`). Une seule est
 * active a la fois : en ouvrir une seconde remplace la premiere.
 */
sealed interface MediaPresentation {
    data class Image(val messageId: String, val index: Int) : MediaPresentation
    data class Video(val url: String, val secure: Boolean) : MediaPresentation
    data class Audio(val attachmentId: String) : MediaPresentation
    data class Document(val attachmentId: String) : MediaPresentation
    data class Code(val attachmentId: String) : MediaPresentation
    data class Place(val messageId: String, val place: SharedPlace) : MediaPresentation
}

/** L'etat immuable de l'emplacement unique de presentation plein ecran. */
data class MediaPresentationState(val active: MediaPresentation? = null) {
    fun open(presentation: MediaPresentation): MediaPresentationState = copy(active = presentation)

    fun close(): MediaPresentationState = copy(active = null)
}
