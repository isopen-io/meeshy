package me.meeshy.app.community

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.feature.community.R
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.FeedbackToastRequest
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private fun MemberRole.icon(): ImageVector = when (this) {
    MemberRole.CREATOR -> Icons.Filled.WorkspacePremium
    MemberRole.ADMIN -> Icons.Filled.AdminPanelSettings
    MemberRole.MODERATOR -> Icons.Filled.Security
    MemberRole.MEMBER -> Icons.Filled.Person
}

@Composable
private fun MemberRole.label(): String = stringResource(
    when (this) {
        MemberRole.CREATOR -> R.string.community_role_creator
        MemberRole.ADMIN -> R.string.community_role_admin
        MemberRole.MODERATOR -> R.string.community_role_moderator
        MemberRole.MEMBER -> R.string.community_role_member
    },
)

@Composable
private fun MemberRole.sectionTitle(): String = stringResource(
    when (this) {
        MemberRole.CREATOR -> R.string.community_members_section_creator
        MemberRole.ADMIN -> R.string.community_members_section_admin
        MemberRole.MODERATOR -> R.string.community_members_section_moderator
        MemberRole.MEMBER -> R.string.community_members_section_member
    },
)

/** Les membres d'une communauté (iOS `CommunityMembersScreen`) : sections par rôle, menu de rôle et de retrait pour l'admin. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun CommunityMembersScreen(
    onBack: () -> Unit,
    onInvite: () -> Unit,
    viewModel: CommunityMembersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val toasts = remember { MutableSharedFlow<FeedbackToastRequest>(extraBufferCapacity = 1) }
    var confirmRemove by remember { mutableStateOf<ApiCommunityMember?>(null) }
    val listState = rememberLazyListState()
    LoadMoreNearEnd(listState, enabled = state.hasMore && !state.isLoadingMore, onLoadMore = viewModel::loadMore)

    LaunchedEffect(viewModel) {
        viewModel.effects.collect {
            haptics.error()
            toasts.emit(FeedbackToastRequest(R.string.community_action_failed, FeedbackKind.Error))
        }
    }
    val tokens = MeeshyTheme.tokens
    Box(Modifier.fillMaxSize().background(tokens.backgroundPrimary)) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.community_back), tint = tokens.textPrimary)
                }
                Text(
                    stringResource(R.string.community_members_title), Modifier.weight(1f),
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), color = tokens.textPrimary,
                )
                if (state.canInvite) {
                    IconButton(onClick = { haptics.light(); onInvite() }) {
                        Icon(Icons.Filled.PersonAdd, stringResource(R.string.community_detail_action_invite), tint = androidx.compose.ui.graphics.Color(0xFF6366F1))
                    }
                }
            }
            PullToRefreshBox(isRefreshing = state.isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.fillMaxSize()) {
                when {
                    state.showSkeleton -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        repeat(6) { MeeshySkeletonBox(Modifier.fillMaxWidth().height(48.dp)) }
                    }
                    state.showError -> MeeshyEmptyState(
                        Icons.Filled.Warning, stringResource(R.string.community_common_error),
                        stringResource(R.string.community_settings_error_default),
                        actionLabel = stringResource(R.string.community_common_retry), onAction = viewModel::retry,
                    )
                    state.isEmpty -> MeeshyEmptyState(
                        Icons.Filled.Groups, stringResource(R.string.community_members_empty_title),
                        stringResource(R.string.community_members_empty_subtitle),
                        actionLabel = if (state.canInvite) stringResource(R.string.community_members_empty_action) else null,
                        onAction = if (state.canInvite) onInvite else null,
                    )
                    else -> LazyColumn(Modifier.fillMaxSize(), state = listState) {
                        state.sections.forEach { section ->
                            stickyHeader(key = "header-${section.role}", contentType = "header") {
                                SectionHeader(section.role, section.rows.size)
                            }
                            items(section.rows.size, key = { section.rows[it].member.id }, contentType = { "member" }) { index ->
                                val row = section.rows[index]
                                MemberRowView(
                                    row = row,
                                    onRole = { role -> haptics.selection(); viewModel.changeRole(row.member, role) },
                                    onRemove = { confirmRemove = row.member },
                                    modifier = Modifier.animateItem(),
                                )
                            }
                        }
                        if (state.hasMore) item(key = "more") {
                            Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                            }
                        }
                        item(key = "bottom") { Spacer(Modifier.navigationBarsPadding().height(16.dp)) }
                    }
                }
            }
        }
        FeedbackToastHost(toasts = toasts, modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
    }
    confirmRemove?.let { member ->
        AlertDialog(
            onDismissRequest = { confirmRemove = null },
            title = { Text(member.user?.let { it.displayName ?: it.username } ?: stringResource(R.string.community_members_unknown_user)) },
            text = { Text(stringResource(R.string.community_members_remove)) },
            confirmButton = {
                TextButton(onClick = { haptics.warning(); viewModel.remove(member); confirmRemove = null }) {
                    Text(stringResource(R.string.community_members_remove), color = MeeshyTheme.tokens.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmRemove = null }) { Text(stringResource(R.string.community_common_cancel)) } },
        )
    }
}

@Composable
private fun LoadMoreNearEnd(state: LazyListState, enabled: Boolean, onLoadMore: () -> Unit) {
    val nearEnd by remember(state) {
        derivedStateOf {
            val info = state.layoutInfo
            info.totalItemsCount > 0 && (info.visibleItemsInfo.lastOrNull()?.index ?: -1) >= info.totalItemsCount - 4
        }
    }
    LaunchedEffect(nearEnd, enabled) { if (nearEnd && enabled) onLoadMore() }
}

@Composable
private fun SectionHeader(role: MemberRole, count: Int) {
    val tokens = MeeshyTheme.tokens
    Row(
        Modifier.fillMaxWidth().background(tokens.backgroundSecondary).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(role.icon(), null, tint = tokens.textSecondary, modifier = Modifier.size(12.dp))
        Text(role.sectionTitle().uppercase(), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = tokens.textSecondary)
        Text(count.toString(), fontSize = 11.sp, color = tokens.textMuted)
    }
}

@Composable
private fun MemberRowView(row: CommunityMemberRow, onRole: (MemberRole) -> Unit, onRemove: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val member = row.member
    val user = member.user
    val name = user?.let { it.displayName ?: it.username }?.takeIf { it.isNotBlank() } ?: stringResource(R.string.community_members_unknown_user)
    val role = member.communityRole
    val roleColor = role.communityRoleColor.let { if (it == androidx.compose.ui.graphics.Color.Unspecified) tokens.textMuted else it }
    var menu by remember { mutableStateOf(false) }
    Column(modifier) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            MeeshyAvatar(
                name = name, size = 44.dp,
                containerColor = hexColor(DynamicColorGenerator.colorForName(name)),
                presence = PresenceState.ONLINE.takeIf { user?.isOnline == true },
                imageUrl = user?.avatar,
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(name, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(role.icon(), null, tint = roleColor, modifier = Modifier.size(12.dp))
                    Text(role.label(), fontSize = 12.sp, fontWeight = FontWeight.Medium, color = roleColor)
                }
            }
            if (!row.actions.isEmpty) {
                Box {
                    IconButton(onClick = { menu = true }) {
                        Icon(Icons.Filled.MoreVert, stringResource(R.string.community_member_options_a11y, name), tint = tokens.textMuted)
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        row.actions.assignableRoles.forEach { target ->
                            DropdownMenuItem(
                                text = { Text(target.label()) },
                                leadingIcon = { Icon(target.icon(), null) },
                                onClick = { menu = false; onRole(target) },
                            )
                        }
                        if (row.actions.canRemove) {
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.community_members_remove), color = tokens.error) },
                                leadingIcon = { Icon(Icons.Filled.PersonRemove, null, tint = tokens.error) },
                                onClick = { menu = false; onRemove() },
                            )
                        }
                    }
                }
            }
        }
        HorizontalDivider(Modifier.padding(start = 72.dp), color = tokens.hairline)
    }
}
