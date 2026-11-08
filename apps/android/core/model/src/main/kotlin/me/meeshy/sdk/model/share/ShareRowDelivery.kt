package me.meeshy.sdk.model.share

/**
 * **Les transitions de la livraison d'une ligne** (V6) — idle (`null`) → envoi → envoyé / en file / échec,
 * et « Réessayer » ne part que d'un échec. Un résultat sans départ, ou sur une ligne déjà servie, est
 * ignoré : l'envoi continue et ne recule jamais, même si l'écran se ferme et se rouvre.
 */
object ShareRowDelivery {
    sealed interface Event {
        data object Begin : Event

        data class Served(val queued: Boolean) : Event

        data class Failed(val reason: ShareFailure) : Event
    }

    fun next(current: ShareDelivery?, event: Event): ShareDelivery? = when (event) {
        Event.Begin -> if (isRetryable(current)) ShareDelivery.Sending else current
        is Event.Served -> if (current == ShareDelivery.Sending) (if (event.queued) ShareDelivery.Queued else ShareDelivery.Sent) else current
        is Event.Failed -> if (current == ShareDelivery.Sending) ShareDelivery.Failed(event.reason) else current
    }

    fun isRetryable(current: ShareDelivery?): Boolean = current == null || current is ShareDelivery.Failed
}
