package me.meeshy.app.contacts

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.Role
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.IconButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.PresenceLastSeen
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.sdk.model.friend.ContactList
import me.meeshy.sdk.model.friend.ContactPresenceCaption
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.ContactFilter
import me.meeshy.sdk.model.friend.ContactFilterCounts
import me.meeshy.sdk.model.friend.servedPresence
import me.meeshy.sdk.model.friend.resolvedName
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.sdk.model.friend.ConnectionActionRender
import me.meeshy.ui.component.ConnectionActionChip
import me.meeshy.ui.component.ConnectionFeedbackHost
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The Contacts (all-friends) tab — the online-first friend list with a scrolling filter
 * row and search, driven by [ContactsListViewModel]. Cache-first: a skeleton shows only on
 * a cold empty load; a populated roster paints immediately.
 *
 * The hub supplies what the roster cannot know: [phonebookContent] / [affiliatesContent]
 * (the two other filters' views), their chip counts, [onOpenStatus] (the mood status viewer;
 * the profile opens when absent) and the collapse report for its header.
 */
@Composable
fun ContactsListTab(
    onOpenProfile: (String) -> Unit = {},
    onOpenStatus: ((String) -> Unit)? = null,
    isActive: Boolean = true,
    onCollapseProgressChange: (Float) -> Unit = {},
    phonebookCount: Int = 0,
    affiliatesCount: Int = 0,
    phonebookContent: (@Composable () -> Unit)? = null,
    affiliatesContent: (@Composable () -> Unit)? = null,
    viewModel: ContactsListViewModel = hiltViewModel(),
    connectionViewModel: ConnectionActionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Box(modifier = Modifier.fillMaxSize()) {
        ContactsListContent(
            state = state,
            onSearch = viewModel::search,
            onFilter = viewModel::setFilter,
            onRefresh = viewModel::refresh,
            onRetry = viewModel::load,
            onOpenProfile = onOpenProfile,
            onOpenStatus = onOpenStatus ?: onOpenProfile,
            isActive = isActive,
            onCollapseProgressChange = onCollapseProgressChange,
            phonebookCount = phonebookCount,
            affiliatesCount = affiliatesCount,
            phonebookContent = phonebookContent,
            affiliatesContent = affiliatesContent,
        )
        ConnectionFeedbackHost(feedback = connectionViewModel.feedback)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ContactsListContent(
    state: ContactsListUiState,
    onSearch: (String) -> Unit,
    onFilter: (ContactFilter) -> Unit,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenStatus: (String) -> Unit,
    isActive: Boolean = true,
    onCollapseProgressChange: (Float) -> Unit = {},
    phonebookCount: Int = 0,
    affiliatesCount: Int = 0,
    phonebookContent: (@Composable () -> Unit)? = null,
    affiliatesContent: (@Composable () -> Unit)? = null,
) {
    val haptics = rememberMeeshyHaptics()
    val counts = remember(state.friends, state.query, phonebookCount, affiliatesCount) {
        ContactList.counts(state.friends, state.query, phonebookCount, affiliatesCount)
    }
    val listState = rememberLazyListState()
    LaunchedEffect(isActive, listState) {
        if (!isActive) return@LaunchedEffect
        snapshotFlow { collapseProgress(listState.firstVisibleItemIndex, listState.firstVisibleItemScrollOffset) }
            .collect(onCollapseProgressChange)
    }
    val now by rememberClockMillis(isActive)
    val slot = when (state.filter) {
        ContactFilter.Phonebook -> phonebookContent
        ContactFilter.Affiliates -> affiliatesContent
        else -> null
    }

    Column(modifier = Modifier.fillMaxSize()) {
        if (state.friends.isNotEmpty() || state.query.isNotEmpty()) {
            SearchField(query = state.query, onChange = onSearch)
        }
        FilterRow(
            selected = state.filter,
            counts = counts,
            onSelect = { filter ->
                if (filter != state.filter) haptics.selection()
                onFilter(filter)
            },
        )
        if (slot != null) {
            Box(modifier = Modifier.fillMaxSize()) { slot() }
            return@Column
        }
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = onRefresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            when {
                state.showSkeleton -> RosterSkeleton()
                state.errorMessage != null -> ErrorState(onRetry = onRetry)
                state.isEmpty -> EmptyMessage(Icons.Filled.People, stringResource(R.string.contacts_list_empty))
                state.isFilteredEmpty ->
                    EmptyMessage(Icons.Filled.SearchOff, stringResource(R.string.contacts_list_filtered_empty))
                else -> FriendList(
                    friends = state.visibleFriends,
                    listState = listState,
                    nowMillis = now,
                    moodEmojiFor = state::moodEmojiFor,
                    onOpenProfile = onOpenProfile,
                    onOpenStatus = onOpenStatus,
                )
            }
        }
    }
}

/** Header collapse report: 0 at rest, 1 once the list has scrolled a header's height. */
internal fun collapseProgress(firstVisibleIndex: Int, firstVisibleOffsetPx: Int): Float =
    if (firstVisibleIndex > 0) 1f else (firstVisibleOffsetPx / COLLAPSE_RANGE_PX).coerceIn(0f, 1f)

private const val COLLAPSE_RANGE_PX = 240f
private const val CLOCK_TICK_MILLIS = 30_000L

/** The shared wall clock of the roster: last-seen captions age without any new event. */
@Composable
private fun rememberClockMillis(active: Boolean): State<Long> =
    produceState(System.currentTimeMillis(), active) {
        while (active) {
            delay(CLOCK_TICK_MILLIS)
            value = System.currentTimeMillis()
        }
    }

@Composable
private fun SearchField(query: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = query,
        onValueChange = onChange,
        singleLine = true,
        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onChange("") }) {
                    Icon(Icons.Filled.Clear, contentDescription = stringResource(R.string.contacts_search_clear))
                }
            }
        },
        placeholder = { Text(stringResource(R.string.contacts_search_hint)) },
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun FilterRow(
    selected: ContactFilter,
    counts: ContactFilterCounts,
    onSelect: (ContactFilter) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ContactFilter.entries.forEach { filter ->
            val title = stringResource(filter.labelRes)
            val badge = counts.badgeFor(filter)
            val text = if (badge == null) title else "$title ($badge)"
            val description = stringResource(R.string.contacts_filter_a11y, text)
            FilterChip(
                selected = selected == filter,
                onClick = { onSelect(filter) },
                label = { Text(text, maxLines = 1, softWrap = false) },
                modifier = Modifier.semantics { contentDescription = description },
            )
        }
    }
}

