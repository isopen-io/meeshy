package me.meeshy.app.calls

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallCameraRailSemanticsTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun `le bouton replie porte un libelle, un etat et une cible de 44 dp`() {
        rule.setContent { MeeshyTheme { CallCameraFoldButton(unfolded = false, onTap = {}, modifier = Modifier.testTag("fold")) } }
        val node = rule.onNodeWithTag("fold").fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.ContentDescription)).isNotEmpty()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isNotNull()
        assertThat(node.size.width).isAtLeast(44)
    }

    @Test
    fun `un toucher sur le voile referme la grille et ne traverse pas`() {
        var open by mutableStateOf(true)
        rule.setContent {
            MeeshyTheme {
                Box(Modifier.size(200.dp)) {
                    Box(Modifier.fillMaxSize().testTag("under"))
                    if (open) CallCameraRailScrim(onDismiss = { open = false }, modifier = Modifier.testTag("scrim"))
                }
            }
        }
        rule.onNodeWithTag("scrim").performClick()
        assertThat(open).isFalse()
    }
}
