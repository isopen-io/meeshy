package me.meeshy.app.chat.conversationcard

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.conversationcard.ConversationCardActions
import me.meeshy.sdk.model.conversationcard.ConversationCardJoinAccount
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.CardError
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.Pending
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.Phase
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * La carte d'une URL Meeshy de conversation dans une bulle (#13672) — miroir d'iOS
 * `ConversationLinkCard` (`BubbleLinkEmbed`). Cache d'abord : une carte déjà vue s'affiche à sa
 * première image ; le squelette n'apparaît que sur cache vide. Tant que le serveur ne sert pas la carte
 * (lien inconnu, panne sur cache vide), la bulle retombe sur [fallback], l'aperçu de lien d'avant.
 */
@Composable
internal fun ConversationLinkCard(
    target: ConversationCardTarget,
    cards: ConversationLinkCards,
    fallbackAccent: Color,
    onOpenConversation: (conversationId: String) -> Unit,
    fallback: @Composable () -> Unit,
) {
    key(target) {
        val state by remember(cards, target) { cards.state(target) }.collectAsStateWithLifecycle()
        val joinAccount by cards.joinAccount.collectAsStateWithLifecycle()
        val haptics = rememberMeeshyHaptics()
        val context = LocalContext.current
        var confirmsLeave by rememberSaveable { mutableStateOf(false) }
        when (val phase = state.phase) {
            Phase.Unavailable -> fallback()
            Phase.Loading -> ConversationLinkCardSkeleton(fallbackAccent)
            Phase.PrivateConversation -> ConversationLinkCardNotice()
            is Phase.Card -> {
                val accent = hexColor(DynamicColorGenerator.colorForName(phase.card.accentSeed), fallbackAccent)
                ConversationLinkCardFrame {
                    ConversationLinkCardBody(card = phase.card, accent = accent)
                    ConversationLinkCardActionsRow(
                        actions = state.actions(target),
                        joinAccount = joinAccount,
                        isExpired = phase.card.isLinkExpired,
                        pending = state.pending,
                        error = state.error,
                        accent = accent,
                        onJoin = {
                            haptics.light()
                            cards.join(
                                target,
                                onJoined = { id ->
                                    haptics.success()
                                    onOpenConversation(id)
                                },
                                onFailed = { haptics.error() },
                            )
                        },
                        onJoinAnonymously = { identifier ->
                            haptics.light()
                            openGuestJoin(context, identifier)
                        },
                        onLeave = { confirmsLeave = true },
                        onOpen = { id ->
                            haptics.light()
                            onOpenConversation(id)
                        },
                    )
                }
            }
        }
        if (confirmsLeave) {
            LeaveConfirmation(
                onConfirm = {
                    confirmsLeave = false
                    cards.leave(target) { succeeded -> if (succeeded) haptics.success() else haptics.error() }
                },
                onDismiss = { confirmsLeave = false },
            )
        }
    }
}

/**
 * Rejoindre SANS compte : le parcours d'entrée par lien de partage de l'app, l'identité déjà choisie
 * (`meeshy://join/<id>?anonymous=true`) — droit au formulaire invité, sans l'écran « compte ou
 * anonyme » (#13683, iOS `DeepLinkRouter.requestedGuestJoin`). Épinglé à cette app : jamais une autre ne répond.
 */
private fun openGuestJoin(context: Context, identifier: String) {
    runCatching {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("meeshy://join/${Uri.encode(identifier)}?anonymous=true"))
            .setPackage(context.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        context.startActivity(intent)
    }
}

@Composable
private fun ConversationLinkCardFrame(content: @Composable () -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = Modifier
            .padding(top = MeeshySpacing.sm)
            .widthIn(max = 300.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(tokens.backgroundPrimary.copy(alpha = 0.96f))
            .border(BorderStroke(1.dp, tokens.hairline), RoundedCornerShape(MeeshyRadius.lg))
            .padding(MeeshySpacing.sm),
    ) { content() }
}

