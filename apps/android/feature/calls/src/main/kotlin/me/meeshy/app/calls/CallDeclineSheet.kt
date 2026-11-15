package me.meeshy.app.calls

import androidx.annotation.StringRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallDeclineQuickReply
import me.meeshy.sdk.model.call.CallDeclineReplyRule
import me.meeshy.ui.motion.pressable
import me.meeshy.ui.theme.MeeshySpacing

@StringRes
internal fun CallDeclineQuickReply.textRes(): Int = when (this) {
    CallDeclineQuickReply.CallBack -> R.string.call_decline_reply_call_back
    CallDeclineQuickReply.Meeting -> R.string.call_decline_reply_meeting
    CallDeclineQuickReply.CantTalk -> R.string.call_decline_reply_cant_talk
    CallDeclineQuickReply.WriteMe -> R.string.call_decline_reply_write_me
}

private const val STAGGER_MILLIS = 45L

/**
 * La feuille « Refuser avec un message » (iOS `CallDeclineSheet`) : quatre réponses rapides, puis
 * un champ libre borné à 500 caractères. Choisir une réponse ou « Envoyer et refuser » appelle
 * [onSend] avec le texte ; l'hôte refuse l'appel et envoie le message. Les rangées entrent en
 * cascade (sans mouvement si [reduceMotion]), chaque geste porte un retour haptique.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CallDeclineSheet(
    reduceMotion: Boolean,
    onSend: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    var draft by rememberSaveable { mutableStateOf("") }
    val send = { text: String ->
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        onSend(text)
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = MeeshySpacing.xl)
                .padding(bottom = MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.call_decline_title),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onDismiss, modifier = Modifier.defaultMinSize(minHeight = 48.dp)) {
                    Text(stringResource(R.string.call_decline_cancel))
                }
            }
            CallDeclineQuickReply.entries.forEachIndexed { index, reply ->
                StaggeredIn(index = index, reduceMotion = reduceMotion) {
                    val text = stringResource(reply.textRes())
                    val hint = stringResource(R.string.call_decline_reply_hint)
                    QuickReplyRow(text = text, hint = hint, onClick = { send(text) })
                }
            }
            StaggeredIn(index = CallDeclineQuickReply.entries.size, reduceMotion = reduceMotion) {
                CustomReply(draft = draft, onDraft = { draft = CallDeclineReplyRule.clamp(it) }, onSend = { if (CallDeclineReplyRule.canSend(draft)) send(draft) })
            }
        }
    }
}

@Composable
private fun StaggeredIn(index: Int, reduceMotion: Boolean, content: @Composable () -> Unit) {
    var shown by remember { mutableStateOf(reduceMotion) }
    LaunchedEffect(Unit) {
        if (!reduceMotion) delay(index * STAGGER_MILLIS)
        shown = true
    }
    AnimatedVisibility(
        visible = shown,
        enter = if (reduceMotion) fadeIn(tween(0)) else fadeIn(tween(180)) + slideInVertically(tween(220)) { it / 3 },
    ) { content() }
}

@Composable
private fun QuickReplyRow(text: String, hint: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp)
            .pressable()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
            .clickable(onClickLabel = hint, role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun CustomReply(draft: String, onDraft: (String) -> Unit, onSend: () -> Unit) {
    val canSend = CallDeclineReplyRule.canSend(draft)
    val sendAlpha by animateFloatAsState(if (canSend) 1f else 0.4f, tween(160), label = "declineSendAlpha")
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), modifier = Modifier.padding(top = MeeshySpacing.md)) {
        OutlinedTextField(
            value = draft,
            onValueChange = onDraft,
            modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp),
            placeholder = { Text(stringResource(R.string.call_decline_custom_placeholder)) },
            label = { Text(stringResource(R.string.call_decline_custom_label)) },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { if (canSend) onSend() }),
            shape = RoundedCornerShape(12.dp),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 48.dp)
                .alpha(sendAlpha)
                .clip(CircleShape)
                .background(CallPalette.Decline)
                .clickable(enabled = canSend, role = Role.Button, onClick = onSend),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.call_decline_custom_send),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = androidx.compose.ui.graphics.Color.White,
            )
        }
    }
}
