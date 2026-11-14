package me.meeshy.ui.component.reaction

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Fermée, la palette se rétracte dans sa fenêtre au lieu de disparaître d'un coup (iOS : échelle 0,85 et fondu). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostReactionPaletteExitTest {

    @get:Rule
    val compose = createComposeRule()

    private var open by mutableStateOf(true)

    @Test
    fun `a closed palette stays in its popup through its exit, then leaves`() {
        compose.setContent {
            Box(Modifier.size(48.dp)) {
                PostReactionPalette(isOpen = open, onDismiss = {}, onPick = {}, emojis = listOf(EMOJI))
            }
        }
        compose.waitForIdle()
        compose.onAllNodesWithText(EMOJI, useUnmergedTree = true).assertCountEquals(1)

        compose.mainClock.autoAdvance = false
        open = false
        Snapshot.sendApplyNotifications()
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()

        compose.onAllNodesWithText(EMOJI, useUnmergedTree = true).assertCountEquals(1)

        compose.mainClock.autoAdvance = true
        compose.waitForIdle()

        compose.onAllNodesWithText(EMOJI, useUnmergedTree = true).assertCountEquals(0)
    }

    private companion object {
        const val EMOJI = "👍"
    }
}