@Composable
private fun RosterSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(vertical = 8.dp)) {
        repeat(SKELETON_ROWS) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MeeshySkeletonBox(modifier = Modifier.size(44.dp), shape = CircleShape)
                Spacer(Modifier.width(12.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    MeeshySkeletonBox(modifier = Modifier.width(140.dp).height(14.dp))
                    MeeshySkeletonBox(modifier = Modifier.width(90.dp).height(10.dp))
                }
            }
        }
    }
}

private const val SKELETON_ROWS = 8

@Composable
private fun FriendList(
    friends: List<FriendRequestUser>,
    listState: androidx.compose.foundation.lazy.LazyListState,
    nowMillis: Long,
    moodEmojiFor: (String) -> String?,
    onOpenProfile: (String) -> Unit,
    onOpenStatus: (String) -> Unit,
) {
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(vertical = 8.dp),
    ) {
        items(friends, key = { it.id }, contentType = { "friend" }) { friend ->
            FriendRow(
                friend,
                moodEmoji = moodEmojiFor(friend.id),
                onClick = { onOpenProfile(friend.id) },
                onMoodClick = { onOpenStatus(friend.id) },
                nowMillis = nowMillis,
                modifier = Modifier.animateItem(),
            )
        }
    }
}

/**
 * A contact row — iOS `ContactRow`: the row opens the profile, the mood emoji opens the
 * status, the caption says « En ligne » (green) or « Vu il y a… » (muted), a chevron ends it.
 * A presence the server did not serve draws no dot and no caption.
 */
@Composable
internal fun FriendRow(
    friend: FriendRequestUser,
    moodEmoji: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    onMoodClick: (() -> Unit)? = null,
    nowMillis: Long = System.currentTimeMillis(),
) {
    val name = friend.resolvedName.ifBlank { friend.username.ifBlank { "?" } }
    val presence = rememberPresence(friend.id, friend.servedPresence())
    val caption = ContactList.caption(presence, friend.lastActiveAt, nowMillis)
    val statusText = captionText(caption)
    val a11y = stringResource(
        R.string.contacts_list_row_a11y,
        name,
        friend.username,
        statusText ?: stringResource(R.string.contacts_list_offline_lower),
    )
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(enabled = friend.id.isNotBlank(), role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = a11y }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = name,
            context = AvatarContext.UserListItem,
            containerColor = hexColor(DynamicColorGenerator.colorForName(friend.id.ifBlank { name })),
            presence = presence,
            moodEmoji = moodEmoji,
            onMoodTap = onMoodClick,
            imageUrl = friend.avatar,
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            friend.username.takeIf { it.isNotBlank() }?.let {
                Text(
                    text = "@$it",
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            statusText?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (caption == ContactPresenceCaption.Online) MeeshyTheme.tokens.success
                    else MeeshyTheme.tokens.textMuted,
                    maxLines = 1,
                )
            }
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun captionText(caption: ContactPresenceCaption): String? = when (caption) {
    ContactPresenceCaption.None -> null
    ContactPresenceCaption.Online -> stringResource(R.string.contacts_list_online)
    is ContactPresenceCaption.LastSeen -> when (val since = caption.since) {
        PresenceLastSeen.Online -> stringResource(R.string.contacts_list_online)
        is PresenceLastSeen.MinutesAgo -> stringResource(R.string.contacts_list_last_seen_minutes, since.value)
        is PresenceLastSeen.HoursAgo -> stringResource(R.string.contacts_list_last_seen_hours, since.value)
        is PresenceLastSeen.DaysAgo -> stringResource(R.string.contacts_list_last_seen_days, since.value)
    }
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Centered {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.contacts_list_error),
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Spacer(Modifier.height(12.dp))
            Button(onClick = onRetry) { Text(stringResource(R.string.contacts_list_retry)) }
        }
    }
}

@Composable
private fun EmptyMessage(icon: androidx.compose.ui.graphics.vector.ImageVector, message: String) {
    Centered {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
            Icon(icon, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(40.dp))
            Spacer(Modifier.height(12.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

@get:StringRes
private val ContactFilter.labelRes: Int
    get() = when (this) {
        ContactFilter.All -> R.string.contacts_filter_all
        ContactFilter.Online -> R.string.contacts_filter_online
        ContactFilter.Offline -> R.string.contacts_filter_offline
        ContactFilter.Phonebook -> R.string.contacts_filter_phonebook
        ContactFilter.Affiliates -> R.string.contacts_filter_affiliates
    }
