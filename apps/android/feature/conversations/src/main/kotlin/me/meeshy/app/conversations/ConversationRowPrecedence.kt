package me.meeshy.app.conversations

import me.meeshy.sdk.model.PresenceState

/** Ce que la deuxième ligne d'une rangée dit : jamais deux choses à la fois. */
internal enum class RowLine2 { TYPING, DRAFT, PREVIEW }

/**
 * Les deux décisions de précédence d'une rangée plate, pures (parité iOS
 * `LentilleConversationRow.Line2Kind.resolve` et `effectivePresenceState`).
 */
internal object ConversationRowPrecedence {

    /** Frappe > brouillon > aperçu. */
    fun line2(hasTyping: Boolean, hasDraft: Boolean): RowLine2 = when {
        hasTyping -> RowLine2.TYPING
        hasDraft -> RowLine2.DRAFT
        else -> RowLine2.PREVIEW
    }

    /** Un pair qui écrit est TOUJOURS vert (la frappe est une preuve d'activité); sinon la présence servie, telle quelle. */
    fun presence(served: PresenceState?, isTyping: Boolean): PresenceState? =
        if (isTyping) PresenceState.ONLINE else served
}
