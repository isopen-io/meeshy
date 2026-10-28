package me.meeshy.app.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ForwardDurationChoice
import me.meeshy.sdk.model.share.ShareDelivery

import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareTitle
import me.meeshy.sdk.model.share.ShareWithdrawReason
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/** The state-changing gestures of the sheet — one place for the caller to wire. */
internal data class ShareSheetActions(
    val onQueryChange: (String) -> Unit,
    val onToggle: (ShareRecipient) -> Unit,
    val onCaptionChange: (String) -> Unit,
    val onDurationChange: (Int) -> Unit,
    val onSend: () -> Unit,
    val onDismiss: () -> Unit,
    /** « Ouvrir » de la confirmation « Envoyé à X » ; absent, la confirmation ne propose pas d'ouvrir. */
    val onOpenConversation: ((conversationId: String) -> Unit)? = null,
    /** « Modifier dans le studio » (partage entrant) : la pièce reçue s'ouvre dans le composeur au lieu de partir. */
    val onEditInStudio: (() -> Unit)? = null,
    /** « Copier le lien » et « Partager hors de Meeshy » : l'hôte sait copier et ouvrir le partage système. */
    val onCopyLink: ((String) -> Unit)? = null,
    val onShareOut: ((String) -> Unit)? = null,
)

private val FLAME_PRESETS = listOf(30, 60, 300, 3600, 86_400)

/** La porte « message » du fil : sa refusal card, sinon la feuille unique alimentée par [forward]. */
@Composable
internal fun ShareSheet(
    forward: ForwardUiState,
    accentColor: Color,
    actions: ShareSheetActions,
    modifier: Modifier = Modifier,
) {
    if (forward.refusal != null) {
        ForwardRefusalCard(forward.refusal, accentColor, actions.onDismiss, modifier.padding(bottom = MeeshySpacing.lg))
        return
    }
    val model = remember(forward) { forward.toSheetModel() }
    ShareSheetBody(model, accentColor, actions, modifier)
}

/**
 * **L'écran de partage unique** (#13469, #13477) — quatre zones, toujours dans cet ordre : ce qui part,
 * ce qu'on peut en faire (légende, durée d'une flamme), à qui (récents avant toute frappe, puis
 * conversations et personnes), Envoyer. Chemin nominal en deux gestes : toucher un récent, puis Envoyer.
 * Le plan ([ShareSheetModel.plan]) décide de ce qui est offert ; cette vue ne relit aucun drapeau de protection.
 */
@Composable
internal fun ShareSheetBody(
    model: ShareSheetModel,
    accentColor: Color,
    actions: ShareSheetActions,
    modifier: Modifier = Modifier,
) {
    val plan = model.plan
    Column(modifier = modifier.fillMaxWidth().padding(bottom = MeeshySpacing.lg)) {
        if (model.isSessionLoading || model.isSignedOut) {
            ShareHeader(ShareTitle.SEND, actions.onDismiss)
            Box(Modifier.fillMaxWidth().padding(MeeshySpacing.xl), contentAlignment = Alignment.Center) {
                if (model.isSessionLoading) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                        Text(stringResource(R.string.share_target_loading), color = MeeshyTheme.tokens.textSecondary)
                    }
                } else {
                    Text(stringResource(R.string.share_target_signed_out), color = MeeshyTheme.tokens.textSecondary, textAlign = TextAlign.Center)
                }
            }
            return@Column
        }
        ShareHeader(plan?.title ?: ShareTitle.FORWARD, actions.onDismiss)
        ShareContentZone(model)
        ShareToolsRow(model, actions)
        if (plan?.caption != null) {
            OutlinedTextField(
                value = model.caption,
                onValueChange = actions.onCaptionChange,
                placeholder = { Text(stringResource(R.string.share_caption_hint)) },
                maxLines = 3,
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = accentColor, cursorColor = accentColor),
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            )
        }
        plan?.flameMaxDurationSeconds?.let { bound ->
            FlameDurationRow(bound, model.chosenDurationSeconds ?: bound, accentColor, actions.onDurationChange)
        }
        ShareRecipients(model, accentColor, actions, Modifier.weight(1f, fill = false))
        ShareConfirmation(model, accentColor, actions)
        ShareSendBar(model, accentColor, actions.onDismiss, actions.onSend)
    }
}

/** Ce qu'on peut faire du contenu sans l'envoyer : l'ouvrir au studio, copier son lien, le partager hors de Meeshy. */
@Composable
private fun ShareToolsRow(model: ShareSheetModel, actions: ShareSheetActions) {
    val haptics = rememberMeeshyHaptics()
    val link = model.copyableLink
    val outText = model.shareOutText
    val copy = actions.onCopyLink
    val out = actions.onShareOut
    val studio = actions.onEditInStudio
    if (studio == null && (link == null || copy == null) && (outText == null || out == null)) return
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            kotlinx.coroutines.delay(1500)
            copied = false
        }
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        if (studio != null) TextButton(onClick = studio) { Text(stringResource(R.string.share_target_studio)) }
        if (link != null && copy != null) {
            TextButton(onClick = { copy(link); copied = true; haptics.success() }) {
                Text(stringResource(if (copied) R.string.share_copied else R.string.share_action_copy_link))
            }
        }
        if (outText != null && out != null) TextButton(onClick = { out(outText) }) { Text(stringResource(R.string.share_action_share_out)) }
    }
}

