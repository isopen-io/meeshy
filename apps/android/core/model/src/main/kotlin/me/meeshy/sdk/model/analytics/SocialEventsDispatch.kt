package me.meeshy.sdk.model.analytics

/**
 * Comment un lot de [StampedSocialEvent] part sur le fil.
 *
 * Un serveur antérieur à l'engagement d'ouverture refuserait le lot ENTIER : les `open`
 * partent donc dans une requête à eux, et un refus définitif de celle-ci ne touche jamais
 * une vue ou une impression.
 */
object SocialEventsDispatch {

    /** Vues et impressions d'abord, puis les `open` seuls ; ordre conservé, requêtes vides omises. */
    fun requests(events: List<StampedSocialEvent>): List<List<StampedSocialEvent>> {
        val (opens, reach) = events.partition { it.isOpen }
        return listOf(reach, opens).filter { it.isNotEmpty() }
    }

    /**
     * Un refus qu'un rejeu ne changerait pas : 4xx hors 408/429, ou 2xx dont le reçu est
     * illisible. Réseau ([statusCode] `null`), 5xx, 408 et 429 se rejouent.
     */
    fun isPermanentRefusal(statusCode: Int?, readableBody: Boolean = true): Boolean = when (statusCode) {
        null -> false
        in 200..299 -> !readableBody
        408, 429 -> false
        in 400..499 -> true
        else -> false
    }

    /** La source d'impression de l'ouverture d'un détail (`IMPRESSION_SOURCES` ne bouge pas). */
    fun detailImpressionSource(provenance: ViewProvenance): String = when (provenance) {
        ViewProvenance.NOTIFICATION -> "notification"
        ViewProvenance.SHARED_LINK, ViewProvenance.TRACKING_LINK -> "shared_link"
        ViewProvenance.LISTING, ViewProvenance.EXTERNAL, ViewProvenance.DIRECT -> "detail"
    }
}
