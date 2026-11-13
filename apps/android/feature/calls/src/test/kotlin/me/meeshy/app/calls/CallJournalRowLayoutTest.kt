package me.meeshy.app.calls

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #17342, P6.4 — dans le journal, l'heure dans l'appel reste à droite de la ligne méta et y reste VISIBLE, quelle que soit
 * la longueur du nom : le nom s'abrège, l'heure ne sort jamais de la ligne (le journal d'après l'appel fait de même).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallJournalRowLayoutTest {
    @get:Rule val rule = createComposeRule()

    private val rowWidth = 240.dp

    @Test
    fun `a very long name is shortened and the hour in the call stays inside the row`() {
        val line = CallLiveCaptionLine(
            key = "j1", speakerId = "peer", speakerName = "Awa ".repeat(40).trim(), isLocal = false, text = "Salut",
            languageTag = "EN → FR", isFinal = true, capturedAtMs = 75_000, isShowingOriginal = false, canRevealOriginal = false,
            timeLabel = "01:15",
        )
        rule.setContent {
            MeeshyTheme {
                Box(Modifier.width(rowWidth)) { CallCaptionRow(line = line, showsTime = true, onToggleOriginal = {}) }
            }
        }

        val hour = rule.onNodeWithText("01:15", useUnmergedTree = true).getBoundsInRoot()
        assertThat((hour.right - hour.left).value).isGreaterThan(0f)
        assertThat(hour.right.value).isAtMost(rowWidth.value)
    }
}
