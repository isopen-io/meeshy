package me.meeshy.ui.component.kit

import androidx.compose.foundation.interaction.HoverInteraction
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K01 — la réponse au toucher du verre dessiné, observée comme une VALEUR (0 repos, 0,5 survol, 1 appui) et l'échelle
 * qu'elle donne. Elle se lit en phase de dessin : on interroge l'état rendu, jamais un pixel.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyGlassResponseTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `le survol eclaire sans agrandir, l'appui agrandit a 1,04`() {
        val rest = recipe(pressed = false)
        val full = recipe(pressed = true)
        assertThat(glassScale(rest, full, response = 0f)).isEqualTo(1f)
        assertThat(glassScale(rest, full, response = 0.5f)).isEqualTo(1f)
        assertThat(glassScale(rest, full, response = 1f)).isWithin(EPSILON).of(1.04f)
    }

    @Test
    fun `la source du controle mene la reponse - appui, relache, survol`() {
        val source = MutableInteractionSource()
        val response = observe(source = source, pressed = { null })
        val press = PressInteraction.Press(Offset.Zero)

        emit(source, press)
        assertThat(response().value).isEqualTo(1f)
        emit(source, PressInteraction.Release(press))
        assertThat(response().value).isEqualTo(0f)
        emit(source, HoverInteraction.Enter())
        assertThat(response().value).isEqualTo(0.5f)
    }

    @Test
    fun `un appui fige puis rendu a la source revient au repos`() {
        val source = MutableInteractionSource()
        var frozen by mutableStateOf<Boolean?>(true)
        val response = observe(source = source, pressed = { frozen })
        assertThat(response().value).isEqualTo(1f)

        frozen = null
        compose.waitForIdle()

        assertThat(response().value).isEqualTo(0f)
    }

    @Test
    fun `reduire les animations en plein appui ne relache pas la surface`() {
        val source = MutableInteractionSource()
        var reduceMotion by mutableStateOf(false)
        val response = observe(source = source, pressed = { null }, reduceMotion = { reduceMotion })
        emit(source, PressInteraction.Press(Offset.Zero))

        reduceMotion = true
        compose.waitForIdle()

        assertThat(response().value).isEqualTo(1f)
    }

    @Test
    fun `un verre pose dans un verre du chrome le sait - jamais de verre sur du verre`() {
        var outside: Boolean? = null
        var insideSurface: Boolean? = null
        var insideKit: Boolean? = null
        compose.setContent {
            MeeshyTheme {
                outside = LocalMeeshyGlassNested.current
                MeeshyGlassSurface { insideSurface = LocalMeeshyGlassNested.current }
                MeeshyGlass { insideKit = LocalMeeshyGlassNested.current }
            }
        }
        compose.waitForIdle()

        assertThat(outside).isFalse()
        assertThat(insideSurface).isTrue()
        assertThat(insideKit).isTrue()
    }

    private fun observe(
        source: MutableInteractionSource,
        pressed: () -> Boolean?,
        reduceMotion: () -> Boolean = { false },
    ): () -> State<Float> {
        var observed: State<Float>? = null
        compose.setContent { observed = rememberGlassResponse(source, pressed(), reduceMotion()) }
        compose.waitForIdle()
        return { checkNotNull(observed) }
    }

    private fun emit(source: MutableInteractionSource, interaction: androidx.compose.foundation.interaction.Interaction) {
        compose.runOnIdle { check(source.tryEmit(interaction)) }
        compose.waitForIdle()
    }

    private fun recipe(pressed: Boolean): MeeshyGlassRecipe = MeeshyGlassRecipe.resolve(
        tone = MeeshyGlassTone.Deep,
        density = MeeshyGlassDensity.Regular,
        isTinted = false,
        isInteractive = true,
        isPressed = pressed,
        material = MeeshyGlassMaterial.Drawn,
        reduceMotion = false,
    )

    private companion object {
        const val EPSILON = 1e-6f
    }
}
