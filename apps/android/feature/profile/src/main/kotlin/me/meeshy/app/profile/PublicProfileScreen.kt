package me.meeshy.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.feature.profile.R
import me.meeshy.ui.component.ConnectionFeedbackHost
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.FeedbackToastRequest
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La page d'un TIERS (`profile/{userId}`), comportement herite et conserve jusqu'a la
 * feuille profil : sa fiche, le partage, les actions de mise en relation et Signaler.
 * Jamais d'edition ni de televersement — ils n'appartiennent qu'a [OwnProfileScreen].
 */
@Composable
fun PublicProfileScreen(
    onBack: () -> Unit,
    onReport: (userId: String, username: String) -> Unit = { _, _ -> },
    onViewPosts: (userId: String) -> Unit = {},
    onOpenConversation: (conversationId: String) -> Unit = {},
    viewModel: PublicProfileViewModel = hiltViewModel(),
    actionsViewModel: ProfileActionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val actionsState by actionsViewModel.state.collectAsStateWithLifecycle()
    val actionToasts = remember { MutableSharedFlow<FeedbackToastRequest>(extraBufferCapacity = 4) }
    val viewedUser = state.user
    LaunchedEffect(viewedUser?.id) {
        val user = viewedUser ?: return@LaunchedEffect
        val id = user.id.takeIf { it.isNotBlank() } ?: return@LaunchedEffect
        actionsViewModel.bind(id, isAnonymous = user.isAnonymous == true)
    }
    LaunchedEffect(actionsViewModel) {
        actionsViewModel.events.collect { event ->
            when (event) {
                is ProfileActionEvent.OpenConversation -> onOpenConversation(event.conversationId)
                is ProfileActionEvent.Toast -> actionToasts.tryEmit(event.feedback.toToastRequest())
            }
        }
    }
    val snackbar = remember { SnackbarHostState() }
    var isSharing by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { snackbar.showSnackbar(it) }
    }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                ProfileTopBar(onBack = onBack) {
                    if (state.user?.let(ProfileShareBuilder::build) != null) {
                        IconButton(onClick = { isSharing = true }) {
                            Icon(Icons.Default.Share, contentDescription = stringResource(R.string.profile_share_action))
                        }
                    }
                }
            },
            snackbarHost = { SnackbarHost(snackbar) },
        ) { padding ->
            if (state.isLoading) {
                Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                return@Scaffold
            }
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(MeeshySpacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                val user = state.user
                val header = remember(user) { user?.let { ProfileHeaderBuilder.build(it, System.currentTimeMillis()) } }
                user?.let { ProfileBanner(user = it) }
                ProfileAvatar(user = user, header = header)
                ProfileReadOnlyBody(
                    userId = user?.id,
                    header = header,
                    stats = state.stats,
                    timeline = null,
                    onViewPosts = onViewPosts,
                    actions = {
                        val plan = actionsState.plan
                        if (user != null && plan != null) {
                            Spacer(Modifier.height(MeeshySpacing.sm))
                            ProfileActionsSection(
                                plan = plan,
                                displayName = header?.displayName ?: user.username,
                                isOpeningConversation = actionsState.isOpeningConversation,
                                callbacks = ProfileActionCallbacks(
                                    onSendMessage = actionsViewModel::sendMessage,
                                    onRequest = actionsViewModel::requestConnection,
                                    onCancel = actionsViewModel::cancelConnection,
                                    onResend = actionsViewModel::resendConnection,
                                    onAccept = actionsViewModel::acceptConnection,
                                    onDecline = actionsViewModel::declineConnection,
                                    onBlock = actionsViewModel::block,
                                    onUnblock = actionsViewModel::unblock,
                                    onReport = { onReport(user.id, user.username) },
                                ),
                            )
                        }
                    },
                )
            }
        }

        ConnectionFeedbackHost(feedback = actionsViewModel.connectionFeedback)
        FeedbackToastHost(toasts = actionToasts)
    }

    if (isSharing) {
        state.user?.let(ProfileShareBuilder::build)?.let { share ->
            ProfileShareSheet(share = share, onDismiss = { isSharing = false })
        }
    }
}

private fun ProfileActionFeedback.toToastRequest(): FeedbackToastRequest = FeedbackToastRequest(
    messageRes = when (this) {
        ProfileActionFeedback.UserBlocked -> R.string.profile_toast_user_blocked
        ProfileActionFeedback.BlockFailed -> R.string.profile_toast_block_failed
        ProfileActionFeedback.UserUnblocked -> R.string.profile_toast_user_unblocked
        ProfileActionFeedback.UnblockFailed -> R.string.profile_toast_unblock_failed
        ProfileActionFeedback.OpenConversationFailed -> R.string.profile_open_conversation_error
    },
    kind = if (isError) FeedbackKind.Error else FeedbackKind.Success,
)
