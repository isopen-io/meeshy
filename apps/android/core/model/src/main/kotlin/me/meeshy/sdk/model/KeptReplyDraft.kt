package me.meeshy.sdk.model

/**
 * Le brouillon qui garde une réponse tapée dans une bannière que rien ne pouvait envoyer (#13693) : le mode de la
 * conversation n'a jamais été servi et le réseau manque, donc le clair ne part pas — le texte reste ici, sur l'appareil,
 * et revient dans le champ de la conversation à son ouverture (`DraftAutosave.restore`).
 *
 * Un brouillon déjà commencé n'est jamais écrasé : la réponse gardée s'ajoute après lui, sur sa propre ligne, et la
 * citation déjà armée l'emporte sur celle de la bannière. Les effets et la langue choisie du brouillon précédent sont conservés.
 */
object KeptReplyDraft {

    fun keep(
        previous: ConversationDraft?,
        conversationId: String,
        text: String,
        replyToId: String?,
        nowIso: String,
    ): ConversationDraft {
        val reply = text.trim()
        val base = previous ?: ConversationDraft(conversationId = conversationId)
        val kept = when {
            base.text.isBlank() -> reply
            base.text.trim() == reply -> base.text
            else -> base.text.trimEnd() + "\n" + reply
        }
        return base.copy(
            text = kept,
            updatedAt = nowIso,
            replyToId = base.replyToId?.takeIf { it.isNotBlank() } ?: replyToId?.trim()?.takeIf { it.isNotEmpty() },
        )
    }
}
