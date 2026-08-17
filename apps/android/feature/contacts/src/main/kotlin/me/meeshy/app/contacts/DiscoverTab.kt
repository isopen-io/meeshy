package me.meeshy.app.contacts

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.friend.ConnectAction
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.MeeshyPalette

/**
 * The Discover tab — live user search with an inline connect control per result,
 * driven by [DiscoverViewModel]. Port of the iOS `DiscoverTab` search section:
 * the connect button's state is the shared relationship resolver, so it stays in
 * lock-step with the Requests tab and any other surface.
 */
@Composable
fun DiscoverTab(
    viewModel: DiscoverViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // Cache-first suggestions paint on appear (iOS `.task { loadSuggestions() }`).
    LaunchedEffect(Unit) { viewModel.loadSuggestions() }

    Column(modifier = Modifier.fillMaxSize()) {
        EmailInviteCard(
            emailText = state.emailText,
            isSending = state.isSendingInvite,
            errorMessage = state.inviteErrorMessage,
            onEmailTextChanged = viewModel::onEmailTextChanged,
            onSend = viewModel::sendEmailInvitation,
        )
        SmsInviteCard(
            phoneText = state.phoneText,
            onPhoneTextChanged = viewModel::onPhoneTextChanged,
        )

        OutlinedTextField(
            value = state.query,
            onValueChange = viewModel::onQueryChanged,
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.contacts_discover_search_hint)) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )

        when {
            state.isLoading -> Centered { CircularProgressIndicator() }
            state.errorMessage != null -> ErrorState(onRetry = viewModel::retry)
            state.isSuggestionsEmpty -> EmptyMessage(stringResource(R.string.contacts_discover_suggestions_empty))
            state.showEmptyPrompt -> EmptyMessage(stringResource(R.string.contacts_discover_prompt))
            state.isNoResults -> EmptyMessage(stringResource(R.string.contacts_discover_no_results))
            else -> ResultList(
                header = stringResource(R.string.contacts_discover_suggestions_title)
                    .takeIf { state.isShowingSuggestions },
                rows = state.rows,
                pendingIds = state.pendingActionIds,
                onConnect = viewModel::connect,
                onAccept = viewModel::acceptReceived,
            )
        }
    }
}

/**
 * Port of iOS `DiscoverTab.emailInviteCard` — invite by email. Feedback is
 * implicit (field clears + button disables on success) since Android has no
 * toast/snackbar infrastructure yet; a network failure surfaces inline.
 */
@Composable
private fun EmailInviteCard(
    emailText: String,
    isSending: Boolean,
    errorMessage: String?,
    onEmailTextChanged: (String) -> Unit,
    onSend: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Email, contentDescription = null, modifier = Modifier.width(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                text = stringResource(R.string.contacts_discover_email_title),
                style = MaterialTheme.typography.labelLarge,
            )
        }
        Spacer(Modifier.width(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = emailText,
                onValueChange = onEmailTextChanged,
                singleLine = true,
                placeholder = { Text(stringResource(R.string.contacts_discover_email_placeholder)) },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    capitalization = KeyboardCapitalization.None,
                    autoCorrectEnabled = false,
                ),
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(10.dp))
            val sendAccessibilityLabel = stringResource(R.string.contacts_discover_email_send_a11y)
            Button(
                onClick = onSend,
                enabled = emailText.isNotEmpty() && !isSending,
                modifier = Modifier.semantics { contentDescription = sendAccessibilityLabel },
            ) {
                Text(stringResource(R.string.contacts_discover_email_send))
            }
        }
        errorMessage?.let {
            Text(
                text = stringResource(R.string.contacts_discover_email_error),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyPalette.Error,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

/**
 * Port of iOS `DiscoverTab.smsInviteCard` — invite by SMS. Unlike email, this is a pure
 * client-side hand-off: no network call, just the OS SMS composer pre-filled with the number
 * and a fixed invite message (mirrors iOS `smsMessage`, deliberately not localized — same as
 * iOS's own hardcoded literal). A missing SMS handler (no telephony, e.g. a tablet/emulator)
 * degrades to a no-op rather than a crash, the same guarded-launch idiom as `ChatLinkOpener`.
 */
@Composable
private fun SmsInviteCard(
    phoneText: String,
    onPhoneTextChanged: (String) -> Unit,
) {
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Sms, contentDescription = null, modifier = Modifier.width(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                text = stringResource(R.string.contacts_discover_sms_title),
                style = MaterialTheme.typography.labelLarge,
            )
        }
        Spacer(Modifier.width(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = phoneText,
                onValueChange = onPhoneTextChanged,
                singleLine = true,
                placeholder = { Text(stringResource(R.string.contacts_discover_sms_placeholder)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(10.dp))
            val sendAccessibilityLabel = stringResource(R.string.contacts_discover_sms_send_a11y)
            Button(
                onClick = { sendSmsInvite(context, phoneText) },
                enabled = phoneText.isNotEmpty(),
                modifier = Modifier.semantics { contentDescription = sendAccessibilityLabel },
            ) {
                Text(stringResource(R.string.contacts_discover_sms_send))
            }
        }
    }
}

private fun sendSmsInvite(context: Context, phoneNumber: String) {
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$phoneNumber")).apply {
                putExtra("sms_body", SMS_INVITE_MESSAGE)
            },
        )
    }
}

