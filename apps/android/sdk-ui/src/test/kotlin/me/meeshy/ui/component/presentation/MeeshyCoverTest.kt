package me.meeshy.ui.component.presentation

import androidx.activity.ComponentActivity
import androidx.activity.ComponentDialog
import androidx.compose.animation.EnterTransition
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.window.DialogProperties
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.motion.meeshyReducedFadeIn
import me.meeshy.ui.motion.meeshyReducedFadeOut
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowDialog

/**
 * Le plein écran Meeshy monte du bas et redescend AVANT de rendre la main (#18524) : `dismiss` et le retour système
 * jouent la sortie, puis appellent `onDismissRequest` une seule fois. La fenêtre n'a plus d'animation système : seule la
 * montée du contenu joue. L'hôte de surcouche peint sa dernière valeur pendant la sortie.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyCoverTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private class Record {
        var dismissed = 0
        var scope: MeeshyCoverScope? = null
    }

    private fun showCover(record: Record) {
        compose.setContent {
            var showing by remember { mutableStateOf(true) }
            if (showing) {
                MeeshyCoverDialog(
                    onDismissRequest = { record.dismissed++; showing = false },
                    properties = DialogProperties(usePlatformDefaultWidth = false),
                ) {
                    record.scope = this
                    Text(CONTENT)
                }
            }
        }
        compose.waitForIdle()
    }

    private fun dialog(): ComponentDialog = ShadowDialog.getLatestDialog() as ComponentDialog

    @Test
    fun `dismiss closes once the exit is at rest, and a second dismiss during the exit does nothing`() {
        val record = Record()
        showCover(record)

        compose.mainClock.autoAdvance = false
        compose.runOnUiThread { record.scope!!.dismiss() }
        compose.mainClock.advanceTimeBy(COVER_MILLIS / 3L)
        assertThat(record.dismissed).isEqualTo(0)
        compose.onNodeWithText(CONTENT).assertExists()

        compose.runOnUiThread { record.scope!!.dismiss() }
        compose.mainClock.advanceTimeBy(COVER_MILLIS * 2L)
        compose.mainClock.autoAdvance = true
        compose.waitForIdle()

        assertThat(record.dismissed).isEqualTo(1)
    }

    @Test
    fun `the system back plays the exit before closing`() {
        val record = Record()
        showCover(record)

        compose.mainClock.autoAdvance = false
        compose.runOnUiThread { dialog().onBackPressedDispatcher.onBackPressed() }
        compose.mainClock.advanceTimeBy(COVER_MILLIS / 3L)
        assertThat(record.dismissed).isEqualTo(0)

        compose.mainClock.autoAdvance = true
        compose.waitForIdle()
        assertThat(record.dismissed).isEqualTo(1)
    }

    @Test
    fun `a cover whose properties refuse the system back stays open on back`() {
        var dismissed = 0
        compose.setContent {
            MeeshyCoverDialog(
                onDismissRequest = { dismissed++ },
                properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false),
            ) {
                Text(CONTENT)
            }
        }
        compose.waitForIdle()

        compose.runOnUiThread { dialog().onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()

        assertThat(dismissed).isEqualTo(0)
        compose.onNodeWithText(CONTENT).assertExists()
    }

    @Test
    fun `the dialog window has no system animation, only the content rises`() {
        showCover(Record())

        assertThat(dialog().window!!.attributes.windowAnimations).isEqualTo(0)
    }

    @Test
    fun `under reduce motion the cover enters and leaves with the short fade`() {
        assertThat(meeshyCoverEnter(reduce = true)).isEqualTo(meeshyReducedFadeIn())
        assertThat(meeshyCoverExit(reduce = true)).isEqualTo(meeshyReducedFadeOut())
        assertThat(meeshyCoverEnter(reduce = false)).isNotEqualTo(meeshyReducedFadeIn())
        assertThat(meeshyCoverEnter(reduce = false)).isNotEqualTo(EnterTransition.None)
    }

    @Test
    fun `the host keeps painting the last value during its exit`() {
        var value: String? by mutableStateOf("premier")
        compose.setContent { MeeshyCoverHost(value = value) { Text(it) } }
        compose.waitForIdle()

        compose.mainClock.autoAdvance = false
        Snapshot.withMutableSnapshot { value = null }
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeBy(COVER_MILLIS / 3L)
        compose.onNodeWithText("premier").assertExists()

        compose.mainClock.autoAdvance = true
        compose.waitForIdle()
        compose.onNodeWithText("premier").assertDoesNotExist()
    }

    @Test
    fun `the host listens to back only while visible and given onBack`() {
        var value: String? by mutableStateOf("visible")
        var backs = 0
        var activityBacks = 0
        compose.runOnUiThread {
            compose.activity.onBackPressedDispatcher.addCallback(
                object : androidx.activity.OnBackPressedCallback(true) {
                    override fun handleOnBackPressed() { activityBacks++ }
                },
            )
        }
        var withBack by mutableStateOf(true)
        compose.setContent {
            MeeshyCoverHost(value = value, onBack = if (withBack) ({ backs++ }) else null) { Text(it) }
        }
        compose.waitForIdle()

        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        assertThat(backs).isEqualTo(1)

        Snapshot.withMutableSnapshot { withBack = false }
        compose.waitForIdle()
        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        assertThat(backs).isEqualTo(1)
        assertThat(activityBacks).isEqualTo(1)

        Snapshot.withMutableSnapshot { withBack = true; value = null }
        compose.waitForIdle()
        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        assertThat(backs).isEqualTo(1)
        assertThat(activityBacks).isEqualTo(2)
    }

    private companion object {
        const val CONTENT = "plein écran"
    }
}
