package me.meeshy.ui.component.presentation

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * L'hôte qui monte une feuille sur un état (`pending?.let`, `if (open)`) la laisse redescendre quand l'état passe à
 * null : la feuille reste dans l'arbre jusqu'à la fin de sa descente, puis l'hôte la démonte, sans rappeler
 * `onDismissRequest` (l'état est déjà fermé). Un contenu qui n'est pas une `MeeshyModalSheet` part à l'image suivante.
 */
@OptIn(ExperimentalMaterial3Api::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshySheetPresenceTest {

    @get:Rule
    val compose = createComposeRule()

    private var item by mutableStateOf<String?>(NAME)

    @Test
    fun `an item gone to null keeps its sheet until the descent ends, without calling onDismissRequest`() {
        var dismissed = 0
        compose.setContent {
            MeeshySheetPresence(item) { name ->
                MeeshyModalSheet(onDismissRequest = { dismissed++ }) { Text(name) }
            }
        }
        compose.waitForIdle()

        compose.mainClock.autoAdvance = false
        set(null)
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()

        compose.onAllNodesWithText(NAME).assertCountEquals(1)

        compose.mainClock.autoAdvance = true
        compose.waitForIdle()

        compose.onAllNodesWithText(NAME).assertCountEquals(0)
        assertThat(dismissed).isEqualTo(0)
    }

    @Test
    fun `a content without a Meeshy sheet leaves at the next frame`() {
        compose.setContent { MeeshySheetPresence(item) { name -> Text(name) } }
        compose.waitForIdle()

        compose.mainClock.autoAdvance = false
        set(null)
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()

        compose.onAllNodesWithText(NAME).assertCountEquals(0)
    }

    @Test
    fun `an item that comes back while its sheet goes down is shown again`() {
        compose.setContent {
            MeeshySheetPresence(item) { name -> MeeshyModalSheet(onDismissRequest = {}) { Text(name) } }
        }
        compose.waitForIdle()

        compose.mainClock.autoAdvance = false
        set(null)
        compose.mainClock.advanceTimeByFrame()
        set(OTHER)
        compose.mainClock.autoAdvance = true
        compose.waitForIdle()

        compose.onAllNodesWithText(OTHER).assertCountEquals(1)
    }

    private fun set(next: String?) {
        item = next
        Snapshot.sendApplyNotifications()
    }

    private companion object {
        const val NAME = "Alice"
        const val OTHER = "Bob"
    }
}
