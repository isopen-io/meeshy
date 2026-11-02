package me.meeshy.ui.component.game

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.accessibility.LocalReduceMotion
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeFigureTest {
    @get:Rule
    val rule = createComposeRule()

    private fun modeOf(filmId: String, reduce: Boolean, animates: Boolean = true): MeeFigureMode {
        rule.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduce) {
                MeeFigure(filmId, 48.dp, Modifier.testTag("fig"), animates = animates)
            }
        }
        return rule.onNodeWithTag("fig").fetchSemanticsNode().config[MeeFigureModeKey]
    }

    @Test
    fun `sous animations reduites un film anime reste en image fixe`() {
        assertThat(modeOf("meo-salut", reduce = true)).isEqualTo(MeeFigureMode.STILL)
    }

    @Test
    fun `hors animations reduites un film anime s'anime`() {
        assertThat(modeOf("meo-salut", reduce = false)).isEqualTo(MeeFigureMode.ANIMATED)
    }

    @Test
    fun `dans une brique la figure est fixe`() {
        assertThat(modeOf("meo-salut", reduce = false, animates = false)).isEqualTo(MeeFigureMode.STILL)
    }

    @Test
    fun `un identifiant inconnu rend une figure vide`() {
        assertThat(modeOf("inconnu", reduce = false)).isEqualTo(MeeFigureMode.EMPTY)
    }
}
