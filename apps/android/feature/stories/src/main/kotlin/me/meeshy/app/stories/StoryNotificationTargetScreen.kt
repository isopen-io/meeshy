package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.sdk.model.story.StoryNotificationTargetState
import me.meeshy.ui.component.ContentFetchFailureView
import me.meeshy.ui.component.MeeshyShimmerPlaceholder
import me.meeshy.ui.component.chrome.MeeshyBackButton
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Destination d'un toucher sur une notification de story (iOS `StoryNotificationTargetScreen`) : le chargement
 * dessine un squelette, une story lisible ouvre le lecteur (l'hôte remplace cet écran), une story disparue ou
 * expirée dit pourquoi, hors ligne et panne serveur offrent « Réessayer » avec chacune sa phrase.
 */
@Composable
fun StoryNotificationTargetScreen(
    onClose: () -> Unit,
    onOpenViewer: (StoryNotificationTargetUiEffect.OpenViewer) -> Unit,
    onCreateStory: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: StoryNotificationTargetViewModel = hiltViewModel(),
) {
    val ui by viewModel.state.collectAsStateWithLifecycle()
    val openViewer by rememberUpdatedState(onOpenViewer)
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is StoryNotificationTargetUiEffect.OpenViewer -> openViewer(effect)
            }
        }
    }
    Box(modifier.fillMaxSize()) {
        when (ui.target) {
            StoryNotificationTargetState.Loading, is StoryNotificationTargetState.Active ->
                MeeshyShimmerPlaceholder(Modifier.fillMaxSize())
            StoryNotificationTargetState.Expired, StoryNotificationTargetState.ExpiredConsumed ->
                StoryExpiredContent(ui.context, ui.backgroundHex, ui.nowMillis, onCreateStory, onClose, Modifier)
            StoryNotificationTargetState.Offline -> FailureContent(ContentFetchFailure.NETWORK, viewModel, onClose, Modifier)
            StoryNotificationTargetState.ServerFailed -> FailureContent(ContentFetchFailure.SERVER, viewModel, onClose, Modifier)
        }
        MeeshyBackButton(onClick = onClose, modifier = Modifier.align(Alignment.TopStart).statusBarsPadding())
    }
}

@Composable
private fun FailureContent(
    failure: ContentFetchFailure,
    viewModel: StoryNotificationTargetViewModel,
    onClose: () -> Unit,
    modifier: Modifier,
) {
    MeeshyTheme(darkTheme = true) {
        Box(modifier.fillMaxSize().background(Color.Black.copy(alpha = MeeshyOpacity.intense))) {
            ContentFetchFailureView(
                failure = failure,
                onRetry = { viewModel.onEvent(StoryNotificationTargetUiEvent.Retry) },
                secondaryLabel = stringResource(R.string.story_notification_expired_back),
                onSecondary = onClose,
            )
        }
    }
}