/** Port of iOS `DiscoverViewModel.smsMessage` — a fixed invite text, deliberately not localized. */
private const val SMS_INVITE_MESSAGE = "Rejoins-moi sur Meeshy ! Telecharge l'app : https://meeshy.me/download"

@Composable
private fun ResultList(
    header: String?,
    rows: List<DiscoverRow>,
    pendingIds: Set<String>,
    onConnect: (String) -> Unit,
    onAccept: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(vertical = 8.dp),
    ) {
        header?.let {
            item(key = "__header__") {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
        }
        items(rows, key = { it.user.id }) { row ->
            ResultRow(
                row = row,
                pending = row.user.id in pendingIds,
                onConnect = { onConnect(row.user.id) },
                onAccept = { onAccept(row.user.id) },
            )
        }
    }
}

@Composable
private fun ResultRow(
    row: DiscoverRow,
    pending: Boolean,
    onConnect: () -> Unit,
    onAccept: () -> Unit,
) {
    val user = row.user
    val name = user.displayName?.takeIf { it.isNotBlank() } ?: user.username.ifBlank { "?" }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = name,
            size = 44.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(user.id.ifBlank { name })),
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            user.username.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = "@$it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        ConnectControl(action = row.connect, pending = pending, onConnect = onConnect, onAccept = onAccept)
    }
}

@Composable
private fun ConnectControl(
    action: ConnectAction,
    pending: Boolean,
    onConnect: () -> Unit,
    onAccept: () -> Unit,
) {
    when (action) {
        is ConnectAction.Connect -> FilledTonalButton(onClick = onConnect, enabled = !pending) {
            Icon(Icons.Filled.PersonAdd, contentDescription = null, modifier = Modifier.width(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(stringResource(R.string.contacts_discover_connect))
        }
        is ConnectAction.Accept -> FilledTonalButton(onClick = onAccept, enabled = !pending) {
            Text(stringResource(R.string.contacts_request_accept))
        }
        is ConnectAction.Pending -> OutlinedButton(onClick = {}, enabled = false) {
            Text(stringResource(R.string.contacts_discover_pending))
        }
        is ConnectAction.Contact -> Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Filled.Check,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.width(18.dp),
            )
            Spacer(Modifier.width(4.dp))
            Text(
                text = stringResource(R.string.contacts_discover_contact),
                style = MaterialTheme.typography.labelLarge,
                color = MeeshyPalette.Indigo500,
            )
        }
        is ConnectAction.Blocked -> Text(
            text = stringResource(R.string.contacts_discover_blocked),
            style = MaterialTheme.typography.labelLarge,
            color = MeeshyPalette.Error,
        )
        is ConnectAction.Hidden -> Unit
    }
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Centered {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.contacts_discover_error),
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Spacer(Modifier.width(12.dp))
            OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.contacts_list_retry)) }
        }
    }
}

@Composable
private fun EmptyMessage(message: String) {
    Centered {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(32.dp),
        )
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}
