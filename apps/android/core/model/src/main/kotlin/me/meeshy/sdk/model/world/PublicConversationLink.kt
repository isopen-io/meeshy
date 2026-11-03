package me.meeshy.sdk.model.world

import java.util.Locale

/**
 * L'adresse que « Partager » transmet : `<origine web>/chat/<lien>` (miroir de `ConversationShareTarget`,
 * iOS `ConversationGuestHeaderBar.swift`, #10206). Le lien existe dans deux cas : l'invité est entré par un
 * lien (c'est celui-là qu'il transmet), ou la conversation est World Wide, dont `GET /world` sert le lien.
 * Rien n'est écrit en dur : la conversation est reconnue à l'identifiant SERVI. Ailleurs : `null`, pas de bouton.
 */
object PublicConversationLink {
    private const val GLOBAL = "global"

    fun url(
        conversationType: String?,
        conversationIdentifier: String?,
        guestLinkId: String?,
        world: WorldEntry?,
        webOrigin: String,
    ): String? {
        val key = linkKey(conversationType, conversationIdentifier, guestLinkId, world) ?: return null
        return "${webOrigin.trimEnd('/')}/chat/${encode(key)}"
    }

    /** Seule une conversation `global` peut être World Wide : les autres n'interrogent jamais `GET /world`. */
    fun needsWorldEntry(conversationType: String?, guestLinkId: String?): Boolean =
        guestLinkId.isNullOrEmpty() && conversationType?.lowercase(Locale.ROOT) == GLOBAL

    private fun linkKey(type: String?, identifier: String?, guestLinkId: String?, world: WorldEntry?): String? {
        if (!guestLinkId.isNullOrEmpty()) return guestLinkId
        if (type?.lowercase(Locale.ROOT) != GLOBAL || world == null || identifier != world.identifier) return null
        return world.shareLinkIdentifier.takeIf { it.isNotEmpty() }
    }

    private fun encode(key: String): String = buildString {
        for (byte in key.toByteArray(Charsets.UTF_8)) {
            val c = byte.toInt() and 0xFF
            val unreserved = c.toChar().let { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it in "-._~" }
            if (unreserved) append(c.toChar()) else append('%').append("%02X".format(c))
        }
    }
}
