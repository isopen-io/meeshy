package me.meeshy.app.contacts

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.ConnectionFeedbackHost
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.component.people.ConnectControl
import me.meeshy.ui.component.people.PeopleListSkeleton
import me.meeshy.ui.component.people.PersonAvatar
import me.meeshy.ui.component.people.PeopleSearchField
import me.meeshy.ui.component.people.ScrollOffsetReporter
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'onglet Découvrir (iOS `DiscoverTab`) : cartes d'invitation e-mail puis SMS, recherche d'utilisateurs
 * Meeshy et suggestions cache-first. Les connexions passent par le coordinateur partagé via
 * [DiscoverViewModel] ; [isActive] / [onCollapseProgressChange] rapportent le repli d'en-tête du hub.
 */
@Composable
fun DiscoverTab(
    onOpenProfile: (String) -> Unit = {},
    isActive: Boolean = true,
    onCollapseProgressChange: (Float) -> Unit = {},
    viewModel: DiscoverViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current

    LaunchedEffect(state.isSearchActive) { if (!state.isSearchActive) viewModel.loadSuggestions() }
    LaunchedEffect(viewModel, haptics) {
        viewModel.effects.collect { effect ->
            when (effect) {
                DiscoverEffect.Success -> haptics.success()
                DiscoverEffect.Failure -> haptics.error()
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        DiscoverContent(
            state = state,
            isActive = isActive,
            onCollapseProgressChange = onCollapseProgressChange,
            onQueryChanged = viewModel::onQueryChanged,
            onEmailChanged = viewModel::onEmailTextChanged,
            onSendEmail = viewModel::sendEmailInvitation,
            onPhoneChanged = viewModel::onPhoneTextChanged,
            onSendSms = {
                if (!sendSmsInvite(context, state.phoneText)) viewModel.onSmsUnavailable()
            },
            onRefresh = viewModel::refresh,
            onRetry = viewModel::retry,
            onAdd = viewModel::connect,
            onAccept = viewModel::acceptReceived,
            onDecline = viewModel::decline,
            onCancel = viewModel::cancel,
            onOpenProfile = onOpenProfile,
        )
        ConnectionFeedbackHost(feedback = viewModel.connectionFeedback)
    }
}

/** La projection pure de l'écran : ordre carte e-mail, carte SMS, recherche, puis résultats ou état vide. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DiscoverContent(
    state: DiscoverUiState,
    isActive: Boolean,
    onCollapseProgressChange: (Float) -> Unit,
    onQueryChanged: (String) -> Unit,
    onEmailChanged: (String) -> Unit,
    onSendEmail: () -> Unit,
    onPhoneChanged: (String) -> Unit,
    onSendSms: () -> Unit,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onAdd: (String) -> Unit,
    onAccept: (String) -> Unit,
    onDecline: (String) -> Unit,
    onCancel: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    val listState: LazyListState = rememberLazyListState()
    ScrollOffsetReporter(state = listState, active = isActive, onProgress = onCollapseProgressChange)

    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = MeeshySpacing.sm, bottom = MeeshySpacing.xxxl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            item(key = "invite-email", contentType = "invite") {
                EmailInviteCard(state.emailText, state.isSendingInvite, onEmailChanged, onSendEmail)
            }
            item(key = "invite-sms", contentType = "invite") {
                SmsInviteCard(state.phoneText, onPhoneChanged, onSendSms)
            }
            item(key = "search", contentType = "search") {
                PeopleSearchField(
                    query = state.query,
                    onQueryChange = onQueryChanged,
                    placeholder = stringResource(R.string.contacts_discover_search_hint),
                    modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
                )
            }
            resultsSection(state, onRetry, onAdd, onAccept, onDecline, onCancel, onOpenProfile)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.resultsSection(
    state: DiscoverUiState,
    onRetry: () -> Unit,
    onAdd: (String) -> Unit,
    onAccept: (String) -> Unit,
    onDecline: (String) -> Unit,
    onCancel: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    when {
        state.isLoading && state.rows.isEmpty() -> item(key = "loading", contentType = "state") {
            if (state.isSearchActive) SearchSpinner() else PeopleListSkeleton()
        }
        state.errorMessage != null && state.rows.isEmpty() -> item(key = "error", contentType = "state") {
            ErrorState(onRetry)
        }
        state.isNoResults -> item(key = "no-results", contentType = "state") {
            NoResults()
        }
        state.isSuggestionsEmpty -> item(key = "suggestions-empty", contentType = "state") {
            Hint(stringResource(R.string.contacts_discover_suggestions_empty))
        }
        state.showEmptyPrompt -> item(key = "prompt", contentType = "state") {
            Hint(stringResource(R.string.contacts_discover_prompt))
        }
        else -> {
            if (state.isShowingSuggestions) {
                item(key = "suggestions-title", contentType = "title") {
                    Text(
                        text = stringResource(R.string.contacts_discover_suggestions_title),
                        fontSize = MeeshyFontSize.label,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textSecondary,
                        modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
                    )
                }
            }
            items(count = state.rows.size, key = { state.rows[it].user.id }, contentType = { "person" }) { index ->
                val row = state.rows[index]
                CascadeIn(index = index) {
                    ResultRow(
                        row = row,
                        onAdd = { onAdd(row.user.id) },
                        onAccept = { onAccept(row.user.id) },
                        onDecline = { onDecline(row.user.id) },
                        onCancel = { onCancel(row.user.id) },
                        onOpenProfile = { onOpenProfile(row.user.id) },
                    )
                }
            }
        }
    }
}

/** Retard d'apparition de la ligne [index] dans la cascade (iOS `.delay(Double(index) * 0.04)`). */
internal fun cascadeDelayMillis(index: Int): Long = index.coerceAtLeast(0) * CASCADE_STEP_MILLIS

private const val CASCADE_STEP_MILLIS = 40L

/** Apparition en ressort (réponse 0,4 / amortissement 0,8) décalée par rang ; sans mouvement si l'utilisateur le réduit. */
@Composable
private fun CascadeIn(index: Int, content: @Composable () -> Unit) {
    val reduce = LocalReduceMotion.current
    val progress = remember { Animatable(if (reduce) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (reduce) return@LaunchedEffect
        kotlinx.coroutines.delay(cascadeDelayMillis(index.coerceAtMost(CASCADE_MAX_INDEX)))
        progress.animateTo(1f, spring(dampingRatio = 0.8f, stiffness = 400f))
    }
    Box(
        modifier = Modifier.graphicsLayer {
            alpha = progress.value
            translationY = (1f - progress.value) * CASCADE_RISE_PX
        },
    ) { content() }
}

private const val CASCADE_MAX_INDEX = 12
private const val CASCADE_RISE_PX = 24f

@Composable
private fun InviteCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    content: @Composable () -> Unit,
) {
    MeeshyGlassSurface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg),
        shape = RoundedCornerShape(MeeshyRadius.lg),
    ) {
        Column(
            modifier = Modifier.padding(MeeshySpacing.mdPlus),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
                Icon(icon, contentDescription = null, tint = MeeshyTheme.tokens.textPrimary, modifier = Modifier.size(18.dp))
                Text(title, fontSize = MeeshyFontSize.label, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
            }
            content()
        }
    }
}

