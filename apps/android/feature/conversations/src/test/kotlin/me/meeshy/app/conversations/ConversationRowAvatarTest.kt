package me.meeshy.app.conversations

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.AvatarPresenceDotTestTag
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #15989 — l'avatar d'une ligne a SES gestes (miroir de `LentilleRowAvatar`, iOS #15887) : son toucher et son
 * appui long n'atteignent jamais la ligne, l'anneau non lu ouvre la story, le badge la bulle d'humeur, et
 * TalkBack le lit comme un bouton à part.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ConversationRowAvatarTest {

    @get:Rule
    val compose = createComposeRule()

    private val direct = ApiConversation(
        id = "c1",
        type = "direct",
        participants = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-ali", userId = "ali", displayName = "Ali"),
        ),
    )

    private val group = ApiConversation(id = "c2", type = "group", title = "Team")

    private class Calls {
        var row = 0
        var rowMenu = 0
        var avatar = 0
        var info = 0
        var story = 0
        var mood = 0
        var moodShown = 0
    }

    private fun actions(calls: Calls, avatar: Boolean = true) = ConversationRowActions(
        onClick = { calls.row++ },
        onLoadPreview = { calls.rowMenu++ },
        onAvatarTap = if (avatar) ({ calls.avatar++ }) else null,
        onAvatarInfo = { calls.info++ },
        onViewProfile = {},
        onViewStory = { calls.story++ },
        onMoodBadgeTap = { calls.mood++ },
        onMoodShown = { calls.moodShown++ },
    )

    private fun show(
        actions: ConversationRowActions,
        conversation: ApiConversation = direct,
        storyRing: StoryRingState = StoryRingState.None,
        moodEmoji: String? = null,
        isLocked: Boolean = false,
    ) {
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides true) {
                MeeshyTheme {
                    ConversationRowContainer(
                        model = ConversationRowModel(
                            conversation = conversation,
                            currentUserId = "me",
                            currentUserPrefs = null,
                            peerUserId = if (conversation.type == "direct") "ali" else null,
                            storyRing = storyRing,
                            moodEmoji = moodEmoji,
                            draft = null,
                            typingDisplayName = null,
                            categories = emptyList(),
                            previewMessages = null,
                            isLocked = isLocked,
                            nowMillis = 0L,
                        ),
                        actions = actions,
                    )
                }
            }
        }
    }

    private fun avatar() = compose.onNodeWithTag(ROW_AVATAR_TEST_TAG)

    @Test
    fun `toucher l'avatar route l'avatar et n'ouvre jamais le fil`() {
        val calls = Calls()
        show(actions(calls))

        avatar().performClick()

        assertThat(calls.avatar).isEqualTo(1)
        assertThat(calls.row).isEqualTo(0)
    }

    @Test
    fun `l'appui long sur l'avatar ouvre son menu, jamais celui de la ligne`() {
        val calls = Calls()
        show(actions(calls))

        avatar().performTouchInput { longClick() }
        compose.waitForIdle()

        assertThat(calls.rowMenu).isEqualTo(0)
        assertThat(calls.row).isEqualTo(0)
        compose.onNodeWithText("Conversation info").performClick()
        assertThat(calls.info).isEqualTo(1)
    }

    @Test
    fun `l'anneau de story non lu ouvre la story du pair`() {
        val calls = Calls()
        show(actions(calls), storyRing = StoryRingState.Unread)

        avatar().performClick()

        assertThat(calls.story).isEqualTo(1)
        assertThat(calls.avatar).isEqualTo(0)
        assertThat(calls.row).isEqualTo(0)
    }

    @Test
    fun `le badge d'humeur ouvre la bulle et l'humeur peinte compte une impression`() {
        val calls = Calls()
        show(actions(calls), moodEmoji = "🔥")
        compose.waitForIdle()
        assertThat(calls.moodShown).isEqualTo(1)

        compose.onNodeWithContentDescription("mood 🔥", ignoreCase = true, useUnmergedTree = true).performClick()

        assertThat(calls.mood).isEqualTo(1)
        assertThat(calls.row).isEqualTo(0)
    }

    @Test
    fun `TalkBack lit l'avatar d'un direct comme un bouton qui ouvre le profil, menu en actions`() {
        show(actions(Calls()))

        val config = avatar().fetchSemanticsNode().config
        assertThat(config[SemanticsProperties.ContentDescription].first()).isEqualTo("View profile of Ali")
        assertThat(config[SemanticsProperties.Role]).isEqualTo(Role.Button)
        assertThat(config[SemanticsActions.CustomActions].map { it.label })
            .containsExactly("Conversation info", "View profile").inOrder()

        val row = compose.onNodeWithTag(ROW_TEST_TAG).fetchSemanticsNode().config
        assertThat(row[SemanticsProperties.ContentDescription].joinToString()).doesNotContain("View profile of")
    }

    @Test
    fun `l'avatar d'un groupe se dit details et n'offre que les infos`() {
        show(actions(Calls()), conversation = group)

        val config = avatar().fetchSemanticsNode().config
        assertThat(config[SemanticsProperties.ContentDescription].first()).isEqualTo("Details of Team")
        assertThat(config[SemanticsActions.CustomActions].map { it.label }).containsExactly("Conversation info")
    }

    @Test
    fun `une conversation verrouillee se dit details et n'offre plus le profil`() {
        show(actions(Calls()), storyRing = StoryRingState.Read, isLocked = true)

        val config = avatar().fetchSemanticsNode().config
        assertThat(config[SemanticsProperties.ContentDescription].first()).isEqualTo("Details of Ali")
        assertThat(config[SemanticsActions.CustomActions].map { it.label })
            .containsExactly("Conversation info", "View story").inOrder()
    }

    @Test
    fun `la bande d'avatar est une cible d'au moins 48 dp`() {
        show(actions(Calls()))

        compose.onNodeWithTag(ROW_AVATAR_BAND_TEST_TAG, useUnmergedTree = true)
            .assertWidthIsAtLeast(ROW_AVATAR_MIN_TARGET)
            .assertHeightIsAtLeast(ROW_AVATAR_MIN_TARGET)
    }

    @Test
    fun `sans destination de details, le toucher de l'avatar reste a la ligne`() {
        val calls = Calls()
        show(actions(calls, avatar = false))

        compose.onNodeWithTag(ROW_AVATAR_TEST_TAG).assertDoesNotExist()
        compose.onNodeWithContentDescription("Ali", useUnmergedTree = true).performClick()

        assertThat(calls.row).isEqualTo(1)
    }

    @Test
    fun `un pair sans presence servie n'a aucun point`() {
        show(actions(Calls()))

        compose.onAllNodesWithTag(AvatarPresenceDotTestTag, useUnmergedTree = true).assertCountEquals(0)
    }
}
