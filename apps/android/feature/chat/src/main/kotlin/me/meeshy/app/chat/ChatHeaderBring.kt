package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.relation.BringLook
import me.meeshy.sdk.relation.BringNotice
import me.meeshy.ui.R as UiR
import me.meeshy.ui.component.bring.BringConfirmDialog
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

internal const val CHAT_HEADER_BRING_TAG = "conversation.header.bring"

/**
 * Le Bring dans l'en-tête d'un direct (#17442, iso `ConversationHeaderBringButton`), à gauche du talkie : un toucher ouvre
 * la MÊME confirmation que la fiche (« Faire sonner »), un second envoie — deux gestes. Tant que ça sonne, le même bouton
 * annule, sans confirmation ; quota épuisé, il reste et le dit. Rien tant que la passerelle ne l'ouvre pas.
 */
@Composable
internal fun ChatHeaderBringButton(
    peerUserId: String,
    peerName: String,
    viewModel: ChatHeaderBringViewModel = hiltViewModel(key = "header-bring-$peerUserId"),
) {
    LaunchedEffect(peerUserId) { viewModel.load(peerUserId) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    var confirming by rememberSaveable(peerUserId) { mutableStateOf(false) }
    val quota = stringResource(UiR.string.bring_quota, peerName)
    val offline = stringResource(UiR.string.bring_offline)
    val failed = stringResource(UiR.string.bring_failed)
    LaunchedEffect(state.notice) {
        val text = when (state.notice) {
            BringNotice.QUOTA -> quota
            BringNotice.OFFLINE -> offline
            BringNotice.FAILED -> failed
            null -> return@LaunchedEffect
        }
        Toast.makeText(context, text, Toast.LENGTH_SHORT).show()
        viewModel.consumeNotice()
    }
    val look = state.look
    val ringing = look == BringLook.RINGING
    val description = when (look) {
        BringLook.RINGING -> stringResource(UiR.string.bring_cancel) + " · " + stringResource(UiR.string.bring_ringing, peerName)
        BringLook.EXHAUSTED -> quota
        else -> stringResource(UiR.string.bring_confirm_title, peerName)
    }
    AnimatedVisibility(visible = look != BringLook.HIDDEN, enter = scaleIn() + fadeIn(), exit = scaleOut() + fadeOut()) {
        Box(
            modifier = Modifier
                .size(ChatHeaderMetrics.TAP_TARGET)
                .alpha(if (look == BringLook.EXHAUSTED || look == BringLook.SENDING) 0.55f else 1f)
                .clickable(enabled = look != BringLook.SENDING, role = Role.Button) {
                    haptics.medium()
                    when (look) {
                        BringLook.RINGING -> viewModel.cancel()
                        BringLook.EXHAUSTED -> Toast.makeText(context, quota, Toast.LENGTH_SHORT).show()
                        BringLook.SEND -> confirming = true
                        else -> Unit
                    }
                }
                .semantics(mergeDescendants = true) {
                    contentDescription = description
                    role = Role.Button
                }
                .testTag(CHAT_HEADER_BRING_TAG),
            contentAlignment = Alignment.Center,
        ) {
            MeeshyGlassSurface(
                modifier = Modifier.size(ChatHeaderMetrics.ACTION_GLASS),
                shape = CircleShape,
                tint = MeeshyPalette.Error.copy(alpha = 0.4f),
            ) {
                Box(
                    Modifier
                        .size(ChatHeaderMetrics.ACTION_GLASS)
                        .clip(CircleShape)
                        .background(if (ringing) MeeshyPalette.Error else Color.Transparent),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        if (ringing) MeeshyIcons.BellOff else MeeshyIcons.BellFilled,
                        contentDescription = null,
                        tint = if (ringing) Color.White else MeeshyPalette.Error,
                        modifier = Modifier.size(ChatHeaderMetrics.ACTION_GLYPH + 2.dp),
                    )
                }
            }
        }
    }
    if (confirming) {
        BringConfirmDialog(
            name = peerName,
            onConfirm = {
                confirming = false
                viewModel.send()
            },
            onDismiss = { confirming = false },
        )
    }
}