@Composable
private fun ShareHeader(title: ShareTitle, onDismiss: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(if (title == ShareTitle.SEND) R.string.share_title_send else R.string.share_title_forward),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onDismiss) {
            Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.share_close), tint = MeeshyTheme.tokens.textSecondary)
        }
    }
}

/** « Ce qui part » : the content (text, link, card, files) or how many messages leave and why the others stay. */
@Composable
private fun ShareContentZone(model: ShareSheetModel) {
    val plan = model.plan ?: return
    Column(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)) {
        Text(
            text = if (model.sourceMessageCount > 0 && plan.kept.size < model.sourceMessageCount) {
                stringResource(R.string.share_content_messages_kept, plan.kept.size, model.sourceMessageCount)
            } else {
                stringResource(R.string.share_zone_content)
            },
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        model.notices.forEach { notice ->
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                Icon(MeeshyIcons.Error, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(16.dp))
                Text(text = notice, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
            }
        }
        model.contentLines.forEach { line ->
            Text(
                text = line,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
        plan.withdrawn.map { it.reason }.distinct().forEach { reason ->
            Text(
                text = stringResource(
                    when (reason) {
                        ShareWithdrawReason.VIEW_ONCE -> R.string.share_withdrawn_view_once
                        ShareWithdrawReason.AFTER_READ -> R.string.share_withdrawn_after_read
                        ShareWithdrawReason.UNAVAILABLE -> R.string.share_withdrawn_unavailable
                    },
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

/** « Disparaît après » : the copy of a timed flame lasts at most as long as its source. */
@Composable
private fun FlameDurationRow(bound: Int, chosen: Int, accentColor: Color, onChange: (Int) -> Unit) {
    val options = (FLAME_PRESETS.filter { it < bound } + bound).distinct()
    Column(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Icon(MeeshyIcons.Flame, contentDescription = null, tint = accentColor, modifier = Modifier.size(16.dp))
            Text(stringResource(R.string.share_flame_title), style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.textSecondary)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            options.forEach { seconds ->
                FilterChip(selected = seconds == chosen, onClick = { onChange(seconds) }, label = { Text(ForwardDurationChoice(seconds).label) })
            }
        }
    }
}

@Composable
private fun ShareRecipients(model: ShareSheetModel, accentColor: Color, actions: ShareSheetActions, modifier: Modifier) {
    val haptics = rememberMeeshyHaptics()
    val toggle: (ShareRecipient) -> Unit = { recipient ->
        haptics.selection()
        actions.onToggle(recipient)
    }
    val sections = model.sections
    Column(modifier) {
        OutlinedTextField(
            value = model.query,
            onValueChange = actions.onQueryChange,
            singleLine = true,
            leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.share_search_hint)) },
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = accentColor, cursorColor = accentColor),
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        AnimatedVisibility(
            visible = sections.recents.isNotEmpty(),
            enter = fadeIn(tween(180)) + expandVertically(tween(180)),
            exit = fadeOut(tween(120)) + shrinkVertically(tween(120)),
        ) {
            RecentsRow(sections.recents, model, accentColor, toggle)
        }
        when {
            sections.isEmpty && model.isLoading -> Box(Modifier.fillMaxWidth().padding(MeeshySpacing.lg), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = accentColor, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
            }
            sections.isEmpty -> Column(Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.lg)) {
                Text(stringResource(R.string.share_empty_title), style = MaterialTheme.typography.titleSmall, color = MeeshyTheme.tokens.textPrimary)
                Text(stringResource(R.string.share_empty_body), style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
            }
            else -> LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp)) {
                if (sections.conversations.isNotEmpty()) {
                    item(key = "header:conversations") { SectionLabel(stringResource(R.string.share_section_conversations)) }
                    items(sections.conversations, key = { it.id }) { recipient ->
                        RecipientRow(recipient, model, accentColor, toggle, Modifier.animateItem())
                    }
                }
                if (sections.people.isNotEmpty()) {
                    item(key = "header:people") { SectionLabel(stringResource(R.string.share_section_people)) }
                    items(sections.people, key = { it.id }) { recipient ->
                        RecipientRow(recipient, model, accentColor, toggle, Modifier.animateItem())
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    )
}

@Composable
private fun RecipientRow(
    recipient: ShareRecipient,
    model: ShareSheetModel,
    accentColor: Color,
    onToggle: (ShareRecipient) -> Unit,
    modifier: Modifier,
) {
    ShareRecipientRow(
        recipient = recipient,
        selected = recipient.id in model.selectedIds,
        delivery = model.deliveries[recipient.id],
        accentColor = accentColor,
        onToggle = { onToggle(recipient) },
        modifier = modifier,
    )
}

/** Les plus récents, avant toute frappe : « toucher un récent, puis Envoyer » (iOS `ShareRecentChip`). */
@Composable
private fun RecentsRow(recents: List<ShareRecipient>, model: ShareSheetModel, accentColor: Color, onToggle: (ShareRecipient) -> Unit) {
    LazyRow(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        items(recents, key = { it.id }) { recipient ->
            ShareRecentChip(
                recipient = recipient,
                selected = recipient.id in model.selectedIds,
                delivery = model.deliveries[recipient.id],
                accentColor = accentColor,
                onToggle = { onToggle(recipient) },
                modifier = Modifier.animateItem(),
            )
        }
    }
}

@Composable
private fun ShareRecentChip(
    recipient: ShareRecipient,
    selected: Boolean,
    delivery: ShareDelivery?,
    accentColor: Color,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val served = delivery != null && delivery !is ShareDelivery.Failed
    Column(
        modifier = modifier
            .width(64.dp)
            .clip(MaterialTheme.shapes.medium)
            .clickable(enabled = !served, onClick = onToggle)
            .semantics { role = Role.Checkbox; this.selected = selected }
            .padding(vertical = MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(contentAlignment = Alignment.BottomEnd) {
            MeeshyAvatar(
                name = recipient.title,
                size = 48.dp,
                containerColor = recipient.accentHex?.let { hexColor(it) }?.takeIf { it != Color.Unspecified } ?: accentColor,
                imageUrl = recipient.avatarUrl,
                presence = rememberPresence(recipient.userId.takeUnless { recipient.isGroup }),
            )
            val badge = when {
                delivery == ShareDelivery.Sent || delivery == ShareDelivery.Queued -> MeeshyPalette.Success
                selected -> accentColor
                else -> null
            }
            if (badge != null) {
                Icon(
                    MeeshyIcons.CheckCircleFilled,
                    contentDescription = null,
                    tint = badge,
                    modifier = Modifier.size(18.dp).clip(CircleShape).background(MeeshyTheme.tokens.backgroundPrimary),
                )
            }
        }
        Text(
            text = recipient.title,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
    }
}

/** « Envoyé à X · Ouvrir » (D5) : jamais une navigation imposée ; la ligne apparaît en fondu au premier envoi servi. */
@Composable
private fun ShareConfirmation(model: ShareSheetModel, accentColor: Color, actions: ShareSheetActions) {
    val haptics = rememberMeeshyHaptics()
    val served = model.firstServed
    LaunchedEffect(served?.conversationId) { if (served != null) haptics.success() }
    AnimatedVisibility(
        visible = served != null,
        enter = fadeIn(tween(200)) + slideInVertically(tween(220)) { it / 2 } + expandVertically(tween(220)),
        exit = fadeOut(tween(120)) + shrinkVertically(tween(120)),
    ) {
        val name = served?.recipient?.title.orEmpty()
        val announcement = stringResource(R.string.share_toast_sent_to, name)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
                .semantics { liveRegion = LiveRegionMode.Polite; contentDescription = announcement },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = MeeshyPalette.Success, modifier = Modifier.size(20.dp))
            Text(
                text = announcement,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            val open = actions.onOpenConversation
            if (open != null && served != null) {
                TextButton(onClick = { open(served.conversationId) }) {
                    Text(stringResource(R.string.share_toast_open), color = accentColor)
                }
            }
        }
    }
}

/** Annuler · Envoyer (N) — armed only when the plan can send; the limits and the fail-closed reasons are told. */
@Composable
private fun ShareSendBar(model: ShareSheetModel, accentColor: Color, onCancel: () -> Unit, onSend: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    val plan = model.plan
    val count = model.selectedIds.size
    Column(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)) {
        if (model.recipientLimitExceeded) {
            Text(
                text = stringResource(R.string.share_limits_recipients),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyPalette.Warning,
            )
        }
        AnimatedVisibility(visible = model.isOffline) {
            Text(
                text = stringResource(R.string.share_offline),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyPalette.Warning,
                modifier = Modifier.padding(bottom = MeeshySpacing.xs).semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        val sentAll = count > 0 && model.selectedIds.all { model.deliveries[it] == ShareDelivery.Sent || model.deliveries[it] == ShareDelivery.Queued }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            TextButton(onClick = onCancel) { Text(stringResource(R.string.common_cancel)) }
            Button(
                onClick = if (sentAll) onCancel else { { haptics.medium(); onSend() } },
                enabled = sentAll || plan?.canSend == true,
                colors = ButtonDefaults.buttonColors(containerColor = accentColor),
                modifier = Modifier.weight(1f),
            ) {
                val label = stringResource(if (plan?.title == ShareTitle.SEND) R.string.share_title_send else R.string.share_title_forward)
                Text(if (sentAll) stringResource(R.string.share_status_sent) else if (count > 0) "$label · $count" else label)
            }
        }
    }
}

