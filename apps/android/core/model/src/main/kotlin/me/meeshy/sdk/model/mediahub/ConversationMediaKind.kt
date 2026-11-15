package me.meeshy.sdk.model.mediahub

import java.util.Locale

/**
 * Les genres de l'écran « Médias, liens et documents » — miroir de `ConversationMediaKind` (iOS) et de la clause
 * serveur `view=media&kinds=…`. Le [wire] est ce que la passerelle comprend ; l'ordre de déclaration est celui des
 * segments de l'écran.
 */
enum class ConversationMediaKind(val wire: String) {
    VISUAL("visual"),
    AUDIO("audio"),
    DOCUMENT("document"),
    LINK("link"),
    CONTACT("contact"),
    CONVERSATION("conversation"),
    LOCATION("location");

    /** Les genres portés par une PIÈCE JOINTE ; les autres se lisent dans le texte du message ou son lieu. */
    val isAttachmentKind: Boolean
        get() = this == VISUAL || this == AUDIO || this == DOCUMENT || this == CONTACT

    /** Clé de l'index gardé en mémoire : le visuel garde la clé nue, comme iOS. */
    fun indexKey(conversationId: String): String = if (this == VISUAL) conversationId else "$conversationId|$wire"

    companion object {
        /** Le genre que la passerelle sert quand `kinds` est absent. */
        val SERVER_DEFAULT: ConversationMediaKind = VISUAL

        /** La longueur minimale d'une recherche acceptée par la passerelle (en deçà : 400). */
        const val MINIMUM_SEARCH_LENGTH: Int = 2

        /**
         * Partition DISJOINTE d'une pièce selon son type MIME, identique à la clause serveur : visuel = images et
         * vidéos ; audio = sons ; contact = vCard ; document = tout le reste.
         */
        fun ofMime(mimeType: String?): ConversationMediaKind {
            val mime = (mimeType ?: "").lowercase(Locale.ROOT)
            return when {
                mime.startsWith("image/") || mime.startsWith("video/") -> VISUAL
                mime.startsWith("audio/") -> AUDIO
                mime.startsWith("text/vcard") || mime.startsWith("text/x-vcard") -> CONTACT
                else -> DOCUMENT
            }
        }

        /** `kinds=` n'est envoyé que s'il diffère du défaut serveur (une passerelle antérieure l'ignore sinon). */
        fun kindsQuery(kinds: List<ConversationMediaKind>): String? {
            val unique = kinds.distinct()
            if (unique.isEmpty() || unique == listOf(SERVER_DEFAULT)) return null
            return unique.joinToString(",") { it.wire }
        }

        /** `q=` est rogné ; trop court, il n'est pas envoyé — le genre entier se sert plutôt qu'un refus 400. */
        fun searchQuery(query: String?): String? =
            query?.trim()?.takeIf { it.length >= MINIMUM_SEARCH_LENGTH }
    }
}
