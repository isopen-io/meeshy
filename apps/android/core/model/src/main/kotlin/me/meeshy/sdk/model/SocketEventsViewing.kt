package me.meeshy.sdk.model

import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.presence.ViewingChange
import me.meeshy.sdk.model.presence.ViewingEvent
import me.meeshy.sdk.model.presence.ViewingSnapshot
import me.meeshy.sdk.model.socket.SocketEventNames

/**
 * Famille `viewing:*` reçue : décodage tolérant (champ inconnu ignoré, `focus` absent = faux)
 * d'un événement serveur vers le [ViewingEvent] du registre. Un nom hors famille ou une charge
 * illisible rend `null` : rien n'est fabriqué.
 */
public object SocketEventsViewing {

    private val lenient = Json { ignoreUnknownKeys = true }

    public fun decode(event: String, rawJson: String, json: Json = lenient): ViewingEvent? = runCatching {
        when (event) {
            SocketEventNames.VIEWING_START -> ViewingEvent.Arrived(json.decodeFromString<ViewingChange>(rawJson))
            SocketEventNames.VIEWING_STOP -> ViewingEvent.Left(json.decodeFromString<ViewingChange>(rawJson))
            SocketEventNames.VIEWING_ACTIVITY -> ViewingEvent.Active(json.decodeFromString<ViewingChange>(rawJson))
            SocketEventNames.VIEWING_SNAPSHOT -> ViewingEvent.Snapshot(json.decodeFromString<ViewingSnapshot>(rawJson))
            else -> null
        }
    }.getOrNull()
}
