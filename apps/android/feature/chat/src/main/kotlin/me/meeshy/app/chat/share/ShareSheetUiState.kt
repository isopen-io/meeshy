package me.meeshy.app.chat.share

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.share.ShareDelivery
import me.meeshy.sdk.model.share.ShareLimits
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.SharePlan
import me.meeshy.sdk.model.share.SharePlanner
import me.meeshy.sdk.model.share.ShareSendBarState
import me.meeshy.sdk.model.share.ShareSheetState
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.sdk.model.share.ShareWithdrawReason

/** Tout ce que l'écran de partage unique sait ; la vue le projette, elle ne relit aucun drapeau de protection. */
@Immutable
internal data class ShareSheetUiState(
    val subject: ShareSubject? = null,
    val sheet: ShareSheetState = ShareSheetState(),
    val conversations: List<ShareRecipient> = emptyList(),
    val people: List<ShareRecipient> = emptyList(),
    val contentLines: List<String> = emptyList(),
    /** Ce que le partage entrant a laissé derrière lui (source refusée, trop lourd, illisible, au-delà du plafond), une ligne par sorte. */
    val notices: List<String> = emptyList(),
    val isLoading: Boolean = true,
    val isOffline: Boolean = false,
    /** La session se restaure encore (démarrage à froid d'un partage entrant) : un chargement, jamais « connectez-vous » à tort. */
    val isSessionLoading: Boolean = false,
    val isSignedOut: Boolean = false,
) {
    /** Le plan se relit toujours depuis le sujet et la sélection. */
    val plan: SharePlan?
        get() = subject?.let { SharePlanner.plan(it.entry(sheet.removedMessageIds), sheet.selection.map { r -> r.destination }) }

    /** Tout ce qui est choisi est protégé ou indisponible : la carte « ne sort pas de Meeshy » remplace la feuille. */
    val blocked: ShareWithdrawReason? get() = plan?.blocked

    /** Une fois quelque chose parti, « Annuler » devient « Fermer ». */
    val closeReplacesCancel: Boolean get() = sheet.hasSent

    val failedIds: List<String> get() = sheet.deliveries.filterValues { it is ShareDelivery.Failed }.keys.toList()

    /** Chaque destinataire coché a une issue : plus rien ne part. */
    val isFinished: Boolean
        get() = sheet.selection.isNotEmpty() && sheet.selection.all { r ->
            sheet.deliveries[r.id].let { it != null && it != ShareDelivery.Sending }
        }

    /** Sans échec, la feuille se referme seule (0,6 s) ; un échec la garde ouverte. */
    val autoCloses: Boolean get() = isFinished && failedIds.isEmpty()

    /** « Tout réessayer » : visible quand tout est fini et qu'au moins une rangée a échoué. */
    val offersRetryAll: Boolean get() = isFinished && failedIds.isNotEmpty()

    /** Au plus [ShareLimits.MAX_RECIPIENTS] destinataires : le onzième est refusé. */
    val selectionIsFull: Boolean get() = sheet.selection.size >= ShareLimits.MAX_RECIPIENTS

    val sendBar: ShareSendBarState?
        get() = plan?.let { ShareSendBarState.of(it, sheet.selection, sheet.hasSent, online = !isOffline) }
}