@Composable
private fun EmailInviteCard(
    emailText: String,
    isSending: Boolean,
    onEmailChanged: (String) -> Unit,
    onSend: () -> Unit,
) {
    InviteCard(Icons.Filled.Email, stringResource(R.string.contacts_discover_email_title)) {
        InviteField(
            value = emailText,
            onValueChange = onEmailChanged,
            placeholder = stringResource(R.string.contacts_discover_email_placeholder),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                capitalization = KeyboardCapitalization.None,
                autoCorrectEnabled = false,
            ),
            sendLabel = stringResource(R.string.contacts_discover_email_send),
            sendDescription = stringResource(R.string.contacts_discover_email_send_a11y),
            enabled = emailText.isNotEmpty() && !isSending,
            onSend = onSend,
        )
    }
}

@Composable
private fun SmsInviteCard(phoneText: String, onPhoneChanged: (String) -> Unit, onSend: () -> Unit) {
    InviteCard(Icons.Filled.Sms, stringResource(R.string.contacts_discover_sms_title)) {
        InviteField(
            value = phoneText,
            onValueChange = onPhoneChanged,
            placeholder = stringResource(R.string.contacts_discover_sms_placeholder),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            sendLabel = stringResource(R.string.contacts_discover_sms_send),
            sendDescription = stringResource(R.string.contacts_discover_sms_send_a11y),
            enabled = phoneText.isNotEmpty(),
            onSend = onSend,
        )
    }
}

