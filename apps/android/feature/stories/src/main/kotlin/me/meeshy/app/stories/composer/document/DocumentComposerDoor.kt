package me.meeshy.app.stories.composer.document

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.feature.stories.R
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.composer.CarriedSceneAssets
import me.meeshy.sdk.model.composer.ComposerDocumentDraft
import me.meeshy.sdk.model.composer.DocumentDoor
import me.meeshy.sdk.model.composer.DocumentRefusalCopy
import me.meeshy.sdk.model.composer.DocumentSendCoordinator
import me.meeshy.sdk.model.composer.DocumentSendOutcome
import me.meeshy.sdk.model.feedback.FeedbackToastKind

/** Les deux phrases d'un refus, résolues par la porte (le coordinateur n'a pas de ressources). */
internal class DocumentRefusalMessages(val publishError: String, val formatUnsupported: String) {
    fun of(copy: DocumentRefusalCopy): String = when (copy) {
        DocumentRefusalCopy.PUBLISH_ERROR -> publishError
        DocumentRefusalCopy.FORMAT_UNSUPPORTED -> formatUnsupported
    }
}

/**
 * La PORTE du document (iOS `DocumentComposerDoor`) : le site qui ENVOIE. Elle ne ferme jamais d'elle-même : [send] rend `true`
 * quand la ligne est enfilée (la porte peut alors se fermer), `false` après un refus DIT par un toast — la composition est
 * conservée, jamais un échec silencieux.
 */
@HiltViewModel
internal class DocumentComposerDoorViewModel @Inject constructor(
    publisher: DocumentDurablePublisher,
    private val toasts: FeedbackToastCenter,
) : ViewModel() {

    private val coordinator = DocumentSendCoordinator(publisher)

    suspend fun send(
        draft: ComposerDocumentDraft,
        door: DocumentDoor,
        carried: CarriedSceneAssets,
        messages: DocumentRefusalMessages,
    ): Boolean = when (val outcome = coordinator.send(draft, door, carried)) {
        is DocumentSendOutcome.Accepted -> true
        is DocumentSendOutcome.Refused -> {
            toasts.show(messages.of(outcome.copyKey), FeedbackToastKind.ERROR)
            false
        }
    }
}

/** L'envoi d'un document pour [door] : `true` = enfilé (fermer), `false` = refusé en clair (rester). */
internal typealias DocumentSender = suspend (draft: ComposerDocumentDraft, carried: CarriedSceneAssets) -> Boolean

@Composable
internal fun rememberDocumentSender(
    door: DocumentDoor,
    viewModel: DocumentComposerDoorViewModel = hiltViewModel(),
): DocumentSender {
    val messages = DocumentRefusalMessages(
        publishError = stringResource(R.string.feed_post_publish_error),
        formatUnsupported = stringResource(R.string.composer_publish_format_unsupported),
    )
    return remember(door, viewModel, messages.publishError, messages.formatUnsupported) {
        val sender: DocumentSender = { draft, carried -> viewModel.send(draft, door, carried, messages) }
        sender
    }
}
