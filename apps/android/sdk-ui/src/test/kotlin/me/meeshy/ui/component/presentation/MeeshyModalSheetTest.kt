package me.meeshy.ui.component.presentation

import androidx.compose.foundation.clickable
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La feuille système Meeshy redescend AVANT de fermer : `dismiss` joue `hide()`, puis rend la main une seule fois. Un
 * second toucher pendant la descente ne rejoue rien ; une descente interrompue (la feuille remonte) réarme `dismiss`.
 *
 * Les boutons se touchent par leur action d'accessibilité : sous Robolectric, un toucher injecté dans la fenêtre d'une
 * `ModalBottomSheet` n'atteint pas ses enfants.
 */
@OptIn(ExperimentalMaterial3Api::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyModalSheetTest {

    @get:Rule
    val compose = createComposeRule()

    private class Record {
        var dismissed = 0
        var chosen = 0
    }

    private fun showSheet(record: Record) {
        compose.setContent {
            var showing by remember { mutableStateOf(true) }
            if (showing) {
                MeeshyModalSheet(onDismissRequest = { record.dismissed++; showing = false }) {
                    Text(CLOSE, Modifier.clickable { dismiss() })
                    Text(CHOOSE, Modifier.clickable { dismiss { record.chosen++; showing = false } })
                }
            }
        }
        compose.waitForIdle()
    }

    private fun tapDuringTheExit(label: String) {
        compose.mainClock.autoAdvance = false
        compose.onNodeWithText(label).performSemanticsAction(SemanticsActions.OnClick)
        compose.mainClock.advanceTimeByFrame()
    }

    private fun finishTheExit() {
        compose.mainClock.autoAdvance = true
        compose.waitForIdle()
    }

    @Test
    fun `dismiss closes only once the sheet has gone down, and a second tap does not close twice`() {
        val record = Record()
        showSheet(record)

        tapDuringTheExit(CLOSE)
        compose.onNodeWithText(CLOSE).performSemanticsAction(SemanticsActions.OnClick)
        compose.mainClock.advanceTimeByFrame()

        assertThat(record.dismissed).isEqualTo(0)
        compose.onAllNodesWithText(CLOSE).assertCountEquals(1)

        finishTheExit()

        assertThat(record.dismissed).isEqualTo(1)
        compose.onAllNodesWithText(CLOSE).assertCountEquals(0)
    }

    @Test
    fun `dismiss with a choice runs the choice instead of onDismissRequest`() {
        val record = Record()
        showSheet(record)

        tapDuringTheExit(CHOOSE)
        assertThat(record.chosen).isEqualTo(0)
        finishTheExit()

        assertThat(record.chosen).isEqualTo(1)
        assertThat(record.dismissed).isEqualTo(0)
    }

    @Test
    fun `a descent interrupted by the sheet coming back up re-arms dismiss`() {
        val record = Record()
        lateinit var state: SheetState
        lateinit var scope: CoroutineScope
        compose.setContent {
            state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
            scope = rememberCoroutineScope()
            MeeshyModalSheet(onDismissRequest = { record.dismissed++ }, sheetState = state) {
                Text(CLOSE, Modifier.clickable { dismiss() })
            }
        }
        compose.waitForIdle()

        tapDuringTheExit(CLOSE)
        compose.runOnUiThread { scope.launch { state.show() } }
        finishTheExit()

        assertThat(record.dismissed).isEqualTo(0)
        assertThat(state.isVisible).isTrue()

        compose.onNodeWithText(CLOSE).performSemanticsAction(SemanticsActions.OnClick)
        compose.waitForIdle()

        assertThat(record.dismissed).isEqualTo(1)
    }

    private companion object {
        const val CLOSE = "Fermer"
        const val CHOOSE = "Choisir"
    }
}
