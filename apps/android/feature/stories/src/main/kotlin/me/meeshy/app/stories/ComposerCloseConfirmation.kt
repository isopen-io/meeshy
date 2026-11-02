package me.meeshy.app.stories

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerCloseGuard
import me.meeshy.ui.component.composer.ComposerConfirmationDialog

/** La fermeture du compositeur : [request] (croix, retour système, glissé vers le bas) ; [asks] dit si elle posera la question. */
internal class ComposerCloseRequest(val request: () -> Unit, val asks: Boolean)

/**
 * La question avant de fermer un brouillon non vide (#13838), sur le modèle de la suppression d'une diapo (#13616) : « Garder
 * le brouillon » ferme et le laisse à la sauvegarde automatique ([onKeep]), « Abandonner » ferme et le purge ([onDiscard]),
 * toucher à côté reste dans le compositeur. Un brouillon vide, ou la modification d'une story publiée, se ferme sans question.
 */
@Composable
internal fun rememberConfirmedComposerClose(
    hasContent: Boolean,
    editingPublished: Boolean,
    onKeep: () -> Unit,
    onDiscard: () -> Unit,
): ComposerCloseRequest {
    var asking by remember { mutableStateOf(false) }
    val keep by rememberUpdatedState(onKeep)
    val discard by rememberUpdatedState(onDiscard)
    if (asking) {
        ComposerConfirmationDialog(
            title = stringResource(R.string.composer_close_draft_title),
            destructiveLabel = stringResource(R.string.composer_close_draft_discard),
            onDestructive = { asking = false; discard() },
            safeLabel = stringResource(R.string.composer_close_draft_keep),
            onSafe = { asking = false; keep() },
            onDismissRequest = { asking = false },
        )
    }
    val asks = ComposerCloseGuard.onClose(hasContent, editingPublished) == ComposerCloseGuard.Outcome.CONFIRM
    return remember(asks) {
        ComposerCloseRequest(request = { if (asks) asking = true else keep() }, asks = asks)
    }
}

/**
 * Le retour système du compositeur (#13838) : il quitte d'abord le geste en cours — la feuille ouverte ([onCloseSheet]),
 * puis le panneau ouvert ([onClosePanel]) — et seulement ensuite ferme, avec la question d'un brouillon non vide ([close]).
 * Le dernier gestionnaire posé est le premier servi : l'ordre ci-dessous EST la priorité, du plus large au plus local.
 */
@Composable
internal fun ComposerBackHandlers(close: ComposerCloseRequest, onClosePanel: (() -> Unit)?, onCloseSheet: (() -> Unit)?) {
    BackHandler(enabled = close.asks, onBack = close.request)
    BackHandler(enabled = onClosePanel != null) { onClosePanel?.invoke() }
    BackHandler(enabled = onCloseSheet != null) { onCloseSheet?.invoke() }
}
