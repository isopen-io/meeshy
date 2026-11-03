package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.pressable
import me.meeshy.ui.motion.staggeredAppear
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

internal const val PROFILE_SHARED_ROW_TAG_PREFIX = "profile-shared-conversation-"
internal const val PROFILE_COMPACT_MESSAGE_TAG = "profile-compact-message"

/** L'opacité des rangées d'un onglet désactivé (bloqué dans un sens ou dans l'autre), iso iOS 0,35. */
private const val DISABLED_ALPHA = 0.35f
private val DIVIDER_INSET = 64.dp
private val AVATAR_SIZE = 44.dp

/**
 * L'onglet Conversations (miroir de `conversationsTab` iOS) : sans conversation commune, l'icône bulles
 * (interdit si bloqué), la pilule Message et le texte ; sinon le bouton Message pleine largeur puis les
 * rangées (avatar à l'accent de la conversation, nom sur une ligne, chevron) séparées par un trait inset
 * de 64 dp. Toucher une rangée appelle [onOpen] avec une haptique légère ; bloqué, plus rien ne répond.
 */
@Composable
internal fun ProfileConversationsTab(
    view: ProfileConversationsView,
    rows: List<SharedConversationRow>,
    isOpeningConversation: Boolean,
    onOpen: (conversationId: String) -> Unit,
    onSendMessage: () -> Unit,
) {
    when (view) {
        is ProfileConversationsView.Empty -> ProfileConversationsEmpty(
            interactionsDisabled = view.interactionsDisabled,
            showsMessagePill = view.showsMessagePill,
            isOpeningConversation = isOpeningConversation,
            onSendMessage = onSendMessage,
        )
        is ProfileConversationsView.Listing -> Column(Modifier.fillMaxWidth()) {
            if (view.showsMessageButton) {
                Column(
                    Modifier
                        .padding(top = MeeshySpacing.sm, bottom = MeeshySpacing.lg)
                        .alpha(if (view.interactionsDisabled) DISABLED_ALPHA else 1f),
                ) {
                    SendMessageButton(
                        isOpening = isOpeningConversation,
                        onClick = if (view.interactionsDisabled) ({}) else onSendMessage,
                    )
                }
            }
            rows.forEachIndexed { index, row ->
                SharedConversationRowItem(
                    row = row,
                    index = index,
                    enabled = !view.interactionsDisabled,
                    onClick = { onOpen(row.id) },
                )
                if (index < rows.lastIndex) {
                    HorizontalDivider(
                        modifier = Modifier.padding(start = DIVIDER_INSET),
                        color = MeeshyTheme.tokens.textMuted.copy(alpha = MeeshyOpacity.light),
                    )
                }
            }
        }
    }
}

@Composable
private fun SharedConversationRowItem(row: SharedConversationRow, index: Int, enabled: Boolean, onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .staggeredAppear(index)
            .alpha(if (enabled) 1f else DISABLED_ALPHA)
            .heightIn(min = 48.dp)
            .clickable(enabled = enabled, role = Role.Button) {
                haptics.light()
                onClick()
            }
            .padding(vertical = MeeshySpacing.smPlus)
            .testTag(PROFILE_SHARED_ROW_TAG_PREFIX + row.id),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(
            name = row.title,
            size = AVATAR_SIZE,
            containerColor = hexColor(row.accentHex, MeeshyPalette.Indigo500),
            imageUrl = row.avatarUrl,
        )
        Text(
            text = row.title,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Icon(
            imageVector = MeeshyIcons.ChevronForward,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.size(20.dp),
        )
    }
}

@Composable
private fun ProfileConversationsEmpty(
    interactionsDisabled: Boolean,
    showsMessagePill: Boolean,
    isOpeningConversation: Boolean,
    onSendMessage: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Icon(
            imageVector = if (interactionsDisabled) MeeshyIcons.Block else MeeshyIcons.ForumFilled,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted.copy(alpha = if (interactionsDisabled) MeeshyOpacity.medium else MeeshyOpacity.strong),
            modifier = Modifier.size(40.dp),
        )
        if (showsMessagePill) SendMessagePill(isOpening = isOpeningConversation, onClick = onSendMessage)
        Text(
            text = stringResource(
                if (interactionsDisabled) R.string.profile_conversations_interactionsDisabled else R.string.profile_conversations_noShared,
            ),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

/** Le bouton Message compact (miroir de `sendMessageButtonCompact` iOS) : pilule en dégradé indigo, ombre légère. */
@Composable
internal fun SendMessagePill(isOpening: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = Modifier
            .pressable()
            .heightIn(min = 48.dp)
            .shadow(4.dp, shape, ambientColor = MeeshyPalette.Indigo500.copy(alpha = MeeshyOpacity.medium))
            .clip(shape)
            .background(Brush.horizontalGradient(listOf(MeeshyPalette.Indigo500, MeeshyPalette.Indigo400)))
            .clickable(enabled = !isOpening, role = Role.Button) {
                haptics.medium()
                onClick()
            }
            .padding(horizontal = 20.dp, vertical = MeeshySpacing.smPlus)
            .testTag(PROFILE_COMPACT_MESSAGE_TAG),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isOpening) {
            CircularProgressIndicator(modifier = Modifier.size(12.dp), color = Color.White, strokeWidth = 2.dp)
        } else {
            Icon(MeeshyIcons.Send, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
        }
        Spacer(Modifier.width(6.dp))
        Text(
            text = stringResource(R.string.profile_action_send_message),
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.labelLarge,
        )
    }
}