@Composable
private fun ConversationLinkCardActionsRow(
    actions: ConversationCardActions,
    joinAccount: ConversationCardJoinAccount?,
    isExpired: Boolean,
    pending: Pending,
    error: CardError?,
    accent: Color,
    onJoin: () -> Unit,
    onJoinAnonymously: (identifier: String) -> Unit,
    onLeave: () -> Unit,
    onOpen: (conversationId: String) -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val busy = pending != Pending.NONE
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        when {
            isExpired -> Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs, Alignment.CenterHorizontally),
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Icon(MeeshyIcons.TimerOff, contentDescription = null, tint = tokens.textSecondary, modifier = Modifier.size(16.dp))
                Text(
                    stringResource(R.string.conversation_card_expired),
                    color = tokens.textSecondary,
                    fontSize = MeeshyFontSize.subhead,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            actions is ConversationCardActions.Join -> {
                Text(
                    stringResource(R.string.conversation_card_join_prompt),
                    color = tokens.textPrimary,
                    fontSize = MeeshyFontSize.subhead,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                    if (actions.allowsAnonymous) {
                        CardButton(
                            title = stringResource(R.string.conversation_card_join_choice_anonymous),
                            spoken = stringResource(R.string.conversation_card_a11y_join_anonymously),
                            icon = MeeshyIcons.Theater,
                            tint = accent,
                            filled = false,
                            enabled = !busy,
                            busy = false,
                            modifier = Modifier.weight(1f),
                            onClick = { onJoinAnonymously(actions.identifier) },
                        )
                    }
                    CardButton(
                        title = joinAccount?.title ?: stringResource(R.string.conversation_card_join_choice_account),
                        spoken = joinAccount?.let { stringResource(R.string.conversation_card_a11y_join_with_named_account, it.spokenName) }
                            ?: stringResource(R.string.conversation_card_a11y_join_with_account),
                        icon = MeeshyIcons.Account,
                        tint = accent,
                        filled = true,
                        enabled = !busy,
                        busy = pending == Pending.JOINING,
                        modifier = Modifier.weight(1f),
                        onClick = onJoin,
                    )
                }
            }
            actions is ConversationCardActions.LeaveOrOpen -> Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                val leave = stringResource(R.string.conversation_card_leave)
                CardButton(
                    title = leave,
                    spoken = leave,
                    icon = MeeshyIcons.SignOut,
                    tint = tokens.errorInk,
                    filled = false,
                    enabled = !busy,
                    busy = pending == Pending.LEAVING,
                    modifier = Modifier.weight(1f),
                    onClick = onLeave,
                )
                val open = stringResource(R.string.conversation_card_open)
                CardButton(
                    title = open,
                    spoken = open,
                    icon = MeeshyIcons.ArrowUpRight,
                    tint = accent,
                    filled = true,
                    enabled = !busy,
                    busy = false,
                    modifier = Modifier.weight(1f),
                    onClick = { onOpen(actions.conversationId) },
                )
            }
            else -> Unit
        }
        error?.let { reason ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                Icon(MeeshyIcons.WarningFilled, contentDescription = null, tint = tokens.errorInk, modifier = Modifier.size(14.dp))
                Text(stringResource(reason.messageRes()), color = tokens.errorInk, fontSize = MeeshyFontSize.small, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

private fun CardError.messageRes(): Int = when (this) {
    CardError.LINK_NOT_FOUND -> R.string.conversation_card_error_not_found
    CardError.LINK_INACTIVE -> R.string.conversation_card_error_inactive
    CardError.FORBIDDEN -> R.string.conversation_card_error_forbidden
    CardError.JOIN_FAILED -> R.string.conversation_card_error_join
    CardError.LEAVE_FAILED -> R.string.conversation_card_error_leave
}

@Composable
private fun LeaveConfirmation(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.conversation_card_leave_confirm_title)) },
        text = { Text(stringResource(R.string.conversation_card_leave_confirm_message)) },
        confirmButton = {
            TextButton(onClick = onConfirm, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.conversation_card_leave), color = tokens.errorInk, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.common_cancel))
            }
        },
    )
}

/** Le squelette, sur cache vide seulement. */
@Composable
private fun ConversationLinkCardSkeleton(accent: Color) {
    val placeholder = MeeshyTheme.tokens.controlFill
    val spoken = stringResource(R.string.conversation_card_loading)
    Column(
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        modifier = Modifier
            .padding(top = MeeshySpacing.sm)
            .widthIn(max = 300.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.backgroundPrimary.copy(alpha = 0.96f))
            .padding(MeeshySpacing.sm)
            .semantics { contentDescription = spoken },
    ) {
        Box(Modifier.fillMaxWidth().height(72.dp).clip(RoundedCornerShape(MeeshyRadius.smPlus)).background(accent.copy(alpha = 0.25f)))
        Box(Modifier.width(140.dp).height(14.dp).clip(RoundedCornerShape(MeeshyRadius.xxs)).background(placeholder))
        Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(MeeshyRadius.xxs)).background(placeholder))
        Box(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(MeeshyRadius.sm)).background(placeholder))
    }
}

/** La carte neutre d'une conversation privée : rien du titre ne fuit. */
@Composable
private fun ConversationLinkCardNotice() {
    val tokens = MeeshyTheme.tokens
    val title = stringResource(R.string.conversation_card_private_title)
    val hint = stringResource(R.string.conversation_card_private_hint)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        modifier = Modifier
            .padding(top = MeeshySpacing.sm)
            .widthIn(max = 300.dp)
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(tokens.backgroundPrimary.copy(alpha = 0.96f))
            .border(BorderStroke(1.dp, tokens.hairline), RoundedCornerShape(MeeshyRadius.lg))
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) { contentDescription = "$title. $hint" },
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(40.dp).clip(CircleShape).background(tokens.controlFill),
        ) {
            Icon(MeeshyIcons.LockFilled, contentDescription = null, tint = tokens.textSecondary, modifier = Modifier.size(20.dp))
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = tokens.textPrimary, fontSize = MeeshyFontSize.body, fontWeight = FontWeight.Bold)
            Text(hint, color = tokens.textSecondary, fontSize = MeeshyFontSize.subhead)
        }
    }
}
