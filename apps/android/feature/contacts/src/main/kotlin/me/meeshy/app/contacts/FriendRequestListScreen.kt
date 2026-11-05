package me.meeshy.app.contacts

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.ui.component.ConnectionFeedbackHost
import me.meeshy.ui.component.chrome.CollapsibleHeader
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * L'écran autonome « Demandes d'amis » (iso `FriendRequestListView`, route `friends/requests`) : en-tête repliable,
 * les deux directions de [RequestsContent], et — à l'ouverture — les notifications de demande et d'acceptation
 * passent à lues.
 */
@Composable
fun FriendRequestListScreen(
    onBack: () -> Unit,
    onOpenProfile: (userId: String) -> Unit,
    viewModel: RequestsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    var scrollOffsetDp by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) { viewModel.markNotificationsRead() }
    MeeshyBackground {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize()) {
                CollapsibleHeader(
                    title = stringResource(R.string.friends_requests_title),
                    scrollOffsetDp = scrollOffsetDp,
                    onBack = onBack,
                )
                RequestsContent(
                    state = state,
                    onSelect = {
                        haptics.light()
                        viewModel.selectDirection(it)
                    },
                    onAccept = viewModel::accept,
                    onDecline = viewModel::decline,
                    onCancel = viewModel::cancel,
                    onRefresh = viewModel::refresh,
                    onLoadMore = viewModel::loadMore,
                    onOpenProfile = onOpenProfile,
                    onScrollOffsetDp = { scrollOffsetDp = it },
                )
            }
            ConnectionFeedbackHost(feedback = viewModel.feedback)
        }
    }
}
