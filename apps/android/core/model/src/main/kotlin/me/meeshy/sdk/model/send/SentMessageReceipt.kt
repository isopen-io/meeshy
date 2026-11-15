package me.meeshy.sdk.model.send

/** Ce qu'un envoi réussi rend : l'identifiant client, et ce qui lui est arrivé — miroir de `SentMessageReceipt` (iOS). */
data class SentMessageReceipt(val clientMessageId: String, val delivery: Delivery) {

    enum class Transport { REST, SOCKET }

    sealed interface Delivery {
        /** Le serveur a accusé : la bulle devient le message serveur. */
        data class Acknowledged(val serverId: String, val atMillis: Long, val via: Transport) : Delivery

        /** Hors ligne : la bulle montre le sablier de file. */
        data object QueuedOffline : Delivery
    }

    val isQueuedOffline: Boolean get() = delivery is Delivery.QueuedOffline
}
