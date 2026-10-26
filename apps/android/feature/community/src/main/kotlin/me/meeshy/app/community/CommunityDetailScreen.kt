package me.meeshy.app.community

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.AddComment
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.feature.community.R
import me.meeshy.sdk.model.Community
import me.meeshy.sdk.model.CommunityAccess
import me.meeshy.sdk.model.CommunityDetailAction
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.FeedbackToastRequest
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/** Ce que l'hôte sait faire depuis le détail ; une destination absente (`null`) retire son bouton plutôt que de le laisser inerte. */
data class CommunityDetailNavigation(
    val onBack: () -> Unit,
    val onOpenChannel: (String) -> Unit,
    val onOpenMembers: ((String) -> Unit)? = null,
    val onInvite: ((String) -> Unit)? = null,
    val onOpenSettings: ((String) -> Unit)? = null,
    val addChannelSheet: (@Composable (communityId: String, onAdded: () -> Unit, onDismiss: () -> Unit) -> Unit)? = null,
)

/**
 * Le détail d'une communauté (iOS `CommunityDetailScreen`) : bannière + avatar qui chevauche, stats,
 * rangée d'actions selon les droits, onglets Channels / Feed. Tout vient du cache d'abord.
 */
@Composable
fun CommunityDetailScreen(
    navigation: CommunityDetailNavigation,
    viewModel: CommunityDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val toasts = remember { MutableSharedFlow<FeedbackToastRequest>(extraBufferCapacity = 1) }
    var confirmLeave by remember { mutableStateOf(false) }
    var showAddChannel by remember { mutableStateOf(false) }

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                CommunityDetailEffect.Left -> navigation.onBack()
                CommunityDetailEffect.Joined -> haptics.success()
                CommunityDetailEffect.ActionFailed -> {
                    haptics.error()
                    toasts.emit(FeedbackToastRequest(R.string.community_action_failed, FeedbackKind.Error))
                }
            }
        }
    }

    Box(Modifier.fillMaxSize().background(MeeshyTheme.tokens.backgroundPrimary)) {
        val community = state.community
        val access = state.access
        when {
            community != null && access != null -> LoadedDetail(
                state = state,
                community = community,
                access = access,
                navigation = navigation,
                onTab = viewModel::selectTab,
                onJoin = viewModel::join,
                onLeave = { confirmLeave = true },
                onAddChannel = { showAddChannel = true },
            )
            state.showError -> MeeshyEmptyState(
                icon = Icons.Filled.Warning,
                title = stringResource(R.string.community_common_error),
                subtitle = stringResource(R.string.community_settings_error_default),
                actionLabel = stringResource(R.string.community_common_retry),
                onAction = viewModel::retry,
            )
            else -> DetailSkeleton()
        }
        if (community == null) {
            CommunityRoundButton(
                icon = Icons.AutoMirrored.Filled.ArrowBack,
                description = stringResource(R.string.community_back),
                onClick = navigation.onBack,
                modifier = Modifier.statusBarsPadding().padding(start = 8.dp),
                tint = MeeshyTheme.tokens.textPrimary,
                fill = MeeshyTheme.tokens.backgroundSecondary,
            )
        }
        FeedbackToastHost(toasts = toasts, modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
    }

    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text(stringResource(R.string.community_detail_leave_confirm_title)) },
            text = { Text(stringResource(R.string.community_detail_leave_confirm_message)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmLeave = false
                    haptics.warning()
                    viewModel.leave()
                }) { Text(stringResource(R.string.community_detail_leave_button), color = MeeshyTheme.tokens.error) }
            },
            dismissButton = {
                TextButton(onClick = { confirmLeave = false }) { Text(stringResource(R.string.community_common_cancel)) }
            },
        )
    }
    val sheet = navigation.addChannelSheet
    if (showAddChannel && sheet != null) {
        sheet(viewModel.communityId, { viewModel.reload() }, { showAddChannel = false })
    }
}

@Composable
private fun LoadedDetail(
    state: CommunityDetailUiState,
    community: Community,
    access: CommunityAccess,
    navigation: CommunityDetailNavigation,
    onTab: (CommunityDetailTab) -> Unit,
    onJoin: () -> Unit,
    onLeave: () -> Unit,
    onAddChannel: () -> Unit,
) {
    val accentHex = state.appearance?.color ?: "6366F1"
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        item(key = "header", contentType = "header") { DetailHeader(community, accentHex) }
        item(key = "stats", contentType = "stats") { StatsRow(community) }
        item(key = "actions", contentType = "actions") {
            ActionsSection(
                access = access,
                isJoining = state.isJoining,
                communityId = community.id,
                navigation = navigation,
                onJoin = onJoin,
                onLeave = onLeave,
                onAddChannel = onAddChannel,
            )
        }
        item(key = "tabs", contentType = "tabs") { TabPicker(state.tab, onTab) }
        when (state.tab) {
            CommunityDetailTab.CHANNELS -> channelsSection(state, access, onAddChannel, navigation.onOpenChannel)
            CommunityDetailTab.FEED -> item(key = "feed", contentType = "feed") {
                MeeshyEmptyState(
                    icon = Icons.Filled.PhotoLibrary,
                    title = stringResource(R.string.community_detail_posts_empty_title),
                    subtitle = stringResource(R.string.community_detail_posts_empty_subtitle),
                    modifier = Modifier.fillMaxWidth().height(220.dp),
                )
            }
        }
    }
    DetailTopBar(access = access, navigation = navigation, communityId = community.id, onLeave = onLeave)
}

