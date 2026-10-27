package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
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

    private fun shownCount(text: String): Int =
        compose.onAllNodesWithText(text, useUnmergedTree = true).fetchSemanticsNodes().size

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
        snapshot.value = snap(todayPoints = 4)
        compose.mainClock.advanceTimeBy(1_000)
        assertThat(shownCount("4")).isEqualTo(1)

        sent.tryEmit(Unit)
        compose.mainClock.advanceTimeBy(50)
        snapshot.value = snap(todayPoints = 9)
        compose.mainClock.advanceTimeBy(500)
        assertThat(shownCount("4")).isEqualTo(1)
        assertThat(shownCount("9")).isEqualTo(0)

        compose.mainClock.advanceTimeBy(3_000)
        assertThat(shownCount("9")).isEqualTo(1)
    }
}
