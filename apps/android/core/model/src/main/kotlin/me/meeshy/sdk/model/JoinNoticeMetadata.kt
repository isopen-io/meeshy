package me.meeshy.sdk.model

import kotlinx.serialization.json.JsonObject

/**
 * Avis d'arrivée — « X a rejoint la conversation » (`metadata.kind == "member-joined"`).
 * Miroir de `JoinNoticeMetadata` (iOS) et de `packages/shared/utils/join-notice.ts`.
 *
 * Le sens voyage dans `metadata`, jamais dans le texte : le `content` stocké n'est
 * qu'un repli. `kind` est un GARDE — `metadata` est partagé par toutes les familles
 * de messages système, un décodage permissif prendrait un résumé d'appel pour une arrivée.
 */
data class JoinNoticeMetadata(
    val participantId: String,
    val displayName: String,
    /** L'arrivant a-t-il un compte ? Absent ⇒ `false` : une absence n'est jamais une affirmation. */
    val isAnonymous: Boolean = false,
    val viaShareLink: Boolean = false,
    val username: String? = null,
    val givenName: String? = null,
    val linkRules: LinkRules? = null,
) {
    /** Ce que le lien d'entrée autorise à l'arrivant. */
    data class LinkRules(
        val canSendMessages: Boolean,
        val canSendFiles: Boolean,
        val canSendImages: Boolean,
    )

    companion object {
        const val KIND = "member-joined"

        fun parse(metadata: JsonObject?): JoinNoticeMetadata? {
            if (metadata.text("kind") != KIND) return null
            val participantId = metadata.text("participantId") ?: return null
            val displayName = metadata.text("displayName") ?: return null
            return JoinNoticeMetadata(
                participantId = participantId,
                displayName = displayName,
                isAnonymous = metadata.flag("isAnonymous") ?: false,
                viaShareLink = metadata.flag("viaShareLink") ?: false,
                username = metadata.text("username"),
                givenName = metadata.text("givenName"),
                linkRules = parseRules(metadata?.get("linkRules") as? JsonObject),
            )
        }

        /** Des règles malformées valent absence — jamais un droit affirmé. */
        private fun parseRules(rules: JsonObject?): LinkRules? {
            rules ?: return null
            return LinkRules(
                canSendMessages = rules.flag("canSendMessages") ?: return null,
                canSendFiles = rules.flag("canSendFiles") ?: return null,
                canSendImages = rules.flag("canSendImages") ?: return null,
            )
        }
    }
}
