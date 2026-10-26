package me.meeshy.app.community

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.feature.community.R
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.FeedbackToastRequest
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/** Inviter des membres (iOS `CommunityInviteScreen`) : recherche, résultats, coche une fois invité, « Récemment invités ». */
@Composable
fun CommunityInviteScreen(
    onDone: () -> Unit,
    viewModel: CommunityInviteViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val toasts = remember { MutableSharedFlow<FeedbackToastRequest>(extraBufferCapacity = 1) }
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                CommunityInviteEffect.Invited -> haptics.success()
                CommunityInviteEffect.Failed -> {
                    haptics.error()
                    toasts.emit(FeedbackToastRequest(R.string.community_action_failed, FeedbackKind.Error))
                }
            }
        }
    }
    val tokens = MeeshyTheme.tokens
    Box(Modifier.fillMaxSize().background(tokens.backgroundPrimary)) {
        Column(Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onDone) { Text(stringResource(R.string.community_common_done), color = tokens.textSecondary) }
                Text(
                    stringResource(R.string.community_invite_title), Modifier.weight(1f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), color = tokens.textPrimary,
                )
                Spacer(Modifier.width(72.dp))
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp).clip(RoundedCornerShape(12.dp))
                    .background(tokens.backgroundSecondary.copy(alpha = 0.5f)).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Search, null, tint = tokens.textMuted, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Box(Modifier.weight(1f)) {
                    PlainField(state.query, viewModel::onQuery, stringResource(R.string.community_invite_search_placeholder), ImeAction.Search)
                }
            }
            AnimatedContent(
                targetState = if (state.isSearching) 0 else if (state.showsNoResults) 1 else 2,
                modifier = Modifier.fillMaxSize(),
                label = "inviteBody",
            ) { mode ->
                when (mode) {
                    0 -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                        CircularProgressIndicator(Modifier.padding(top = 32.dp).size(28.dp), strokeWidth = 2.dp, color = MeeshyPalette.Indigo500)
                    }
                    1 -> MeeshyEmptyState(
                        Icons.Filled.PersonSearch,
                        stringResource(R.string.community_invite_empty_title),
                        stringResource(R.string.community_invite_empty_subtitle),
                    )
                    else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
                        if (state.recentlyInvited.isNotEmpty()) {
                            item(key = "recent-title") {
                                Text(
                                    stringResource(R.string.community_invite_recently_invited).uppercase(),
                                    Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                                    fontSize = 12.sp, fontWeight = FontWeight.Bold, color = tokens.textMuted,
                                )
                            }
                            items(state.recentlyInvited, key = { "recent-${it.id}" }) { user ->
                                InviteRow(user, invited = true, inviting = false, onInvite = {}, modifier = Modifier.animateItem())
                            }
                            item(key = "results-title") {
                                Spacer(Modifier.padding(top = 8.dp))
                            }
                        }
                        items(state.results, key = { "result-${it.id}" }, contentType = { "result" }) { user ->
                            InviteRow(
                                user,
                                invited = user.id in state.invitedIds,
                                inviting = state.invitingId == user.id,
                                onInvite = { viewModel.invite(user) },
                                modifier = Modifier.animateItem(),
                            )
                        }
                        item(key = "bottom") { Spacer(Modifier.navigationBarsPadding()) }
                    }
                }
            }
        }
        FeedbackToastHost(toasts = toasts, modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
    }
}

@Composable
private fun InviteRow(user: UserSearchResult, invited: Boolean, inviting: Boolean, onInvite: () -> Unit, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val name = user.displayName ?: user.username
    Row(
        modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        MeeshyAvatar(
            name = name, size = 44.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(user.username)),
            presence = PresenceState.ONLINE.takeIf { user.isOnline == true },
            imageUrl = user.avatar,
        )
        Column(Modifier.weight(1f)) {
            Text(name, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("@${user.username}", fontSize = 13.sp, color = tokens.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (invited) {
            val scale by animateFloatAsState(1f, MeeshyMotion.springBouncy(), label = "check")
            Icon(
                Icons.Filled.CheckCircle, null, tint = MeeshyPalette.Success,
                modifier = Modifier.size(28.dp).graphicsLayer { scaleX = scale; scaleY = scale },
            )
        } else {
            Box(
                Modifier.clip(CircleShape).background(if (inviting) MeeshyPalette.Indigo500.copy(alpha = 0.5f) else MeeshyPalette.Indigo500)
                    .pressableScale(onClick = onInvite, enabled = !inviting, pressedScale = 0.94f)
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (inviting) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
                else Text(stringResource(R.string.community_invite_button), color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
        }
    }
}
