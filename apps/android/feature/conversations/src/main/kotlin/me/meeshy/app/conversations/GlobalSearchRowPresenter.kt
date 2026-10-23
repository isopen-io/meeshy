package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.HighlightSegment
import me.meeshy.sdk.model.MessageTextParser
import me.meeshy.sdk.model.PresenceState

/** Protection d'un dernier message : la ligne dit le libelle, jamais le texte (parite iOS `LastMessageSummaryKind`). */
enum class RowProtection { HIDDEN, VIEW_ONCE, EXPIRED }

/** Presentation pure des lignes de resultat : aucune ressource, les libelles arrivent en parametres. */
object GlobalSearchRows {

    fun protection(last: ApiConversationLastMessage?, nowMillis: Long): RowProtection? =
        when (MessageSummaryKind.of(last, nowMillis)) {
            MessageSummaryKind.HIDDEN -> RowProtection.HIDDEN
            MessageSummaryKind.VIEW_ONCE -> RowProtection.VIEW_ONCE
            MessageSummaryKind.EXPIRED -> RowProtection.EXPIRED
            MessageSummaryKind.EPHEMERAL_ACTIVE, MessageSummaryKind.STANDARD -> null
        }

    fun messageLabel(template: String, sender: String, conversation: String, content: String): String =
        template.format(sender, conversation, content)

    fun tabLabel(name: String, count: Int, template: String): String = template.format(name, count)

    fun badge(count: Int): String = if (count > 99) "99+" else count.toString()

    /** Un point seulement pour « en ligne » ; hors ligne ou absent = aucun point (loi de presence). */
    fun presence(isOnline: Boolean?): PresenceState? = if (isOnline == true) PresenceState.ONLINE else null

    /** Le surlignage s'ancre sur la requete qui a PRODUIT les resultats, jamais sur la saisie vive. */
    fun highlight(content: String, resultsQuery: String): List<HighlightSegment> =
        MessageTextParser.highlightedSegments(content, resultsQuery)

    fun userLabel(name: String, username: String, online: Boolean, onlineWord: String): String =
        buildString {
            append("$name, @$username")
            if (online) append(", $onlineWord")
        }
}
