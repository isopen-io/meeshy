package me.meeshy.app.conversations

import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.coroutines.channels.Channel
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * A row's « 2 min » ages on screen (iOS `TimelineView(.periodic(every: 60))`): the list owns
 * one minute clock, ticking on the minute boundary, and the row reads the time from it.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationListMinuteClockTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `the next tick lands on the minute boundary, never now`() {
        assertThat(ConversationListMinuteClock.delayToNextTick(30_000L)).isEqualTo(30_000L)
        assertThat(ConversationListMinuteClock.delayToNextTick(60_000L)).isEqualTo(60_000L)
        assertThat(ConversationListMinuteClock.delayToNextTick(119_999L)).isEqualTo(1L)
    }

    @Test
    fun `the clock sleeps to the minute boundary, then moves`() {
        var wall = 30_000L
        val sleeps = mutableListOf<Long>()
        val wake = Channel<Unit>(Channel.UNLIMITED)
        compose.setContent {
            val now by rememberMinuteClock(now = { wall }, sleep = { sleeps += it; wake.receive() })
            Text("t=$now")
        }
        compose.onNodeWithText("t=30000").assertExists()
        compose.runOnIdle { assertThat(sleeps).containsExactly(30_000L) }

        wall = 60_000L
        wake.trySend(Unit)

        compose.onNodeWithText("t=60000").assertExists()
        compose.runOnIdle { assertThat(sleeps).containsExactly(30_000L, 60_000L).inOrder() }
    }

    @Test
    fun `a row tells its age from the list clock`() {
        val sent = Instant.parse("2026-10-23T08:00:00Z").toEpochMilli()
        compose.setContent {
            MeeshyTheme {
                ConversationRow(
                    model = ConversationRowModel(
                        conversation = ApiConversation(
                            id = "c1",
                            title = "Team",
                            type = "group",
                            lastMessage = ApiConversationLastMessage(
                                id = "m1",
                                content = "hello",
                                createdAt = "2026-10-23T08:00:00Z",
                            ),
                        ),
                        currentUserId = "me",
                        currentUserPrefs = null,
                        presence = null,
                        storyRing = StoryRingState.None,
                        moodEmoji = null,
                        draft = null,
                        typingDisplayName = null,
                        categories = emptyList(),
                        previewMessages = null,
                        isLocked = false,
                        nowMillis = sent + 5 * 60_000L,
                    ),
                    actions = ConversationRowActions(),
                )
            }
        }

        compose.onNodeWithText("5 min").assertExists()
    }
}
