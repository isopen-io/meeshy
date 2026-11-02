package me.meeshy.app.chat

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.chat.R
import me.meeshy.sdk.conversation.ReadStatusLoadFailure
import me.meeshy.sdk.model.MessageViewsFilter
import me.meeshy.sdk.model.MessageViewsListing
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.ReadStatusData
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.RelativeTimeStrings
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Une personne de l'une des listes de la fiche : son nom, son avatar et l'instant qui la concerne (ou aucun). */
internal data class ViewerRow(
    val participantId: String,
    val name: String,
    val avatarUrl: String?,
    val epochMillis: Long?,
    /** Le compte du membre listé, relu dans le roster en cache ; `null` pour un membre inconnu. */
    val userId: String? = null,
    /** La présence que le roster a servie pour ce membre ; `null` = rien servi, aucun point. */
    val served: UserPresence? = null,
)

private fun MessageViewsFilter.labelRes(): Int = when (this) {
    MessageViewsFilter.Sent -> R.string.message_detail_views_sent
    MessageViewsFilter.Delivered -> R.string.message_detail_views_delivered
    MessageViewsFilter.Read -> R.string.message_detail_views_read
    else -> R.string.message_detail_views_not_seen
}

private fun MessageViewsFilter.icon(): ImageVector = when (this) {
    MessageViewsFilter.Sent -> MeeshyIcons.Send
    MessageViewsFilter.Delivered -> MeeshyIcons.CheckCircleFilled
    MessageViewsFilter.Read -> MeeshyIcons.EyeFilled
    else -> MeeshyIcons.EyeOffFilled
}

/**
 * Fiche « Vu par » : onglets Envoyé / Distribué / Lu / Non vu, servis depuis le cache puis revalidés
 * (jamais de spinner sur une fiche déjà remplie), rechargés en direct par `read-status:updated`.
 * Les onglets de consommation média (écouté, vu, ouvert) restent à porter.
 */
@Composable
internal fun MessageViewsSheet(
    bubble: BubbleContent,
    conversationId: String,
    accentColor: Color,
    modifier: Modifier = Modifier,
    viewModel: MessageViewsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    androidx.compose.runtime.DisposableEffect(bubble.messageId, conversationId) {
        viewModel.bind(bubble.messageId, conversationId)
        onDispose { viewModel.unbind() }
    }
    val haptics = rememberMeeshyHaptics()
    val data = state.status.data
    val filter = state.filter

    Column(modifier = modifier.fillMaxWidth().padding(bottom = MeeshySpacing.lg)) {
        Text(
            stringResource(R.string.chat_action_views),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            contentPadding = PaddingValues(horizontal = MeeshySpacing.lg),
            modifier = Modifier.fillMaxWidth().padding(bottom = MeeshySpacing.md),
        ) {
            itemsIndexed(MessageViewsListing.textTabs) { _, tab ->
                ViewsTab(
                    tab = tab,
                    count = MessageViewsListing.count(tab, data),
                    selected = tab == filter,
                    accentColor = accentColor,
                    onClick = {
                        if (tab != filter) haptics.light()
                        viewModel.select(tab)
                    },
                )
            }
        }
        AnimatedContent(
            targetState = filter,
            transitionSpec = {
                val forward = targetState.ordinal > initialState.ordinal
                (fadeIn(spring(stiffness = Spring.StiffnessMedium)) +
                    slideInHorizontally(spring(Spring.DampingRatioLowBouncy, Spring.StiffnessMediumLow)) { if (forward) it / 4 else -it / 4 })
                    .togetherWith(
                        fadeOut(spring(stiffness = Spring.StiffnessMedium)) +
                            slideOutHorizontally(spring(Spring.DampingRatioNoBouncy, Spring.StiffnessMediumLow)) { if (forward) -it / 4 else it / 4 },
                    )
            },
            label = "views-tab",
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
        ) { current ->
            when {
                current == MessageViewsFilter.Sent -> SentTab(bubble, accentColor)
                state.status.showsSpinner -> Loading(accentColor)
                data == null -> LoadError(state.status.failure, accentColor, viewModel::retry)
                else -> ViewerList(current, data, state.membersByParticipant, accentColor)
            }
        }
    }
}

@Composable
private fun ViewsTab(tab: MessageViewsFilter, count: Int?, selected: Boolean, accentColor: Color, onClick: () -> Unit) {
    val label = stringResource(tab.labelRes())
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(if (selected) accentColor.copy(alpha = 0.15f) else MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f))
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) {
                role = Role.Tab
                contentDescription = count?.let { "$label, $it" } ?: label
                this.selected = selected
            }
            .defaultMinSize(minHeight = 48.dp)
            .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xsPlus),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val tint = if (selected) accentColor else MeeshyTheme.tokens.textMuted
        Icon(tab.icon(), contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, color = tint)
        if (count != null) Text(count.toString(), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = tint)
    }
}