@Composable
private fun DetailTopBar(
    access: CommunityAccess,
    navigation: CommunityDetailNavigation,
    communityId: String,
    onLeave: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CommunityRoundButton(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.community_back), navigation.onBack)
        Spacer(Modifier.weight(1f))
        if (access.showsHeaderMenu) {
            Box {
                CommunityRoundButton(Icons.Filled.MoreVert, stringResource(R.string.community_detail_menu_settings), { menuOpen = true })
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    val openSettings = navigation.onOpenSettings
                    if (access.canEditSettings && openSettings != null) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.community_detail_menu_settings)) },
                            leadingIcon = { Icon(Icons.Filled.Settings, contentDescription = null) },
                            onClick = {
                                menuOpen = false
                                openSettings(communityId)
                            },
                        )
                    }
                    if (access.canLeave) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.community_detail_menu_leave), color = MeeshyTheme.tokens.error) },
                            leadingIcon = { Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, tint = MeeshyTheme.tokens.error) },
                            onClick = {
                                menuOpen = false
                                onLeave()
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailHeader(community: Community, accentHex: String) {
    val tokens = MeeshyTheme.tokens
    val accent = remember(accentHex) { hexColor(accentHex) }
    Column {
        Box {
            CommunityBanner(community.banner, accentHex, Modifier.fillMaxWidth().height(190.dp))
            Box(
                Modifier.matchParentSize().background(
                    androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.3f))),
                ),
            )
            MeeshyAvatar(
                name = community.name,
                size = 72.dp,
                containerColor = accent,
                imageUrl = community.avatar,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 16.dp)
                    .offset(y = 36.dp)
                    .border(3.dp, tokens.backgroundPrimary, CircleShape),
            )
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 44.dp, bottom = 16.dp), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(community.name, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = tokens.textPrimary)
                community.description?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = tokens.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.width(8.dp))
            Row(
                Modifier.clip(CircleShape).background(tokens.backgroundSecondary).padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(if (community.isPrivate) Icons.Filled.Lock else Icons.Filled.Public, null, tint = tokens.textMuted, modifier = Modifier.size(11.dp))
                Text(
                    stringResource(if (community.isPrivate) R.string.community_privacy_private else R.string.community_privacy_public),
                    color = tokens.textMuted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
private fun StatsRow(community: Community) {
    val tokens = MeeshyTheme.tokens
    Row(
        Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(tokens.backgroundSecondary.copy(alpha = 0.5f))
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StatItem(Modifier.weight(1f), community.memberCount, stringResource(R.string.community_detail_stats_members), Icons.Filled.People)
        Box(Modifier.width(1.dp).height(30.dp).background(tokens.hairline))
        StatItem(Modifier.weight(1f), community.conversationCount, stringResource(R.string.community_detail_stats_channels), Icons.Filled.ChatBubble)
    }
}

@Composable
private fun StatItem(modifier: Modifier, value: Int, label: String, icon: ImageVector) {
    val tokens = MeeshyTheme.tokens
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(icon, null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(14.dp))
            Text(value.toString(), fontWeight = FontWeight.Bold, fontSize = 18.sp, color = tokens.textPrimary)
        }
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = tokens.textSecondary)
    }
}

