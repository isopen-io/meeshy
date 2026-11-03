package me.meeshy.ui.component.game

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.assertIsDisplayed
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshCoinGlyphTest {

    @get:Rule val rule = createComposeRule()

    @Test
    fun `le glyphe de piece est teinte de l'argent des Meeshes`() {
        assertThat(MeeshCoinGlyphTint).isEqualTo(MeeshyPalette.MeeshSilver)
        assertThat(MeeshCoinGlyphTint).isEqualTo(Color(0xFFA8B1BF))
    }

    @Test
    fun `le trace de la piece est celui de coin-fill et se decode`() {
        assertThat(MEESH_COIN_GLYPH_PATH).startsWith("M207.58,63.84")
        assertThat(GameSvgPath.make(MEESH_COIN_GLYPH_PATH).getBounds().width).isGreaterThan(200f)
    }

    @Test
    fun `le glyphe se dessine`() {
        rule.setContent { MeeshCoinGlyph() }
        rule.onRoot().assertIsDisplayed()
    }
}