@Composable
internal fun SentTab(bubble: BubbleContent, accentColor: Color) {
    val strings = rememberRelativeTimeStrings()
    val sentAt = remember(bubble.createdAtIso) { bubble.createdAtIso?.let { isoToEpochMillisOrNull(it) } }
    val whenText = remember(sentAt, strings) {
        sentAt?.let { RelativeTimeFormat.short(it, System.currentTimeMillis(), ZoneId.systemDefault(), Locale.getDefault(), strings) }.orEmpty()
    }
    val (badge, badgeTint) = when (bubble.deliveryStatus) {
        DeliveryStatus.Pending, DeliveryStatus.QueuedOffline -> MeeshyIcons.Schedule to MeeshyTheme.tokens.textMuted
        DeliveryStatus.Sent -> MeeshyIcons.Check to MeeshyTheme.tokens.textMuted
        DeliveryStatus.Delivered -> MeeshyIcons.CheckCircleFilled to accentColor
        DeliveryStatus.Read -> MeeshyIcons.EyeFilled to accentColor
        DeliveryStatus.Failed -> MeeshyIcons.Warning to MeeshyPalette.Error
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(accentColor.copy(alpha = 0.05f))
            .padding(MeeshySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = bubble.senderName.orEmpty().ifBlank { "?" },
            size = 40.dp,
            imageUrl = bubble.senderAvatarUrl,
            presence = rememberPresence(bubble.senderProfile?.userId?.takeUnless { bubble.isOutgoing }),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                bubble.senderName ?: stringResource(R.string.common_unknown),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(whenText, style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.textMuted)
        }
        Icon(badge, contentDescription = null, tint = badgeTint, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun ViewerList(
    filter: MessageViewsFilter,
    data: ReadStatusData,
    members: Map<String, PaginatedParticipant>,
    accentColor: Color,
) {
    val rows = remember(filter, data, members) { viewerRows(filter, data, members) }
    val total = data.totalMembers
    val (icon, empty) = when (filter) {
        MessageViewsFilter.Delivered -> MeeshyIcons.CheckCircleFilled to R.string.message_detail_views_delivered_empty
        MessageViewsFilter.Read -> MeeshyIcons.EyeOff to R.string.message_detail_views_read_empty
        else -> MeeshyIcons.CheckCircleFilled to R.string.message_detail_views_not_seen_empty
    }
    if (rows.isEmpty()) {
        MessageDetailEmpty(icon, stringResource(empty))
        return
    }
    val count = MessageViewsListing.count(filter, data) ?: rows.size
    val title = when (filter) {
        MessageViewsFilter.Delivered -> stringResource(
            if (MessageViewsListing.isEveryone(count, total)) R.string.message_detail_views_delivered_all else R.string.message_detail_views_delivered,
        )
        MessageViewsFilter.Read -> stringResource(
            if (MessageViewsListing.isEveryone(count, total)) R.string.message_detail_views_read_all else R.string.message_detail_views_read,
        )
        else -> stringResource(R.string.message_detail_views_not_seen_title)
    }
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        MessageDetailBanner(
            icon = filter.icon(),
            title = title,
            detail = hourMinute(rows.firstOrNull { it.epochMillis != null }?.epochMillis),
            accent = accentColor,
            count = "$count/$total",
        )
        val strings = rememberRelativeTimeStrings()
        val now = remember(rows) { System.currentTimeMillis() }
        LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
            itemsIndexed(rows, key = { _, row -> row.participantId }) { index, row ->
                ViewerRowItem(
                    row = row,
                    accentColor = accentColor,
                    now = now,
                    strings = strings,
                    modifier = Modifier.animateItem().staggeredAppear(index),
                )
            }
        }
    }
}

/** Une personne d'une liste de la fiche : son avatar vivant (point servi par le roster), son nom, l'instant qui la concerne. */
@Composable
internal fun ViewerRowItem(
    row: ViewerRow,
    accentColor: Color,
    now: Long,
    strings: RelativeTimeStrings,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = row.name.ifBlank { "?" },
            size = 36.dp,
            containerColor = accentColor,
            imageUrl = row.avatarUrl,
            presence = rememberPresence(row.userId, row.served),
        )
        Text(
            row.name,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (row.epochMillis != null) {
            Text(
                RelativeTimeFormat.short(row.epochMillis, now, ZoneId.systemDefault(), Locale.getDefault(), strings),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textMuted,
            )
        } else {
            Icon(MeeshyIcons.Schedule, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(14.dp))
        }
    }
}

/**
 * Les lignes d'une liste, chacune avec le compte et la présence que le roster en cache sert pour son membre
 * (iOS `MessageViewsMemberPresence`) ; un membre que le roster ne connaît pas n'a aucun point.
 */
internal fun viewerRows(
    filter: MessageViewsFilter,
    data: ReadStatusData,
    members: Map<String, PaginatedParticipant>,
): List<ViewerRow> {
    fun row(participantId: String, name: String, avatarUrl: String?, at: String?): ViewerRow {
        val member = members[participantId]
        return ViewerRow(
            participantId = participantId,
            name = name,
            avatarUrl = avatarUrl,
            epochMillis = at?.let(::isoToEpochMillisOrNull),
            userId = member?.userId,
            served = member?.let { UserPresence.served(it.isOnline, it.lastActiveAt) },
        )
    }
    return when (filter) {
        MessageViewsFilter.Delivered -> data.receivedBy.map { row(it.participantId, it.displayName, it.avatarURL, it.receivedAt) }
        MessageViewsFilter.Read -> data.readBy.map { row(it.participantId, it.displayName, it.avatarURL, it.readAt) }
        else -> data.notSeenBy.orEmpty().map { row(it.participantId, it.displayName, it.avatarURL, null) }
    }
}

@Composable
private fun Loading(accentColor: Color) {
    Column(Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xxxl), horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(modifier = Modifier.size(24.dp), color = accentColor, strokeWidth = 2.dp)
    }
}

@Composable
private fun LoadError(failure: ReadStatusLoadFailure?, accentColor: Color, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            stringResource(if (failure == ReadStatusLoadFailure.Connection) R.string.message_detail_error_connection else R.string.message_detail_error_server),
            color = MeeshyPalette.Error,
            style = MaterialTheme.typography.bodyMedium,
        )
        TextButton(onClick = onRetry) { Text(stringResource(R.string.chat_retry), color = accentColor) }
    }
}
