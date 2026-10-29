package me.meeshy.app.conversations

import androidx.compose.ui.test.junit4.createComposeRule
import me.meeshy.sdk.model.ConversationFilter
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #13664, #13671 — iOS `ConversationListFilterChipRow` ne cède rien aux disques flottants : la rangée prend toute la largeur, « Tout » à la marge, pas décalée vers la droite (360 dp). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "fr-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ConversationFilterBarRestingDiscsTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `la rangee de puces prend toute la largeur sous les disques, sans reserve laterale`() {
        compose.setContentBesideRestingDiscs { ConversationFilterBar(selected = ConversationFilter.ALL, onSelect = {}) }
        val (leftDisc, _) = compose.restingDiscBounds()
        val scroller = compose.scrollerBounds()
        assertThat(scroller.sharesHeightWith(leftDisc)).isTrue()
        assertThat(scroller.left.value).isEqualTo(0f)
        assertThat(scroller.right.value).isEqualTo(360f)
    }
}
