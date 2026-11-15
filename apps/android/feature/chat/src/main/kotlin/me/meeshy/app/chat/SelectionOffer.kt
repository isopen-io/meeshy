package me.meeshy.app.chat

import me.meeshy.sdk.model.ConversationClearance
import me.meeshy.sdk.model.MessageDeletability
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Ce que la barre du mode sélection offre (#13294) — la MÊME loi que le menu d'un message
 * (#12786) : chaque message est lu par [MessageActionMenu], jamais recomposé ici. Une entrée que
 * la loi refuse est ABSENTE, jamais grisée.
 *
 * Miroir de `selectionOffersForward` / `selectionAllowsDeleteForAll` / `selectionAllowsDeleteForMe`
 * (iOS `ConversationView+Selection`) : « Transférer » dès qu'UN message sort, « pour tous » quand
 * TOUS en sont éligibles, « pour moi » dès qu'UN message l'admet.
 */
internal data class SelectionOffer(
    val forward: Boolean,
    val copy: Boolean,
    val star: Boolean,
    val deleteForMe: Boolean,
    val deleteForEveryone: Boolean,
) {
    val offersDelete: Boolean get() = deleteForMe || deleteForEveryone

    companion object {
        val None = SelectionOffer(false, false, false, false, false)

        /** [bubbles] : la sélection, dans l'ordre du fil. Une sélection vide n'offre rien. */
        fun of(
            bubbles: List<BubbleContent>,
            canWrite: Boolean,
            nowMillis: Long,
            signalClearance: ConversationClearance = ConversationClearance.UNKNOWN,
        ): SelectionOffer {
            if (bubbles.isEmpty()) return None
            val offered = bubbles.map { bubble -> bubble to MessageActionMenu.actions(bubble.selectionContext(canWrite, nowMillis, signalClearance)) }
            return SelectionOffer(
                forward = offered.any { MessageAction.Forward in it.second },
                copy = offered.any { MessageAction.Copy in it.second && it.first.text.isNotBlank() },
                star = offered.any { MessageAction.Star in it.second || MessageAction.Unstar in it.second },
                deleteForMe = offered.any { MessageAction.DeleteForMe in it.second },
                deleteForEveryone = offered.all { MessageAction.DeleteForEveryone in it.second },
            )
        }

        /** Les messages de [bubbles] auxquels la loi offre [action], dans l'ordre reçu. */
        fun idsOffering(
            action: MessageAction,
            bubbles: List<BubbleContent>,
            canWrite: Boolean,
            nowMillis: Long,
            signalClearance: ConversationClearance = ConversationClearance.UNKNOWN,
        ): List<String> =
            bubbles.filter { action in MessageActionMenu.actions(it.selectionContext(canWrite, nowMillis, signalClearance)) }.map { it.messageId }

        /** Les messages de [bubbles] que la loi laisse copier, leur texte en lignes — l'ordre du fil. */
        fun copyText(bubbles: List<BubbleContent>, canWrite: Boolean, nowMillis: Long): String =
            bubbles
                .filter { MessageAction.Copy in MessageActionMenu.actions(it.selectionContext(canWrite, nowMillis)) }
                .map { it.text }
                .filter { it.isNotBlank() }
                .joinToString("\n")

        /** Les messages à étoiler : si tous le sont déjà, on les retire ; sinon on étoile le reste. */
        fun starTargets(bubbles: List<BubbleContent>, canWrite: Boolean, nowMillis: Long): List<BubbleContent> {
            val starrable = bubbles.filter {
                val actions = MessageActionMenu.actions(it.selectionContext(canWrite, nowMillis))
                MessageAction.Star in actions || MessageAction.Unstar in actions
            }
            return if (starrable.all { it.isStarred }) starrable else starrable.filterNot { it.isStarred }
        }

        /** [signalClearance] (#13790) : « pour tous » n'existe que vers une conversation connue claire ; copier, étoiler, « pour moi » n'en dépendent pas. */
        private fun BubbleContent.selectionContext(
            canWrite: Boolean,
            nowMillis: Long,
            signalClearance: ConversationClearance = ConversationClearance.UNKNOWN,
        ): MessageActionContext =
            actionContext(
                canWrite = canWrite,
                canDeleteForEveryone = MessageDeletability.canDeleteForEveryone(
                    isOwn = isOutgoing,
                    createdAtMillis = isoToEpochMillisOrNull(createdAtIso),
                    nowMillis = nowMillis,
                ),
                signalClearance = signalClearance,
            )
    }
}
