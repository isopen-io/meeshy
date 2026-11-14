package me.meeshy.ui.component.settings

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performSemanticsAction
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La fiche d'un « i » ne disparaît pas d'un coup : fermée, sa fenêtre reste ouverte le temps de sa sortie, puis
 * `onDismiss` part, une seule fois même si l'on touche encore pendant la sortie.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SettingsInfoOverlayTest {

    @get:Rule
    val compose = createComposeRule()

    private val application: Application = ApplicationProvider.getApplicationContext()
    private val closeLabel = application.getString(R.string.common_close)
    private val info = SettingsInfo(id = "i", title = "Statut en ligne", message = "Ce que voient vos amis.", question = "?")

    @Test
    fun `closing keeps the card through its exit, then reports once`() {
        var dismissed = 0
        compose.setContent {
            var shown by remember { mutableStateOf<SettingsInfo?>(info) }
            MeeshyTheme {
                SettingsInfoOverlay(info = shown, onDismiss = { dismissed++; shown = null })
            }
        }
        compose.waitForIdle()

        compose.mainClock.autoAdvance = false
        val close = compose.onNode(hasText(closeLabel) and hasClickAction())
        close.performSemanticsAction(SemanticsActions.OnClick)
        compose.mainClock.advanceTimeByFrame()
        close.performSemanticsAction(SemanticsActions.OnClick)
        compose.mainClock.advanceTimeByFrame()

        compose.onAllNodesWithText(info.title).assertCountEquals(1)
        assertThat(dismissed).isEqualTo(0)

        compose.mainClock.autoAdvance = true
        compose.waitForIdle()

        compose.onAllNodesWithText(info.title).assertCountEquals(0)
        assertThat(dismissed).isEqualTo(1)
    }
}
