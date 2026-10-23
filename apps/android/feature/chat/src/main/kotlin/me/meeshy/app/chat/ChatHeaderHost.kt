package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddLink
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Header layer: the search bar while a search is active, the conversation top bar otherwise.
 * Reads [ChatHostContext] only; the ViewModel is reached through its plain callbacks.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ChatHeaderHost(host: ChatHostContext) {
    val state = host.state
    val actions = host.actions
    val navigation = host.navigation
    val sheets = host.sheets
    val accentColor = host.accentColor
    if (state.search.isActive) {
        ChatSearchBar(
            search = state.search,
            accentColor = accentColor,
            onQueryChange = actions.onSearchQueryChange,
            onPrevious = actions.previousSearchMatch,
            onNext = actions.nextSearchMatch,
            onClose = actions.closeSearch,
        )
    } else {
        TopAppBar(
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = Color.Transparent,
                scrolledContainerColor = Color.Transparent,
                titleContentColor = MeeshyTheme.tokens.textPrimary,
                navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                actionIconContentColor = MeeshyPalette.Indigo500,
            ),
            title = {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(accentColor),
                        )
                        Text(
                            text = state.conversationTitle ?: stringResource(R.string.chat_title),
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(start = MeeshySpacing.sm),
                        )
                        if (!state.isGroup) {
                            val presenceColor = meeshyPresenceDotColor(state.headerPresence(System.currentTimeMillis()))
                            if (presenceColor != null) {
                                Box(
                                    modifier = Modifier
                                        .padding(start = MeeshySpacing.xs)
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(presenceColor),
                                )
                            }
                        }
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                    ) {
                        TypingAvatarCluster(
                            stack = TypingAvatarStack.of(state.typingParticipants),
                            accentColor = accentColor,
                        )
                        ChatHeaderSubtitleRow(
                            subtitle = ChatHeaderSubtitle.of(
                                memberCount = state.memberCount,
                                isGroup = state.isGroup,
                                typing = state.typingParticipants,
                            ),
                            accentColor = accentColor,
                        )
                    }
                }
            },
            navigationIcon = {
                IconButton(onClick = navigation.onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.chat_back))
                }
            },
            actions = {
                val peerName = state.conversationTitle.orEmpty()
                IconButton(onClick = actions.openSearch) {
                    Icon(Icons.Filled.Search, contentDescription = stringResource(R.string.chat_search))
                }
                IconButton(onClick = { sheets.stats = true }) {
                    Icon(
                        Icons.Filled.Insights,
                        contentDescription = stringResource(R.string.conversation_stats_title),
                    )
                }
                IconButton(onClick = { sheets.analysis = true }) {
                    Icon(
                        Icons.Filled.AutoAwesome,
                        contentDescription = stringResource(R.string.conversation_analysis_title),
                    )
                }
                if (state.isGroup) {
                    IconButton(onClick = { sheets.members = true }) {
                        Icon(
                            Icons.Filled.Group,
                            contentDescription = stringResource(R.string.conversation_members_open),
                        )
                    }
                }
                // Moderator+ viewers of a group get the admin surfaces: the
                // share-link creator and the conversation-settings sheet
                // (write-role / announcement / slow-mode / auto-translate).
                if (state.slowModeExempt) {
                    if (state.isGroup) {
                        IconButton(onClick = navigation.onCreateShareLink) {
                            Icon(
                                Icons.Filled.AddLink,
                                contentDescription = stringResource(R.string.chat_create_share_link),
                            )
                        }
                    }
                    IconButton(onClick = { sheets.settings = true }) {
                        Icon(
                            Icons.Filled.Tune,
                            contentDescription = stringResource(R.string.conversation_settings_title),
                        )
                    }
                }
                // A share-link guest carries composer permissions: iOS hides the call
                // entry for `viewerIsGuest`, so does this header.
                val callEntry = navigation.callEntry.takeIf { state.composerPermissions == null }
                val ongoing = state.activeCall
                    ?.takeIf { callEntry != null && RejoinPillPolicy.shouldOffer(it, navigation.hasLocalLiveCall) }
                if (ongoing != null) {
                    // An call the local session lost is still live server-side:
                    // offer « Rejoindre » (a tap joins the existing call via the
                    // shared auto-answer path) instead of placing a NEW call.
                    RejoinCallPill(
                        isVideo = ongoing.isVideo,
                        onClick = { navigation.onRejoinCall(ongoing, peerName) },
                    )
                } else if (callEntry?.canStart == true) {
                    IconButton(onClick = { navigation.onStartCall(peerName, false) }) {
                        Icon(Icons.Filled.Call, contentDescription = stringResource(R.string.chat_call_audio))
                    }
                    IconButton(onClick = { navigation.onStartCall(peerName, true) }) {
                        Icon(Icons.Filled.Videocam, contentDescription = stringResource(R.string.chat_call_video))
                    }
                }
            },
        )
    }
}
