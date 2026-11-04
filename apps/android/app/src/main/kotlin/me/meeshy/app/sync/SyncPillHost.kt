package me.meeshy.app.sync

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.R
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.ui.component.chrome.MeeshySyncPill
import me.meeshy.ui.component.chrome.SyncPillTexts
import me.meeshy.ui.component.chrome.SyncPillUiRow

/**
 * L'hôte de la pastille : il lit le ViewModel, résout les clés iOS en chaînes localisées et relaie les gestes.
 * Il ne décide de rien (la décision est dans :core:model) et ne se place pas (voir `SyncPillOverlay`).
 */
@Composable
internal fun SyncPillHost(
    toasts: FeedbackToastCenter,
    onOpen: (OutboxNavigationSource) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SyncPillViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val rows = remember(state.rows, configuration) {
        state.rows.map { row ->
            val label = row.literalLabel ?: row.labelKey?.let { context.getString(SyncPillStrings.resFor(it)) }.orEmpty()
            SyncPillUiRow(row, label)
        }
    }
    val texts = remember(configuration) {
        SyncPillTexts(
            multiple = { count, label -> context.getString(R.string.sync_pill_a11y_multiple, count, label) },
            retryHint = context.getString(R.string.sync_pill_a11y_retry_hint),
            openHint = context.getString(R.string.sync_pill_a11y_openLocation_hint),
            pause = context.getString(R.string.sync_pill_a11y_pause),
            resume = context.getString(R.string.sync_pill_a11y_resume),
        )
    }
    LaunchedEffect(viewModel) {
        viewModel.effectFlow.collect { effect ->
            when (effect) {
                is SyncPillEffect.RetryResult -> toasts.show(
                    context.getString(if (effect.started) R.string.sync_pill_retry_started else R.string.sync_pill_retry_failed),
                    if (effect.started) FeedbackToastKind.INFO else FeedbackToastKind.ERROR,
                )
                is SyncPillEffect.Open -> onOpen(effect.source)
            }
        }
    }
    MeeshySyncPill(
        rows = rows,
        texts = texts,
        onRetry = { viewModel.onEvent(SyncPillUiEvent.Retry(it)) },
        onNavigate = { viewModel.onEvent(SyncPillUiEvent.Navigate(it)) },
        modifier = modifier,
    )
}
