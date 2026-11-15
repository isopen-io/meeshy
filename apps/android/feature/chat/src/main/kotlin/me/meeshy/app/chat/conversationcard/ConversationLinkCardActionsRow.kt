package me.meeshy.app.chat.conversationcard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.conversationcard.ConversationCardActions
import me.meeshy.sdk.model.conversationcard.ConversationCardJoinAccount
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.CardError
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.Pending
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Cible tactile minimale d'un bouton de la carte (iOS : `minHeight: 44`). */
internal val CardButtonMinHeight = 44.dp

/** Largeur minimale d'un bouton : deux boutons ne se côtoient que si chacun garde au moins cette largeur. */
internal val CardButtonMinWidth = 64.dp

/**
 * Les boutons de la carte, choisis par la règle pure `ConversationCardActions` (iOS
 * `ConversationLinkCardActionsRow`) : non-membre ⇒ « Rejoindre ? » puis « Anonyme » | le compte
 * nommé ; membre ⇒ « Quitter » EN PREMIER, puis « Ouvrir » ; lien expiré ⇒ la mention, aucun bouton.
 * Côte à côte quand ils tiennent, empilés sinon ; pendant une action tous sont désactivés.
 */
@Composable
internal fun ConversationLinkCardActionsRow(
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
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val busy = pending != Pending.NONE
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), modifier = modifier) {
        when {
            isExpired -> Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs, Alignment.CenterHorizontally),
                modifier = Modifier.fillMaxWidth().heightIn(min = CardButtonMinHeight),
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
                SideBySideOrStacked { buttonModifier ->
                    if (actions.allowsAnonymous) {
                        CardButton(
                            title = stringResource(R.string.conversation_card_join_choice_anonymous),
                            spoken = stringResource(R.string.conversation_card_a11y_join_anonymously),
                            icon = MeeshyIcons.Theater,
                            tint = accent,
                            filled = false,
                            enabled = !busy,
                            busy = false,
                            modifier = buttonModifier,
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
                        modifier = buttonModifier,
                        onClick = onJoin,
                    )
                }
            }
            actions is ConversationCardActions.LeaveOrOpen -> SideBySideOrStacked { buttonModifier ->
                val leave = stringResource(R.string.conversation_card_leave)
                CardButton(
                    title = leave,
                    spoken = leave,
                    icon = MeeshyIcons.SignOut,
                    tint = tokens.errorInk,
                    filled = false,
                    enabled = !busy,
                    busy = pending == Pending.LEAVING,
                    modifier = buttonModifier,
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
                    modifier = buttonModifier,
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

/**
 * Les boutons côte à côte (parts égales) quand leurs largeurs naturelles tiennent, empilés (pleine
 * largeur) sinon — le `ViewThatFits { HStack ; VStack }` d'iOS.
 */
@Composable
private fun SideBySideOrStacked(buttons: @Composable (Modifier) -> Unit) {
    val gap = MeeshySpacing.sm
    FitsHorizontally(
        listOf(
            FitCandidate {
                Row(horizontalArrangement = Arrangement.spacedBy(gap), modifier = Modifier.fillMaxWidth()) {
                    buttons(Modifier.weight(1f))
                }
            },
            FitCandidate {
                Column(verticalArrangement = Arrangement.spacedBy(gap), modifier = Modifier.fillMaxWidth()) {
                    buttons(Modifier.fillMaxWidth())
                }
            },
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}

private fun CardError.messageRes(): Int = when (this) {
    CardError.LINK_NOT_FOUND -> R.string.conversation_card_error_not_found
    CardError.LINK_INACTIVE -> R.string.conversation_card_error_inactive
    CardError.FORBIDDEN -> R.string.conversation_card_error_forbidden
    CardError.JOIN_FAILED -> R.string.conversation_card_error_join
    CardError.LEAVE_FAILED -> R.string.conversation_card_error_leave
}
