package me.meeshy.app.calls

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.group.CallInviteBoard
import me.meeshy.sdk.model.call.group.CallInviteNotice
import me.meeshy.sdk.model.call.group.CallPendingInvite
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshySpacing
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le mot de retour et les invitations qui sonnent, posés JUSTE AU-DESSUS de la pilule (iOS
 * `CallView.callControlsNoticesAbove`, #13753) : le mot d'abord, la bande « Sonne… » dessous.
 */
@Singleton
class CallInviteOverlay @Inject constructor(
    private val controller: CallInviteController,
) : CallOverlay {
    override val id: String = "call-invites"
    override val slot: CallOverlaySlot = CallOverlaySlot.AboveControls

    override fun isVisible(state: CallUiState): Boolean = state.showsConnectedLayout

    @Composable
    override fun Content(context: CallOverlayContext) {
        val invites by controller.state.collectAsStateWithLifecycle()
        CallInviteBoardView(board = invites.board, onDismissNotice = controller::dismissNotice)
    }
}

@Composable
internal fun CallInviteBoardView(board: CallInviteBoard, onDismissNotice: () -> Unit, modifier: Modifier = Modifier) {
    if (board.notice == null && board.invites.isEmpty()) return
    Column(
        modifier = modifier.padding(bottom = MeeshySpacing.sm),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        board.notice?.let { notice -> CallInviteNoticePill(notice, onDismissNotice) }
        if (board.invites.isNotEmpty()) CallInviteStrip(board.invites)
    }
}

/**
 * Les invitations qui sonnent (iOS `CallInviteStrip`) : une information, pas un contrôle. L'avatar de chaque invité
 * porte sa présence (#13770, iOS `LivePresence` + `knownPresenceState`), telle que la passerelle l'a servie : un
 * non-ami ou un invité hors ligne n'a aucun point, rien n'est fabriqué ici.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun CallInviteStrip(
    invites: List<CallPendingInvite>,
    modifier: Modifier = Modifier,
    presenceOf: @Composable (String) -> PresenceState? = { rememberPresence(it) },
) {
    val ringing = stringResource(R.string.call_invite_ringing)
    FlowRow(
        modifier = modifier.testTag(INVITE_STRIP_TAG),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        invites.forEach { invite ->
            MeeshyGlassSurface(
                shape = CircleShape,
                modifier = Modifier.clearAndSetSemantics { contentDescription = "${invite.displayName}, $ringing" },
            ) {
                Row(
                    modifier = Modifier
                        .defaultMinSize(minHeight = 44.dp)
                        .padding(horizontal = MeeshySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
                ) {
                    CallInviteAvatar(invite, presence = presenceOf(invite.userId))
                    Text(
                        text = invite.displayName,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyMediaChromeColors.OnMedia,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.widthIn(max = 128.dp),
                    )
                    Text(
                        text = ringing,
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyMediaChromeColors.OnMediaMuted,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/** L'avatar d'un invité qui sonne : 24 pt, son point de présence servie (iOS `context: .typingIndicator`). */
@Composable
internal fun CallInviteAvatar(invite: CallPendingInvite, presence: PresenceState?) {
    MeeshyAvatar(
        name = invite.displayName,
        context = AvatarContext.TypingIndicator,
        presence = presence,
        imageUrl = invite.avatarUrl,
    )
}

/** Le mot de retour d'une invitation (iOS `CallControlsNoticePill`) : il s'efface seul au bout de 4 s. */
@Composable
internal fun CallInviteNoticePill(notice: CallInviteNotice, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    val text = when (notice) {
        CallInviteNotice.Failed -> stringResource(R.string.call_invite_failed)
        is CallInviteNotice.Declined -> stringResource(R.string.call_invite_declined, notice.name)
        is CallInviteNotice.Unanswered -> stringResource(R.string.call_invite_unanswered, notice.name)
    }
    val close = stringResource(R.string.call_recording_close)
    LaunchedEffect(notice) {
        delay(CallInviteBoard.NOTICE_DISPLAY_MILLIS)
        onDismiss()
    }
    MeeshyGlassSurface(
        modifier = modifier.testTag(INVITE_NOTICE_TAG).semantics { liveRegion = LiveRegionMode.Polite },
        shape = CircleShape,
    ) {
        Row(
            modifier = Modifier.padding(start = MeeshySpacing.mdPlus),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = MeeshyMediaChromeColors.OnMedia,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable(onClickLabel = close, role = Role.Button, onClick = onDismiss)
                    .semantics { contentDescription = close },
                contentAlignment = Alignment.Center,
            ) {
                Icon(MeeshyIcons.Close, contentDescription = null, tint = MeeshyMediaChromeColors.OnMediaSecondary, modifier = Modifier.size(16.dp))
            }
        }
    }
}

internal const val INVITE_STRIP_TAG = "call-invite-strip"
internal const val INVITE_NOTICE_TAG = "call-invite-notice"
