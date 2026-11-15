package me.meeshy.ui.component.permission

import android.app.Application
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.performSemanticsAction
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.PermissionSurface
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La feuille d'explication posée sur une surface sensible au toucher (la toile du compositeur, #14077) : son choix ne
 * part qu'une fois la feuille sortie de l'écran, si bien que sa fenêtre couvre la surface jusqu'au bout du geste et
 * qu'aucun toucher ne la traverse. Un second toucher pendant la sortie ne rejoue pas le choix.
 *
 * Les boutons se touchent par leur action d'accessibilité : sous Robolectric, un toucher injecté dans la fenêtre d'une
 * `ModalBottomSheet` n'atteint pas ses enfants, alors qu'il atteint ceux d'un `Dialog`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PermissionRationaleSheetTouchTest {

    @get:Rule
    val compose = createComposeRule()

    private val application: Application = ApplicationProvider.getApplicationContext()
    private val nature = PermissionNature.PHOTO_LIBRARY_ADD
    private val continueLabel = application.getString(MediaPermissionMessages.copy(nature, PermissionSurface.RATIONALE).action)
    private val notNowLabel = application.getString(R.string.media_permission_not_now)

    private class Record {
        var surfaceTaps = 0
        var continued = 0
        var dismissed = 0
    }

    private fun showSheetOverSurface(): Record {
        val record = Record()
        compose.setContent {
            var showing by remember { mutableStateOf(true) }
            MeeshyTheme {
                Box(
                    Modifier
                        .fillMaxSize()
                        .pointerInput(Unit) { detectTapGestures { record.surfaceTaps++ } },
                )
                if (showing) {
                    PermissionRationaleSheet(
                        nature = nature,
                        onContinue = {
                            record.continued++
                            showing = false
                        },
                        onDismiss = {
                            record.dismissed++
                            showing = false
                        },
                    )
                }
            }
        }
        compose.waitForIdle()
        return record
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
    fun `Continue reports only once the sheet has left and reaches nothing beneath it`() {
        val record = showSheetOverSurface()

        tapDuringTheExit(continueLabel)

        assertThat(record.continued).isEqualTo(0)
        compose.onAllNodesWithText(continueLabel).assertCountEquals(1)

        finishTheExit()

        assertThat(record.continued).isEqualTo(1)
        assertThat(record.dismissed).isEqualTo(0)
        assertThat(record.surfaceTaps).isEqualTo(0)
        compose.onAllNodesWithText(continueLabel).assertCountEquals(0)
    }

    @Test
    fun `Not now reports only once the sheet has left and reaches nothing beneath it`() {
        val record = showSheetOverSurface()

        tapDuringTheExit(notNowLabel)

        assertThat(record.dismissed).isEqualTo(0)

        finishTheExit()

        assertThat(record.dismissed).isEqualTo(1)
        assertThat(record.continued).isEqualTo(0)
        assertThat(record.surfaceTaps).isEqualTo(0)
    }

    @Test
    fun `a second tap while the sheet leaves does not replay the choice`() {
        val record = showSheetOverSurface()

        tapDuringTheExit(continueLabel)
        compose.onNodeWithText(continueLabel).performSemanticsAction(SemanticsActions.OnClick)
        finishTheExit()

        assertThat(record.continued).isEqualTo(1)
        assertThat(record.surfaceTaps).isEqualTo(0)
    }
}
