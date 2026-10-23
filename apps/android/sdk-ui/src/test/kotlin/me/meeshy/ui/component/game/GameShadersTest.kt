package me.meeshy.ui.component.game

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.accessibility.LocalReduceMotion
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31])
class GameShadersTest {

    @get:Rule
    val rule = createComposeRule()

    @Test
    fun `le chemin AGSL depend de l API et du mouvement reduit`() {
        assertThat(GameShaders.usesAgsl(sdkInt = 31)).isFalse()
        assertThat(GameShaders.usesAgsl(sdkInt = 34)).isTrue()
        assertThat(GameShaders.usesAgsl(sdkInt = 34, reduceMotion = true)).isFalse()
    }

    @Test
    fun `le prechauffage ne fait rien sous l API 33`() {
        GameShaders.precompile(sdkInt = 31)
    }

    @Test
    fun `sur l API 31 les trois effets se dessinent par le degrade sans erreur`() {
        rule.setContent {
            Box(
                Modifier.testTag("brick").size(40.dp)
                    .gameSpecularSheen(progress = 0.5)
                    .gameStrikeWave(progress = 0.5)
                    .gamePrismIridescence(tilt = 0.2),
            )
        }
        rule.onNodeWithTag("brick").assertIsDisplayed()
    }

    @Test
    fun `hors de son temps ou en mouvement reduit la brique reste intacte`() {
        rule.setContent {
            CompositionLocalProvider(LocalReduceMotion provides true) {
                Box(
                    Modifier.testTag("brick").size(40.dp)
                        .gameSpecularSheen(progress = 0.0)
                        .gameStrikeWave(progress = 1.0)
                        .gameSpecularSheen(progress = 0.5)
                        .gamePrismIridescence(tilt = 0.9),
                )
            }
        }
        rule.onNodeWithTag("brick").assertIsDisplayed()
    }
}