@Composable
private fun ActionsSection(
    access: CommunityAccess,
    isJoining: Boolean,
    communityId: String,
    navigation: CommunityDetailNavigation,
    onJoin: () -> Unit,
    onLeave: () -> Unit,
    onAddChannel: () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    val actions = remember(access) {
        access.detailActions.filter { action ->
            when (action) {
                CommunityDetailAction.MEMBERS -> navigation.onOpenMembers != null
                CommunityDetailAction.INVITE -> navigation.onInvite != null
                CommunityDetailAction.CHANNEL -> navigation.addChannelSheet != null
                CommunityDetailAction.SETTINGS -> navigation.onOpenSettings != null
                CommunityDetailAction.JOIN -> true
            }
        }
    }
    Column(Modifier.padding(horizontal = 16.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            actions.forEach { action ->
                val (icon, label) = action.face()
                ActionButton(
                    icon = icon,
                    label = label,
                    enabled = !(action == CommunityDetailAction.JOIN && isJoining),
                    modifier = Modifier.weight(1f),
                    onClick = {
                        haptics.light()
                        when (action) {
                            CommunityDetailAction.MEMBERS -> navigation.onOpenMembers?.invoke(communityId)
                            CommunityDetailAction.INVITE -> navigation.onInvite?.invoke(communityId)
                            CommunityDetailAction.CHANNEL -> onAddChannel()
                            CommunityDetailAction.SETTINGS -> navigation.onOpenSettings?.invoke(communityId)
                            CommunityDetailAction.JOIN -> onJoin()
                        }
                    },
                )
            }
        }
        if (access.canLeave) {
            val error = MeeshyTheme.tokens.error
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(error.copy(alpha = 0.1f))
                    .pressableScale(onClick = onLeave, pressedScale = 0.97f)
                    .padding(vertical = 10.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.AutoMirrored.Filled.ExitToApp, null, tint = error, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.community_detail_leave_label), color = error, fontWeight = FontWeight.Medium, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun CommunityDetailAction.face(): Pair<ImageVector, String> = when (this) {
    CommunityDetailAction.MEMBERS -> Icons.Filled.People to stringResource(R.string.community_detail_action_members)
    CommunityDetailAction.INVITE -> Icons.Filled.PersonAdd to stringResource(R.string.community_detail_action_invite)
    CommunityDetailAction.CHANNEL -> Icons.Filled.AddComment to stringResource(R.string.community_detail_action_channel)
    CommunityDetailAction.SETTINGS -> Icons.Filled.Settings to stringResource(R.string.community_detail_action_settings)
    CommunityDetailAction.JOIN -> Icons.AutoMirrored.Filled.Login to stringResource(R.string.community_detail_action_join)
}

@Composable
private fun ActionButton(icon: ImageVector, label: String, enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier
            .clip(RoundedCornerShape(12.dp))
            .background(tokens.backgroundSecondary.copy(alpha = 0.5f))
            .pressableScale(onClick = onClick, enabled = enabled)
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(icon, null, tint = if (enabled) MeeshyPalette.Indigo500 else tokens.textMuted, modifier = Modifier.size(22.dp))
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = tokens.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun TabPicker(tab: CommunityDetailTab, onTab: (CommunityDetailTab) -> Unit) {
    val tabs = CommunityDetailTab.entries
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        tabs.forEachIndexed { index, entry ->
            SegmentedButton(
                selected = tab == entry,
                onClick = { onTab(entry) },
                shape = SegmentedButtonDefaults.itemShape(index, tabs.size),
            ) {
                Text(
                    stringResource(
                        if (entry == CommunityDetailTab.CHANNELS) R.string.community_detail_tab_channels else R.string.community_detail_tab_feed,
                    ),
                )
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.channelsSection(
    state: CommunityDetailUiState,
    access: CommunityAccess,
    onAddChannel: () -> Unit,
    onOpenChannel: (String) -> Unit,
) {
    if (state.channels.isEmpty()) {
        item(key = "channels-empty", contentType = "empty") {
            val canAdd = access.canAddChannel
            MeeshyEmptyState(
                icon = Icons.Filled.ChatBubble,
                title = stringResource(R.string.community_detail_channels_empty_title),
                subtitle = stringResource(R.string.community_detail_channels_empty_subtitle),
                actionLabel = if (canAdd) stringResource(R.string.community_detail_channels_empty_action) else null,
                onAction = if (canAdd) onAddChannel else null,
                modifier = Modifier.fillMaxWidth().height(220.dp),
            )
        }
        return
    }
    items(state.channels, key = { "channel-${it.id}" }, contentType = { "channel" }) { channel ->
        ChannelRow(channel, onClick = { onOpenChannel(channel.id) }, modifier = Modifier.animateItem())
    }
}

@Composable
private fun ChannelRow(channel: CommunityChannelRow, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val title = channel.title ?: stringResource(R.string.community_detail_channel_fallback_name)
    Row(
        modifier
            .fillMaxWidth()
            .pressableScale(onClick = onClick, pressedScale = 0.98f)
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .semantics(mergeDescendants = true) { contentDescription = title },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(MeeshyPalette.Indigo500.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Tag, null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp)) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            channel.description?.let {
                Text(it, fontSize = 13.sp, color = tokens.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        channel.memberCount?.let { Text(it.toString(), fontSize = 12.sp, fontWeight = FontWeight.Medium, color = tokens.textMuted) }
    }
}

@Composable
private fun DetailSkeleton() {
    Column(Modifier.fillMaxSize()) {
        MeeshySkeletonBox(Modifier.fillMaxWidth().height(190.dp), RoundedCornerShape(0.dp))
        Spacer(Modifier.height(52.dp))
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            MeeshySkeletonBox(Modifier.width(180.dp).height(24.dp))
            MeeshySkeletonBox(Modifier.fillMaxWidth().height(14.dp))
            Spacer(Modifier.height(8.dp))
            MeeshySkeletonBox(Modifier.fillMaxWidth().height(64.dp), RoundedCornerShape(12.dp))
        }
    }
}
