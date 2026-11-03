package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.swipe.LocalSwipeRowCoordinator
import me.meeshy.ui.component.swipe.SwipeRowCoordinator
import me.meeshy.ui.theme.MeeshyTheme

internal fun swipeTestConversation(id: String, unreadCount: Int = 0) = ApiConversation(
    id = id,
    identifier = id,
    type = "group",
    title = "Team $id",
    unreadCount = unreadCount,
    currentUserRole = "member",
)

/** Un membre inscrit : la loi d'actions ne propose « Masquer » qu'à lui (`hide = registered && isActiveMember`). */
internal val swipeTestViewer = MeeshyUser(id = "me", username = "me", role = "USER", isAnonymous = false)

internal fun swipeTestModel(conversation: ApiConversation) = ConversationRowModel(
    conversation = conversation,
    currentUserId = "me",
    currentUserPrefs = swipeTestViewer,
    peerUserId = null,
    storyRing = StoryRingState.None,
    moodEmoji = null,
    draft = null,
    typingDisplayName = null,
    categories = emptyList(),
    previewMessages = null,
    isLocked = false,
    nowMillis = 0L,
)

/** Des rangées dans une colonne, sous un même coordinateur de glissement et sans animation. */
@Composable
internal fun SwipeTestHost(
    rows: List<Pair<ApiConversation, ConversationRowActions>>,
    coordinator: SwipeRowCoordinator = SwipeRowCoordinator(),
    direction: LayoutDirection = LayoutDirection.Ltr,
) {
    CompositionLocalProvider(
        LocalReduceMotion provides true,
        LocalSwipeRowCoordinator provides coordinator,
        LocalLayoutDirection provides direction,
    ) {
        MeeshyTheme {
            Column {
                rows.forEach { (conversation, actions) ->
                    ConversationRow(model = swipeTestModel(conversation), actions = actions)
                }
            }
        }
    }
}
