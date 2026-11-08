package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.PublicationTarget

/**
 * Où part une republication directe (iOS `StoryRepostDestination`) : le rail republie en STORY, la feuille de partage
 * offre aussi le post et le réel. La même mécanique pour les trois, seule la cible change.
 */
enum class StoryRepostDestination(val targetType: String) {
    STORY("STORY"),
    POST("POST"),
    REEL("REEL"),
    ;

    companion object {
        fun of(target: PublicationTarget): StoryRepostDestination = when (target) {
            PublicationTarget.STORY -> STORY
            PublicationTarget.POST -> POST
            PublicationTarget.REEL -> REEL
        }

        fun fromTargetType(wire: String?): StoryRepostDestination? = entries.firstOrNull { it.targetType == wire }
    }
}

/** Les refus NOMMÉS d'une republication (iOS `RepostFailure`) : 404 = la source a disparu, 403 = l'audience élargirait celle de l'original. */
enum class StoryRepostFailure {
    SOURCE_GONE,
    AUDIENCE_WIDENING,
    OTHER,
    ;

    companion object {
        fun classify(httpStatus: Int?): StoryRepostFailure = when (httpStatus) {
            HTTP_NOT_FOUND -> SOURCE_GONE
            HTTP_FORBIDDEN -> AUDIENCE_WIDENING
            else -> OTHER
        }

        /** Un refus que la même requête rencontrerait de nouveau (4xx hors 401, 408, 429) : la file y renonce au lieu de la rejouer. */
        fun isFinal(httpStatus: Int?): Boolean =
            httpStatus != null && httpStatus in HTTP_CLIENT_ERRORS && httpStatus !in RETRYABLE

        /** Sans réponse du tout (réseau absent) : la republication attend le retour du réseau dans la file. */
        fun waitsForNetwork(httpStatus: Int?): Boolean = httpStatus == null

        private const val HTTP_FORBIDDEN = 403
        private const val HTTP_NOT_FOUND = 404
        private val HTTP_CLIENT_ERRORS = 400..499
        private val RETRYABLE = setOf(401, 408, 429)
    }
}
