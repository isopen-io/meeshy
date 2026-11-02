package me.meeshy.app.conversations

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertCountEquals
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import java.time.Instant
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.sdk.socket.PresenceStore
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.AvatarPresenceDotTestTag
import me.meeshy.ui.component.AvatarPresenceDotTouchTestTag
import me.meeshy.ui.component.LocalPresenceStore
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Le point de la rangée lit la présence du pair à la CELLULE d'avatar (`rememberPresence`, tick partagé
 * de 15 s), jamais dans le modèle de la rangée ; et le toucher du point dit « vu il y a X » deux secondes
 * (iOS `onOnlineTap`) sans ouvrir la conversation.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ConversationRowPresenceDotTest {

    @get:Rule
    val compose = createComposeRule()

    private val now = 1_800_000_000_000L

    private val direct = ApiConversation(
        id = "c1",
        type = "direct",
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-ali", userId = "ali", displayName = "Ali"),
        ),
    )

    private val group = ApiConversation(id = "c2", type = "group", title = "Team")

    private fun store(
        live: MutableStateFlow<PresenceState?>,
        entry: UserPresence? = null,
    ): PresenceStore = mockk {
        every { presenceOf("ali") } returns live
        every { currentStateOf("ali", null) } answers { live.value }
        every { entries } returns MutableStateFlow(listOfNotNull(entry?.let { "ali" to it }).toMap())
        every { entriesNow() } returns listOfNotNull(entry?.let { "ali" to it }).toMap()
        every { nowMillis() } returns now
    }

    private fun lastActive(agoMillis: Long) =
        UserPresence(isOnline = false, lastActiveAt = Instant.ofEpochMilli(now - agoMillis).toString())

    private fun show(
        live: MutableStateFlow<PresenceState?>,
        conversation: ApiConversation = direct,
        entry: UserPresence? = null,
        typing: String? = null,
        moodEmoji: String? = null,
        here: ConversationHere = ConversationHere.ABSENT,
        actions: ConversationRowActions = ConversationRowActions(),
    ) {
        compose.setContent {
            CompositionLocalProvider(
                LocalReduceMotion provides true,
                LocalPresenceStore provides store(live, entry),
            ) {
                MeeshyTheme {
                    ConversationRowContainer(
                        model = ConversationRowModel(
                            conversation = conversation,
                            currentUserId = "me",
                            currentUserPrefs = null,
                            peerUserId = if (conversation.type == "direct") "ali" else null,
                            storyRing = StoryRingState.None,
                            moodEmoji = moodEmoji,
                            draft = null,
                            typingDisplayName = typing,
                            categories = emptyList(),
                            previewMessages = null,
                            isLocked = false,
                            nowMillis = now,
                            here = here,
                        ),
                        actions = actions,
                    )
                }
            }
        }
    }

    private fun dots() = compose.onAllNodesWithTag(AvatarPresenceDotTestTag, useUnmergedTree = true)

    private fun target() = compose.onNodeWithTag(AvatarPresenceDotTouchTestTag, useUnmergedTree = true)

    @Test
    fun `the dot follows the live presence while the row model never changes`() {
        val live = MutableStateFlow<PresenceState?>(PresenceState.ONLINE)
        show(live)
        dots().assertCountEquals(1)

        compose.runOnIdle { live.value = PresenceState.OFFLINE }
        compose.waitForIdle()

        dots().assertCountEquals(0)
        compose.onAllNodesWithTag(AvatarPresenceDotTouchTestTag, useUnmergedTree = true).assertCountEquals(0)
    }

    @Test
    fun `a group row reads no presence at all`() {
        show(MutableStateFlow(PresenceState.ONLINE), conversation = group)

        dots().assertCountEquals(0)
        compose.onAllNodesWithTag(AvatarPresenceDotTouchTestTag, useUnmergedTree = true).assertCountEquals(0)
    }

    @Test
    fun `a peer who types is forced green whatever the store says`() {
        show(MutableStateFlow(PresenceState.OFFLINE), typing = "Ali")

        dots().assertCountEquals(1)
    }

    @Test
    fun `the here dot still shows without any served presence`() {
        show(MutableStateFlow(null), here = ConversationHere.HERE)

        dots().assertCountEquals(1)
        target().assertIsDisplayed()
    }

    @Test
    fun `touching the dot says last seen for two seconds and does not open the conversation`() {
        var opened = 0
        show(
            MutableStateFlow(PresenceState.AWAY),
            entry = lastActive(5 * 60_000L),
            actions = ConversationRowActions(onClick = { opened++ }),
        )
        compose.onNodeWithText("Last seen 5min ago", useUnmergedTree = true).assertDoesNotExist()

        target().performClick()

        compose.onNodeWithText("Last seen 5min ago", useUnmergedTree = true).assertIsDisplayed()
        compose.mainClock.advanceTimeBy(1_900L)
        compose.onNodeWithText("Last seen 5min ago", useUnmergedTree = true).assertIsDisplayed()
        compose.mainClock.advanceTimeBy(200L)
        compose.waitForIdle()
        compose.onNodeWithText("Last seen 5min ago", useUnmergedTree = true).assertDoesNotExist()
        assertThat(opened).isEqualTo(0)
    }

    @Test
    fun `under a minute the tooltip reads Online`() {
        show(MutableStateFlow(PresenceState.ONLINE), entry = lastActive(10_000L))

        target().performClick()

        compose.onNodeWithText("Online", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `a peer without an activity date shows no tooltip`() {
        show(MutableStateFlow(PresenceState.ONLINE), entry = UserPresence(isOnline = true))

        target().performClick()
        compose.waitForIdle()

        compose.onNodeWithText("Online", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `the touch zone stays on the dot and leaves the centre of the avatar to the row`() {
        var opened = 0
        show(
            MutableStateFlow(PresenceState.AWAY),
            entry = lastActive(5 * 60_000L),
            actions = ConversationRowActions(onClick = { opened++ }),
        )
        val zone = target().fetchSemanticsNode().boundsInRoot
        val disc = compose.onNodeWithContentDescription("Ali", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot

        assertThat(zone.contains(disc.center)).isFalse()

        compose.onNodeWithContentDescription("Ali", useUnmergedTree = true).performClick()

        assertThat(opened).isEqualTo(1)
        compose.onNodeWithText("Last seen 5min ago", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `TalkBack gets the See last activity action on the row and it shows the tooltip`() {
        show(MutableStateFlow(PresenceState.AWAY), entry = lastActive(5 * 60_000L))

        val actions = compose.onNodeWithTag(ROW_TEST_TAG).fetchSemanticsNode().config[SemanticsActions.CustomActions]
        val action = actions.single { it.label == "See last activity" }
        compose.runOnIdle { action.action() }

        compose.onNodeWithText("Last seen 5min ago", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `a row with no dot offers no last activity action`() {
        show(MutableStateFlow(PresenceState.OFFLINE))

        val config = compose.onNodeWithTag(ROW_TEST_TAG).fetchSemanticsNode().config
        val labels = if (SemanticsActions.CustomActions in config) {
            config[SemanticsActions.CustomActions].map { it.label }
        } else {
            emptyList()
        }
        assertThat(labels).doesNotContain("See last activity")
    }
}
