package me.meeshy.app.conversations

import me.meeshy.ui.icons.MeeshyIcons
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.InviteLinkDefaults
import me.meeshy.sdk.model.InvitePermission
import me.meeshy.sdk.model.InviteLinkSummary
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Ce que la carte dit de la conversation : l'accent arrive en paramètre, jamais recalculé ici. */
@Immutable
data class InviteConversationInfo(val name: String, val memberCount: Int, val type: String)

private const val SHEET_MAX_WIDTH_DP = 560
private const val CARD_STROKE_ALPHA = 0.15f
private const val CHIP_FILL_ALPHA = 0.08f
private const val SHARE_GRADIENT_END_ALPHA = 0.8f
private const val EXPAND_MILLIS = 300

/** Feuille « Inviter » : le lien se crée dès l'ouverture, `onDismiss` la ferme. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun InviteFriendsSheet(
    conversationId: String,
    info: InviteConversationInfo,
    accent: Color,
    onDismiss: () -> Unit,
    viewModel: InviteFriendsViewModel = hiltViewModel(key = conversationId),
) {
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val texts = InviteTexts(
        defaultMessage = stringResource(R.string.invite_defaultMessage),
        defaultLinkName = InviteLinkDefaults.defaultLinkName(stringResource(R.string.invite_defaultLinkName), info.name),
    )
    LaunchedEffect(viewModel, conversationId) { viewModel.start(conversationId, texts) }
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                InviteFriendsUiEffect.SuccessHaptic -> haptics.success()
                is InviteFriendsUiEffect.CopyToClipboard -> copyToClipboard(context, effect.url)
                is InviteFriendsUiEffect.OpenChooser -> openChooser(context, effect)
            }
        }
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        sheetMaxWidth = SHEET_MAX_WIDTH_DP.dp,
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        InviteFriendsContent(state = state, info = info, texts = texts, accent = accent, onEvent = viewModel::onEvent)
    }
}

/** La projection : deux phases (aperçu, puis options dépliées) sur un seul état. */
@Composable
internal fun InviteFriendsContent(
    state: InviteFriendsUiState,
    info: InviteConversationInfo,
    texts: InviteTexts,
    accent: Color,
    onEvent: (InviteFriendsUiEvent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val draft = state.draft ?: return
    Column(
        modifier = modifier
            .widthIn(max = SHEET_MAX_WIDTH_DP.dp)
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.lg)
            .padding(bottom = MeeshySpacing.xxl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        Text(
            stringResource(R.string.invite_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        InviteCard(state, info, texts, accent, onEvent)
        state.summary?.let { InviteSummaryRow(it) }
        InviteShareButton(state, accent) { onEvent(InviteFriendsUiEvent.Share) }
        state.errorMessage?.let { InviteErrorRow(it) }
        if (!state.showOptions) {
            val customizeLabel = stringResource(R.string.invite_a11y_customizeOptions)
            TextButton(
                onClick = { onEvent(InviteFriendsUiEvent.ToggleOptions) },
                modifier = Modifier.align(Alignment.CenterHorizontally).semantics { contentDescription = customizeLabel },
            ) {
                Icon(MeeshyIcons.Tune, contentDescription = null, modifier = Modifier.size(16.dp))
                Text(stringResource(R.string.invite_customize), modifier = Modifier.padding(start = MeeshySpacing.xsPlus))
            }
        }
        AnimatedVisibility(
            visible = state.showOptions,
            enter = expandVertically(tween(EXPAND_MILLIS)) + fadeIn(tween(EXPAND_MILLIS)),
            exit = shrinkVertically(tween(EXPAND_MILLIS)) + fadeOut(tween(EXPAND_MILLIS)),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
                InviteFriendsOptionsPanel(draft, texts.defaultLinkName, accent, onEvent)
                TextButton(onClick = { onEvent(InviteFriendsUiEvent.ToggleOptions) }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                    Text(stringResource(R.string.invite_hideOptions))
                }
            }
        }
    }
}

@Composable
private fun InviteCard(
    state: InviteFriendsUiState,
    info: InviteConversationInfo,
    texts: InviteTexts,
    accent: Color,
    onEvent: (InviteFriendsUiEvent) -> Unit,
) {
    val shape = RoundedCornerShape(MeeshyRadius.xl)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(MeeshyTheme.tokens.surfaceFill)
            .border(1.dp, accent.copy(alpha = CARD_STROKE_ALPHA), shape)
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        InviteCardHeader(info, accent)
        Text(
            stringResource(R.string.invite_messageLabel).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textMuted,
        )
        OutlinedTextField(
            value = state.draft?.message.orEmpty(),
            onValueChange = { onEvent(InviteFriendsUiEvent.EditMessage(it)) },
            placeholder = { Text(texts.defaultMessage) },
            minLines = 2,
            maxLines = 4,
            modifier = Modifier.fillMaxWidth(),
        )
        InviteLinkChip(state, accent, onEvent)
    }
}

@Composable
private fun InviteCardHeader(info: InviteConversationInfo, accent: Color) {
    Row(
        modifier = Modifier.semantics(mergeDescendants = true) { },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Box(
            modifier = Modifier.size(44.dp).clip(CircleShape).background(accent.copy(alpha = CARD_STROKE_ALPHA)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(info.type.inviteIcon(), contentDescription = null, tint = accent, modifier = Modifier.size(22.dp))
        }
        Column {
            Text(
                info.name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "${info.memberCount} ${stringResource(R.string.invite_members)} · ${stringResource(info.type.inviteTypeLabelRes())}",
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun InviteLinkChip(state: InviteFriendsUiState, accent: Color, onEvent: (InviteFriendsUiEvent) -> Unit) {
    val url = state.joinUrl
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    val copyLabel = stringResource(R.string.invite_a11y_copyLink)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(shape)
            .background(accent.copy(alpha = CHIP_FILL_ALPHA))
            .clickable(enabled = url != null, onClickLabel = copyLabel, role = Role.Button) { onEvent(InviteFriendsUiEvent.Copy) }
            .padding(MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(MeeshyIcons.Link, contentDescription = null, tint = accent, modifier = Modifier.size(16.dp))
        when {
            url != null -> {
                Text(
                    url,
                    style = MaterialTheme.typography.bodyMedium,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Medium,
                    color = accent,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                CopyPill(copied = state.copied, accent = accent)
            }
            state.phase == InviteLinkPhase.Failed -> {
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { onEvent(InviteFriendsUiEvent.Retry) }) { Text(stringResource(R.string.invite_retry)) }
            }
            else -> {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = accent)
                Text(
                    stringResource(R.string.invite_creatingLink),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textMuted,
                )
            }
        }
    }
}

@Composable
private fun CopyPill(copied: Boolean, accent: Color) {
    Text(
        stringResource(if (copied) R.string.invite_copied else R.string.invite_copy),
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Bold,
        color = Color.White,
        modifier = Modifier
            .clip(CircleShape)
            .background(if (copied) MeeshyTheme.tokens.success else accent)
            .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xs),
    )
}

@Composable
private fun InviteSummaryRow(summary: InviteLinkSummary) {
    val expiration = stringResource(summary.expiration.labelRes())
    val permissionNames = summary.permissions.map { stringResource(it.labelRes()) }
    val head = stringResource(R.string.invite_a11y_summary_expiration, expiration)
    val spoken = if (permissionNames.isEmpty()) {
        stringResource(R.string.invite_a11y_summary_noPermissions, head)
    } else {
        stringResource(R.string.invite_a11y_summary_permissions, head, permissionNames.joinToString(", "))
    }
    Row(
        modifier = Modifier
            .padding(horizontal = MeeshySpacing.xs)
            .clearAndSetSemantics { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(MeeshyIcons.ScheduleFilled, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(14.dp))
        Text(expiration, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = MeeshyTheme.tokens.textSecondary)
        summary.permissions.forEach { permission ->
            Icon(permission.icon(), contentDescription = null, tint = MeeshyTheme.tokens.success, modifier = Modifier.size(12.dp))
        }
    }
}

@Composable
private fun InviteShareButton(state: InviteFriendsUiState, accent: Color, onShare: () -> Unit) {
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    val label = stringResource(R.string.invite_a11y_shareLink)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(shape)
            .background(Brush.horizontalGradient(listOf(accent, accent.copy(alpha = SHARE_GRADIENT_END_ALPHA))))
            .clickable(enabled = state.canShare, onClickLabel = label, role = Role.Button, onClick = onShare)
            .semantics { if (!state.canShare) disabled() }
            .padding(vertical = MeeshySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (state.isCreating && state.joinUrl == null) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
        } else {
            Icon(MeeshyIcons.ShareFilled, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
        }
        Text(
            stringResource(R.string.invite_share),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.padding(start = MeeshySpacing.smPlus),
        )
    }
}

@Composable
private fun InviteErrorRow(message: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        Icon(MeeshyIcons.WarningFilled, contentDescription = null, tint = MeeshyTheme.tokens.error, modifier = Modifier.size(16.dp))
        Text(message, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.error)
    }
}

private fun InvitePermission.labelRes(): Int = when (this) {
    InvitePermission.Messages -> R.string.invite_perm_messages
    InvitePermission.Images -> R.string.invite_perm_images
    InvitePermission.Files -> R.string.invite_perm_files
    InvitePermission.History -> R.string.invite_perm_history
}

private fun InvitePermission.icon(): ImageVector = when (this) {
    InvitePermission.Messages -> MeeshyIcons.ChatBubble
    InvitePermission.Images -> MeeshyIcons.PhotoFilled
    InvitePermission.Files -> MeeshyIcons.AttachFile
    InvitePermission.History -> MeeshyIcons.ScheduleFilled
}

private fun String.inviteIcon(): ImageVector = when (lowercase()) {
    "group" -> MeeshyIcons.GroupsFilled
    "community" -> MeeshyIcons.GroupsFilled
    "channel", "broadcast" -> MeeshyIcons.Campaign
    "public", "global" -> MeeshyIcons.Public
    else -> MeeshyIcons.ChatBubble
}

private fun String.inviteTypeLabelRes(): Int = when (lowercase()) {
    "group" -> R.string.share_link_type_group
    "community" -> R.string.share_link_type_community
    "channel" -> R.string.share_link_type_channel
    "broadcast" -> R.string.share_link_type_broadcast
    "public" -> R.string.share_link_type_public
    "global" -> R.string.share_link_type_global
    "direct" -> R.string.conversations_filter_personal
    else -> R.string.share_link_section_conversation
}

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText("meeshy-invite-link", text))
}

private fun openChooser(context: Context, effect: InviteFriendsUiEffect.OpenChooser) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, effect.url)
    }
    context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
