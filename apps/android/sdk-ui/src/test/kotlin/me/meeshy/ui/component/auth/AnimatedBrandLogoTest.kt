package me.meeshy.ui.component.auth

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le logo se dessine trait après trait, à un dixième de seconde d'écart ; sous « Réduire les
 * animations » il est entier d'emblée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AnimatedBrandLogoTest {

    @get:Rule
    val compose = createComposeRule()

    private fun observeReveals(reduceMotion: Boolean): List<Animatable<Float, AnimationVector1D>> {
        compose.mainClock.autoAdvance = false
        lateinit var reveals: List<Animatable<Float, AnimationVector1D>>
        compose.setContent { reveals = rememberDashReveals(reduceMotion) }
        return reveals
    }

    @Test
    fun `the dashes start hidden and draw one after the other`() {
        val reveals = observeReveals(reduceMotion = false)

        compose.mainClock.advanceTimeBy(60)

        assertThat(reveals[0].value).isGreaterThan(0f)
        assertThat(reveals[2].value).isEqualTo(0f)
    }

    @Test
    fun `all three dashes end up whole`() {
        val reveals = observeReveals(reduceMotion = false)

        compose.mainClock.advanceTimeBy(1_000)

        assertThat(reveals.map { it.value }).containsExactly(1f, 1f, 1f)
    }

    @Test
    fun `under reduced motion the logo is whole from the first frame`() {
        val reveals = observeReveals(reduceMotion = true)

        assertThat(reveals.map { it.value }).containsExactly(1f, 1f, 1f)
    }

    @Test
    fun `a decorative logo stays out of the accessibility tree`() {
        compose.setContent {
            MeeshyTheme { AnimatedBrandLogo(modifier = Modifier.size(100.dp), reduceMotion = true) }
        }

        compose.onNodeWithContentDescription("Meeshy").assertDoesNotExist()
    }

    @Test
    fun `a described logo is announced`() {
        compose.setContent {
            MeeshyTheme {
                AnimatedBrandLogo(modifier = Modifier.size(100.dp), reduceMotion = true, contentDescription = "Meeshy")
            }
        }

        compose.onNodeWithContentDescription("Meeshy").assertExists()
    }
}