@Composable
private fun InviteField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    keyboardOptions: KeyboardOptions,
    sendLabel: String,
    sendDescription: String,
    enabled: Boolean,
    onSend: () -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        Box(
            modifier = Modifier
                .weight(1f)
                .background(tokens.inputBackground, RoundedCornerShape(MeeshyRadius.sm))
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.smPlus),
        ) {
            if (value.isEmpty()) Text(placeholder, color = tokens.textMuted, fontSize = MeeshyFontSize.label)
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = TextStyle(color = tokens.textPrimary, fontSize = MeeshyFontSize.label),
                cursorBrush = SolidColor(MeeshyPalette.Indigo500),
                keyboardOptions = keyboardOptions,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Box(
            modifier = Modifier
                .heightIn(min = MeeshyControlSize.minTouchTarget)
                .alpha(if (enabled) 1f else DISABLED_ALPHA)
                .background(MeeshyPalette.Indigo500, RoundedCornerShape(MeeshyRadius.pill))
                .clickable(enabled = enabled, role = Role.Button, onClick = onSend)
                .padding(horizontal = MeeshySpacing.mdPlus)
                .semantics { contentDescription = sendDescription },
            contentAlignment = Alignment.Center,
        ) {
            Text(sendLabel, color = Color.White, fontSize = MeeshyFontSize.caption, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Capsule indigo désactivée à 40 % d'opacité (iOS `indigo500.opacity(0.4)`). */
internal const val DISABLED_ALPHA = 0.4f

/** Ouvre l'application SMS avec le texte littéral iOS ; `false` quand aucune ne répond (jamais de plantage). */
private fun sendSmsInvite(context: Context, phoneNumber: String): Boolean =
    try {
        context.startActivity(
            Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$phoneNumber"))
                .putExtra("sms_body", SMS_INVITE_MESSAGE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        true
    } catch (_: ActivityNotFoundException) {
        false
    }

/** Port de `DiscoverViewModel.smsMessage` : texte fixe, volontairement non localisé comme sur iOS. */
internal const val SMS_INVITE_MESSAGE = "Rejoins-moi sur Meeshy ! Telecharge l'app : https://meeshy.me/download"

@Composable
internal fun ResultRow(
    row: DiscoverRow,
    onAdd: () -> Unit,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    val user: UserSearchResult = row.user
    val name = user.displayName?.takeIf { it.isNotBlank() } ?: user.username.ifBlank { "?" }
    val viewProfile = stringResource(R.string.contacts_discover_view_profile)
    val canOpen = user.id.isNotBlank()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clickable(enabled = canOpen, role = Role.Button, onClickLabel = viewProfile, onClick = onOpenProfile),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
        ) {
            PersonAvatar(
                name = name,
                imageUrl = user.avatar,
                presence = rememberPresence(user.id, user.servedPresence()),
                userId = user.id.ifBlank { null },
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = name,
                    fontSize = MeeshyFontSize.label,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                user.username.takeIf { it.isNotBlank() }?.let {
                    Text(
                        text = "@$it",
                        fontSize = MeeshyFontSize.caption,
                        color = MeeshyTheme.tokens.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        ConnectControl(
            action = row.connect,
            userName = name,
            accent = MeeshyPalette.Indigo500,
            onAdd = onAdd,
            onAccept = onAccept,
            onDecline = onDecline,
            onCancel = onCancel,
        )
    }
}

@Composable
private fun SearchSpinner() {
    Box(Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = MeeshyPalette.Indigo500)
    }
}

@Composable
private fun NoResults() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.xxxl)
            .semantics(mergeDescendants = true) { },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(
            Icons.Filled.Search,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted.copy(alpha = DISABLED_ALPHA),
            modifier = Modifier.size(40.dp),
        )
        Text(
            text = stringResource(R.string.contacts_discover_no_results),
            fontSize = MeeshyFontSize.label,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}

@Composable
private fun Hint(message: String) {
    Text(
        text = message,
        fontSize = MeeshyFontSize.label,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xxxl),
    )
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.contacts_discover_error),
            fontSize = MeeshyFontSize.label,
            color = MeeshyTheme.tokens.textSecondary,
        )
        OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.contacts_list_retry)) }
    }
}
