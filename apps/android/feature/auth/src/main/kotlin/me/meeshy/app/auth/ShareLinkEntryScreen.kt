package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The share-link deep-link route. Instead of always presenting the anonymous join
 * form, it first asks [ShareLinkEntryViewModel] how the person should enter and
 * renders the answer: it opens the conversation straight away when there is nothing
 * to decide, asks which identity to use when the choice is genuinely theirs, steers
 * an account-only link to sign-in, and only falls to the guest form when a
 * temporary identity is the right path. Every decidable branch lives in the
 * ViewModel; this is the presentation of its [ShareLinkEntryUiState].
 *
 * Port of the iOS `RootView.resolveShareLinkEntry` presentation, unified here for
 * both authenticated and unauthenticated entry.
 */
@Composable
fun ShareLinkEntryScreen(
    onOpenConversation: (String) -> Unit,
    onJoined: () -> Unit,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    viewModel: ShareLinkEntryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    when (val current = state) {
        ShareLinkEntryUiState.GuestForm ->
            GuestJoinScreen(onJoined = onJoined, onBack = onBack, onSignIn = onSignIn)

        is ShareLinkEntryUiState.OpenConversation ->
            EntryScaffold(onBack = onBack) {
                LaunchedEffect(current.conversationId) { onOpenConversation(current.conversationId) }
                ResolvingBody()
            }

        ShareLinkEntryUiState.RequiresAccount ->
            EntryScaffold(onBack = onBack) { RequiresAccountBody(onSignIn = onSignIn) }

        is ShareLinkEntryUiState.ChooseIdentity ->
            EntryScaffold(onBack = onBack) {
                ChooseIdentityBody(
                    state = current,
                    onContinueWithAccount = viewModel::chooseAccount,
                    onJoinAnonymously = viewModel::chooseAnonymous,
                )
            }

        is ShareLinkEntryUiState.Failed ->
            EntryScaffold(onBack = onBack) {
                FailedBody(message = current.message, onRetry = viewModel::resolve)
            }

        ShareLinkEntryUiState.Resolving ->
            EntryScaffold(onBack = onBack) { ResolvingBody() }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EntryScaffold(onBack: () -> Unit, content: @Composable () -> Unit) {
    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.guest_join_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.guest_join_back),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                content()
            }
        }
    }
}

@Composable
private fun ResolvingBody() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        CircularProgressIndicator(color = MeeshyPalette.Indigo500)
        Text(
            text = stringResource(R.string.share_link_entry_resolving),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun RequiresAccountBody(onSignIn: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.guest_join_requires_account),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        MeeshyPrimaryButton(
            text = stringResource(R.string.guest_join_sign_in),
            onClick = onSignIn,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ChooseIdentityBody(
    state: ShareLinkEntryUiState.ChooseIdentity,
    onContinueWithAccount: () -> Unit,
    onJoinAnonymously: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.share_link_choose_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        Text(
            text = state.conversationTitle?.takeIf { it.isNotBlank() }?.let {
                stringResource(R.string.share_link_choose_subtitle, it)
            } ?: stringResource(R.string.share_link_choose_subtitle_generic),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        MeeshyPrimaryButton(
            text = stringResource(R.string.share_link_continue_with_account),
            onClick = onContinueWithAccount,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedButton(
            onClick = onJoinAnonymously,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                stringResource(
                    if (state.resumesGuestSession) {
                        R.string.share_link_resume_anonymously
                    } else {
                        R.string.share_link_join_anonymously
                    },
                ),
            )
        }
    }
}

@Composable
private fun FailedBody(message: String?, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.guest_join_preview_error),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        message?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
        }
        OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.guest_join_retry)) }
    }
}
