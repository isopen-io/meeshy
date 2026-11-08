package me.meeshy.ui.component.game

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.ui.accessibility.LocalReduceMotion
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FlameViewTest {
    @get:Rule
    val rule = createComposeRule()

    private fun flickering(reduce: Boolean, lit: Boolean = true, flickers: Boolean = true): Boolean {
        rule.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduce) {
                FlameView(FlameFormKey.Brasier, Modifier.testTag("flame"), lit = lit, flickers = flickers)
            }
        }
        return rule.onNodeWithTag("flame").fetchSemanticsNode().config[FlameFlickeringKey]
    }

    @Test
    fun `sous mouvement reduit la flamme ne vacille pas`() {
        assertThat(flickering(reduce = true)).isFalse()
    }

    @Test
    fun `une flamme eteinte ou fixe ne vacille pas`() {
        assertThat(flickering(reduce = false, lit = false)).isFalse()
    }

    @Test
    fun `une miniature fixe ne vacille pas`() {
        assertThat(flickering(reduce = false, flickers = false)).isFalse()
    }

    @Test
    fun `hors ecran la flamme s'arrete`() {
        assertThat(FlamePlan.flickers(flickers = true, lit = true, reduceMotion = false, onScreen = false)).isFalse()
        assertThat(FlamePlan.flickers(flickers = true, lit = true, reduceMotion = false, onScreen = true)).isTrue()
    }

    @Test
    fun `la hauteur grandit avec la forme et la braise n'a pas de Signature`() {
        val scales = FlameFormKey.entries.map(FlamePlan::scale)
        assertThat(scales).containsExactly(0.45f, 0.7f, 0.95f, 1f, 1f).inOrder()
        assertThat(FlameFormKey.entries.filter { !FlamePlan.showsSignature(it) }).containsExactly(FlameFormKey.Braise)
    }

    @Test
    fun `l'astre a un halo de 25 et le soleil un second de 31`() {
        assertThat(FlameFormKey.entries.map(FlamePlan::haloRadius)).containsExactly(null, null, null, 25f, 31f).inOrder()
    }

    @Test
    fun `eteinte la flamme tombe a 0,45 d'opacite`() {
        assertThat(FlamePlan.opacity(lit = false)).isEqualTo(0.45f)
        assertThat(FlamePlan.opacity(lit = true)).isEqualTo(1f)
    }
}
