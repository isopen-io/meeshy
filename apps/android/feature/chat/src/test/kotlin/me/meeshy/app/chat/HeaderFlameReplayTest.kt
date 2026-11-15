package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13297 — à l'envoi, la flamme TIENT le compte d'avant jusqu'à s'être allumée, y compris quand
 * l'instantané servi est arrivé APRÈS la première composition (cas nominal : la relecture répond
 * après l'ouverture du fil).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class HeaderFlameReplayTest {

    @get:Rule
    val compose = createComposeRule()

    private val today = ConversationEngagementSnapshot.dayString(LocalDate.now())

    private fun snap(todayPoints: Int) = ConversationEngagementSnapshot("c1", 120, todayPoints, 4, today)

    private fun shows(text: String): Boolean =
        compose.onAllNodesWithText(text, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()

    private fun serve(state: androidx.compose.runtime.MutableState<ConversationEngagementSnapshot?>, value: ConversationEngagementSnapshot) {
        Snapshot.withMutableSnapshot { state.value = value }
        compose.mainClock.advanceTimeBy(100)
    }

    @Test
    fun `a send after a late snapshot holds the old day count until the flame has caught`() {
        val sent = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
        val snapshot = mutableStateOf<ConversationEngagementSnapshot?>(null)
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                HeaderFlameDecoration(
                    snapshot = snapshot.value,
                    sent = sent,
                    headerExpanded = false,
                    dismissed = false,
                    onDismiss = {},
                ) { Box(Modifier.size(36.dp)) }
            }
        }
        compose.mainClock.advanceTimeBy(100)
        serve(snapshot, snap(todayPoints = 4))
        compose.mainClock.advanceTimeBy(1_000)
        assertThat(shows("4")).isTrue()

        sent.tryEmit(Unit)
        compose.mainClock.advanceTimeBy(50)
        serve(snapshot, snap(todayPoints = 9))
        compose.mainClock.advanceTimeBy(400)
        assertThat(shows("4")).isTrue()
        assertThat(shows("9")).isFalse()

        compose.mainClock.advanceTimeBy(3_000)
        assertThat(shows("9")).isTrue()
        assertThat(shows("4")).isFalse()
    }

    private fun cardShown(): Boolean =
        compose.onAllNodesWithTag("chat.header.flame.card", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()

    @Test
    fun `touching the flame opens its card instead of hiding it, and the card hides it (#17770)`() {
        var dismissed = 0
        var openedGame = 0
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                HeaderFlameDecoration(
                    snapshot = ConversationEngagementSnapshot("c1", 340, 40, 12, today),
                    sent = MutableSharedFlow(),
                    headerExpanded = false,
                    dismissed = false,
                    onDismiss = { dismissed += 1 },
                    onOpenProgression = { openedGame += 1 },
                ) { Box(Modifier.size(36.dp)) }
            }
        }
        assertThat(cardShown()).isFalse()

        compose.onNodeWithTag("chat.header.flame").performClick()
        compose.waitForIdle()
        assertThat(cardShown()).isTrue()
        assertThat(dismissed).isEqualTo(0)
        assertThat(shows("+40")).isTrue()
        assertThat(shows("340")).isTrue()

        compose.onNodeWithText("Hide the flame").performClick()
        compose.waitForIdle()
        assertThat(dismissed).isEqualTo(1)
        assertThat(openedGame).isEqualTo(0)
    }

    @Test
    fun `the card leads to the game (#17770)`() {
        var openedGame = 0
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                HeaderFlameDecoration(
                    snapshot = ConversationEngagementSnapshot("c1", 340, 40, 12, today),
                    sent = MutableSharedFlow(),
                    headerExpanded = false,
                    dismissed = false,
                    onDismiss = {},
                    onOpenProgression = { openedGame += 1 },
                ) { Box(Modifier.size(36.dp)) }
            }
        }
        compose.onNodeWithTag("chat.header.flame").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Open the game").performClick()
        compose.waitForIdle()
        assertThat(openedGame).isEqualTo(1)
    }
}
