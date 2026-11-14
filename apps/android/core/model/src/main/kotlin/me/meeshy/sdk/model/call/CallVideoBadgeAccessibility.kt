package me.meeshy.sdk.model.call

/**
 * La phrase que TalkBack lit sur la puce de durée d'un appel VIDÉO — le seul endroit du chrome vidéo qui dit
 * l'état de l'appel (miroir de iOS `CallVideoBadgeAccessibility`). Elle porte tout ce que l'écran montre : signal,
 * micro coupé du correspondant, réseau du contact, reconnexion. Les phrases localisées arrivent en paramètre.
 */
object CallVideoBadgeAccessibility {
    data class Phrases(
        val duration: String,
        val peerMuted: String,
        val peerNetworkWeak: String,
        val reconnecting: String,
    )

    /** #17341 — la capsule porte aussi un titre et un nombre (groupe), et n'a pas de durée en audio : la phrase suit. */
    fun label(
        phrases: Phrases,
        signalDegraded: String?,
        peerMuted: Boolean,
        peerNetworkWeak: Boolean,
        reconnecting: Boolean,
        title: String? = null,
        participants: String? = null,
        includesDuration: Boolean = true,
    ): String = listOfNotNull(
        title,
        participants,
        phrases.duration.takeIf { includesDuration },
        signalDegraded,
        phrases.peerMuted.takeIf { peerMuted },
        phrases.peerNetworkWeak.takeIf { peerNetworkWeak },
        phrases.reconnecting.takeIf { reconnecting },
    ).joinToString(", ")
}
