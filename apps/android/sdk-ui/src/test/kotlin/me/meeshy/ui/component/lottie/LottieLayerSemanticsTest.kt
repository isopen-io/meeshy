package me.meeshy.ui.component.lottie

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LottieLayerSemanticsTest {
    @get:Rule
    val rule = createComposeRule()

    @Test fun `la couche ne porte ni action ni libelle pour TalkBack`() {
        rule.setContent { LottieLayerView(emptyFilm(), Modifier.size(48.dp).testTag("layer")) }
        rule.onNodeWithTag("layer")
            .assert(SemanticsMatcher.keyNotDefined(SemanticsActions.OnClick))
            .assert(SemanticsMatcher("efface la sémantique") { it.config.isClearingSemantics })
    }

    @Test fun `un toucher sur la couche atteint la cible qu'elle couvre`() {
        var taps = 0
        rule.setContent {
            Box(Modifier.size(64.dp).testTag("host").clickable { taps++ }) {
                LottieLayerView(emptyFilm(), Modifier.fillMaxSize())
            }
        }
        rule.onNodeWithTag("host").performClick()
        assertThat(taps).isEqualTo(1)
    }

    @Test fun `sans source fournie la couche de pack s'efface`() {
        rule.setContent { PackLottieLayer(ref = null, modifier = Modifier.size(48.dp).testTag("pack")) }
        rule.onNodeWithTag("pack").assert(SemanticsMatcher("efface") { it.config.isClearingSemantics })
    }
}
