package me.meeshy.ui.component.reaction

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.modifier.reactionPaletteTrigger
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostReactionPaletteSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private var opened = 0

    @Composable
    private fun Target() {
        Box(Modifier.size(48.dp).testTag("heart").reactionPaletteTrigger(onOpen = { opened++ }))
    }

    @Test
    fun theTargetExposesAMoreReactionsCustomActionThatOpensThePalette() {
        compose.setContent { Target() }

        val node = compose.onNodeWithTag("heart").fetchSemanticsNode()
        val actions = node.config[SemanticsActions.CustomActions]
        assertThat(actions.map { it.label }).containsExactly("More reactions")

        actions.first().action()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun aDisabledTriggerExposesNoAction() {
        compose.setContent {
            Box(Modifier.size(48.dp).testTag("heart").reactionPaletteTrigger(onOpen = { opened++ }, enabled = false))
        }
        val config = compose.onNodeWithTag("heart").fetchSemanticsNode().config
        assertThat(config.contains(SemanticsActions.CustomActions)).isFalse()
    }
}
