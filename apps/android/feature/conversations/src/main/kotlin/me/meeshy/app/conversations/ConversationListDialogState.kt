package me.meeshy.app.conversations

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.feedback.HapticKind
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities
import me.meeshy.ui.component.FeedbackToastRequest

/**
 * LE dialogue de la liste (parité iOS `ConversationListSheetTargets`) : une seule cible est
 * jamais armée à la fois — on ne bloque pas un pair pendant qu'on en quitte une autre. Un état
 * scellé tenu par le ViewModel, donc il survit à la rotation, et rendu par un hôte unique
 * ([ConversationListDialogHost]). La feuille de code PIN reste
 * [ConversationListUiState.lockPrompt], piloté par [LockPinReducer] ; ouvrir un dialogue la
 * ferme et l'inverse.
 */
@Immutable
sealed interface ConversationListDialog {
    val conversationId: String

    /** Confirmation destructive du blocage du pair d'une directe. */
    data class Block(override val conversationId: String, val userId: String) : ConversationListDialog

    /** « Supprimer la conversation ? » (directe) ou « Masquer la discussion ? » (tout autre type). */
    data class Removal(
        override val conversationId: String,
        val conversationName: String,
        val removal: ConversationRowMenuCapabilities.Removal,
    ) : ConversationListDialog

    /** « Quitter la conversation » : l'historique reste lisible. */
    data class Leave(override val conversationId: String) : ConversationListDialog

    /** Champ « Nom » prérempli du titre affiché. */
    data class Rename(override val conversationId: String, val initialName: String) : ConversationListDialog

    /** Feuille de signalement : motif + détails facultatifs. */
    data class Report(override val conversationId: String) : ConversationListDialog

    /** Verrouiller sans code maître : alerte qui renvoie vers les Réglages. */
    data class MasterPinRequired(override val conversationId: String) : ConversationListDialog

    /** « Infos » : la fiche de la conversation, ouverte une seule fois par l'hôte. */
    data class Info(override val conversationId: String) : ConversationListDialog

    /** « Inviter » : la création d'un lien de partage, ouverte une seule fois par l'hôte. */
    data class Invite(override val conversationId: String) : ConversationListDialog
}

/** Les effets ponctuels des dialogues : haptique, toast, renvoi vers les Réglages, recherche armée. */
sealed interface ConversationListDialogEffect {
    data class Haptic(val kind: HapticKind) : ConversationListDialogEffect
    data class Toast(val request: FeedbackToastRequest) : ConversationListDialogEffect
    data object OpenSettings : ConversationListDialogEffect

    /** La conversation s'ouvre après un « Rechercher » franchi par son code : armer la recherche. */
    data class ArmSearch(val conversationId: String) : ConversationListDialogEffect
}
