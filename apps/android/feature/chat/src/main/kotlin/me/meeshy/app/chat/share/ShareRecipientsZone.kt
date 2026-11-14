package me.meeshy.app.chat.share

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.share.ShareCommunityEntry
import me.meeshy.sdk.model.share.ShareDelivery
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareRecipientRowModel
import me.meeshy.sdk.model.share.ShareRecipientsZoneContent
import me.meeshy.sdk.model.share.ShareRecipientsZoneState
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

internal const val ShareRecipientsSkeletonTestTag = "share-recipients-skeleton"
internal const val ShareRecentChipTestTag = "share-recent-chip"

/** What the zone needs besides its state: the ticked ids, the deliveries and the served presence. */
internal data class ShareRecipientsZoneSnapshot(
    val selectedIds: Set<String> = emptySet(),
    val deliveries: Map<String, ShareDelivery> = emptyMap(),
    val createsGroup: Boolean = false,
    /** Served presence by user id — friends only; absent means no dot. */
    val presenceOf: (String) -> PresenceState? = { null },
)

internal data class ShareRecipientsZoneActions(
    val onToggle: (ShareRecipient) -> Unit,
    val onRetry: (ShareRecipient) -> Unit,
    val onCreatesGroupChange: (Boolean) -> Unit,
    val onToggleCommunity: (ShareCommunityEntry) -> Unit,
)

/**
 * **La zone « À qui »** (iOS `recipientsZone`) — sans état : récents cochables d'un toucher, bascule
 * « Créer un groupe avec… » dès deux personnes, sections Conversations / Personnes / Communautés (une
 * communauté se déplie en ses canaux inscriptibles). Le squelette de trois lignes n'apparaît que sur un
 * cache vide en chargement ; sinon l'état vide « Personne ici pour l'instant ».
 */
@Composable
internal fun ShareRecipientsZone(
    state: ShareRecipientsZoneState,
    snapshot: ShareRecipientsZoneSnapshot,
    accentColor: Color,
    actions: ShareRecipientsZoneActions,
    modifier: Modifier = Modifier,
) {
    when (val content = state.content) {
        is ShareRecipientsZoneContent.Skeleton -> ZoneSkeleton(content.rows, modifier)
        ShareRecipientsZoneContent.Empty -> MeeshyEmptyState(
            icon = MeeshyIcons.Groups,
            title = stringResource(R.string.share_empty_title),
            subtitle = "",
            accent = accentColor,
            compact = true,
            modifier = modifier.heightIn(max = 280.dp),
        )
        ShareRecipientsZoneContent.Listing -> Column(modifier.fillMaxWidth()) {
            if (state.recents.isNotEmpty()) RecentsRow(state.recents, snapshot, accentColor, actions.onToggle)
            if (state.offersGroupCreation) GroupToggle(state, snapshot.createsGroup, accentColor, actions.onCreatesGroupChange)
            ZoneSection(R.string.share_section_conversations, state.conversations, snapshot, accentColor, actions)
            ZoneSection(R.string.share_section_people, state.people, snapshot, accentColor, actions)
            CommunitiesSection(state.communities, snapshot, accentColor, actions)
        }
    }
}

@Composable
private fun ZoneSkeleton(rows: Int, modifier: Modifier) {
    val loading = stringResource(R.string.share_target_loading)
    Column(modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = loading }) {
        repeat(rows) {
            Row(
                modifier = Modifier.fillMaxWidth().testTag(ShareRecipientsSkeletonTestTag).heightIn(min = 56.dp)
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                MeeshySkeletonBox(Modifier.size(40.dp), CircleShape)
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                    MeeshySkeletonBox(Modifier.width(140.dp).height(14.dp))
                    MeeshySkeletonBox(Modifier.width(90.dp).height(10.dp))
                }
            }
        }
    }
}

