package me.meeshy.ui.motion

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import me.meeshy.sdk.model.accessibility.MotionSpecs
import me.meeshy.ui.accessibility.LocalReduceMotion
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Une puce, un bandeau ou une carte montés sur une valeur (`visible = x != null`) sortent avec la DERNIÈRE valeur
 * affichée, pas sur un contenu vide ; et sous « Réduire les animations », la sortie est le fondu court de 150 ms, quelle
 * que soit la transition demandée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class HeldVisibilityTest {

    @get:Rule
    val compose = createComposeRule()

    private var value by mutableStateOf<String?>(SHOWN)

    private fun show(reduce: Boolean) {
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduce) {
                MeeshyAnimatedVisibility(
                    value = value,
                    enter = fadeIn(tween(LONG_MILLIS)),
                    exit = fadeOut(tween(LONG_MILLIS)),
                ) { text -> Text(text) }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `the last value stays shown halfway through the exit, then leaves`() {
        show(reduce = false)

        compose.mainClock.autoAdvance = false
        set(null)
        compose.mainClock.advanceTimeBy(LONG_MILLIS / 2L)

        compose.onAllNodesWithText(SHOWN).assertCountEquals(1)

        compose.mainClock.advanceTimeBy(LONG_MILLIS.toLong())
        compose.onAllNodesWithText(SHOWN).assertCountEquals(0)
    }

    @Test
    fun `under reduce motion the exit is the 150 ms fade, not the requested transition`() {
        show(reduce = true)

        compose.mainClock.autoAdvance = false
        set(null)
        compose.mainClock.advanceTimeBy(MotionSpecs.REDUCED_FADE_MILLIS + 100L)

        compose.onAllNodesWithText(SHOWN).assertCountEquals(0)
    }

    @Test
    fun `a new value replaces the held one`() {
        show(reduce = false)

        set(OTHER)
        compose.waitForIdle()

        compose.onAllNodesWithText(OTHER).assertCountEquals(1)
        compose.onAllNodesWithText(SHOWN).assertCountEquals(0)
    }

    private fun set(next: String?) {
        value = next
        Snapshot.sendApplyNotifications()
    }

    private companion object {
        const val SHOWN = "Bonjour"
        const val OTHER = "Salut"
        const val LONG_MILLIS = 1000
    }
}