@Composable
private fun RecentsRow(
    recents: List<ShareRecipient>,
    snapshot: ShareRecipientsZoneSnapshot,
    accentColor: Color,
    onToggle: (ShareRecipient) -> Unit,
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        items(recents, key = { it.id }, contentType = { "recent" }) { recipient ->
            val selected = recipient.id in snapshot.selectedIds
            val served = snapshot.deliveries[recipient.id].let { it != null && it !is ShareDelivery.Failed }
            val label = recipient.title + if (selected) ", " + stringResource(R.string.share_a11y_selected) else ""
            Column(
                modifier = Modifier
                    .width(64.dp)
                    .heightIn(min = 48.dp)
                    .clip(MaterialTheme.shapes.medium)
                    .clickable(enabled = !served) { onToggle(recipient) }
                    .testTag(ShareRecentChipTestTag)
                    .semantics(mergeDescendants = true) {
                        contentDescription = label
                        role = Role.Checkbox
                        this.selected = selected
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                MeeshyAvatar(
                    name = recipient.title,
                    size = 48.dp,
                    containerColor = recipient.accentHex?.let { hexColor(it) }?.takeIf { it != Color.Unspecified } ?: accentColor,
                    imageUrl = recipient.avatarUrl,
                    presence = ShareRecipientRowModel.presenceOf(recipient, snapshot.presenceOf),
                )
                if (selected) {
                    Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = accentColor, modifier = Modifier.size(16.dp))
                }
                Text(
                    text = recipient.title.substringBefore(' '),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun GroupToggle(state: ShareRecipientsZoneState, checked: Boolean, accentColor: Color, onChange: (Boolean) -> Unit) {
    val title = stringResource(R.string.share_group_create, state.groupCandidateNames)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(role = Role.Switch) { onChange(!checked) }
            .semantics(mergeDescendants = true) { contentDescription = title }
            .padding(horizontal = MeeshySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(MeeshyIcons.Groups, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary)
        Text(title, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary, modifier = Modifier.weight(1f))
        Switch(
            checked = checked,
            onCheckedChange = null,
            colors = SwitchDefaults.colors(checkedTrackColor = accentColor),
        )
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = MeeshyTheme.tokens.textMuted,
        modifier = Modifier
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
            .semantics { heading() },
    )
}

@Composable
private fun ZoneSection(
    titleRes: Int,
    recipients: List<ShareRecipient>,
    snapshot: ShareRecipientsZoneSnapshot,
    accentColor: Color,
    actions: ShareRecipientsZoneActions,
) {
    if (recipients.isEmpty()) return
    SectionHeader(stringResource(titleRes))
    recipients.forEach { recipient -> key(recipient.id) { ZoneRow(recipient, snapshot, accentColor, actions, Modifier) } }
}

@Composable
private fun ZoneRow(
    recipient: ShareRecipient,
    snapshot: ShareRecipientsZoneSnapshot,
    accentColor: Color,
    actions: ShareRecipientsZoneActions,
    modifier: Modifier,
) {
    ShareRecipientRow(
        model = ShareRecipientRowModel(
            recipient = recipient,
            presence = ShareRecipientRowModel.presenceOf(recipient, snapshot.presenceOf),
            selected = recipient.id in snapshot.selectedIds,
            delivery = snapshot.deliveries[recipient.id],
        ),
        accentColor = accentColor,
        onToggle = { actions.onToggle(recipient) },
        onRetry = { actions.onRetry(recipient) },
        modifier = modifier,
    )
}

@Composable
private fun CommunitiesSection(
    communities: List<ShareCommunityEntry>,
    snapshot: ShareRecipientsZoneSnapshot,
    accentColor: Color,
    actions: ShareRecipientsZoneActions,
) {
    if (communities.isEmpty()) return
    SectionHeader(stringResource(R.string.share_section_communities))
    communities.forEach { entry ->
        key(entry.community.id) {
            val hint = stringResource(R.string.share_community_channels)
            val spoken = entry.community.name + ", " + hint
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp)
                    .clickable(role = Role.Button) { actions.onToggleCommunity(entry) }
                    .semantics(mergeDescendants = true) { contentDescription = spoken }
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                MeeshyAvatar(name = entry.community.name, size = 40.dp, containerColor = accentColor, imageUrl = entry.community.avatarUrl)
                Column(Modifier.weight(1f)) {
                    Text(entry.community.name, style = MaterialTheme.typography.bodyLarge, color = MeeshyTheme.tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(hint, style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Icon(
                    if (entry.isExpanded) MeeshyIcons.ChevronUp else MeeshyIcons.ChevronDown,
                    contentDescription = null,
                    tint = MeeshyTheme.tokens.textMuted,
                )
            }
            entry.channels?.let { channels ->
                if (channels.isEmpty()) {
                    Text(
                        stringResource(R.string.share_community_no_channel),
                        style = MaterialTheme.typography.labelMedium,
                        color = MeeshyTheme.tokens.textMuted,
                        modifier = Modifier.padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.xs),
                    )
                }
                channels.forEach { channel ->
                    key(channel.id) { ZoneRow(channel, snapshot, accentColor, actions, Modifier.padding(start = MeeshySpacing.lg)) }
                }
            }
        }
    }
    Spacer(Modifier.height(MeeshySpacing.sm))
}
