package me.meeshy.app.onboarding

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
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
class OnboardingCardLayoutTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `l'illustration garde sa taille quand la place suffit`() {
        assertThat(OnboardingCardFit.illustrationScale(natural = 100f, room = 100f)).isEqualTo(1f)
        assertThat(OnboardingCardFit.illustrationScale(natural = 100f, room = 400f)).isEqualTo(1f)
    }

    @Test
    fun `l'illustration se reduit a la place qui reste`() {
        assertThat(OnboardingCardFit.illustrationScale(natural = 100f, room = 80f)).isWithin(0.0001f).of(0.8f)
    }

    @Test
    fun `l'illustration disparait sous l'echelle minimale de 0,6`() {
        assertThat(OnboardingCardFit.illustrationScale(natural = 100f, room = 59f)).isEqualTo(0f)
        assertThat(OnboardingCardFit.illustrationScale(natural = 100f, room = 60f)).isWithin(0.0001f).of(0.6f)
        assertThat(OnboardingCardFit.illustrationScale(natural = 100f, room = -30f)).isEqualTo(0f)
    }

    @Test
    fun `tant que l'illustration n'est pas mesuree rien ne change`() {
        assertThat(OnboardingCardFit.illustrationScale(natural = 0f, room = -50f)).isEqualTo(1f)
    }

    @Test
    fun `les grandes polices font suivre les boutons le contenu`() {
        assertThat(OnboardingCardFit.isAccessibilitySize(1f)).isFalse()
        assertThat(OnboardingCardFit.isAccessibilitySize(1.5f)).isTrue()
    }

    private fun show(
        heightDp: Int,
        fontScale: Float = 1f,
        contentDp: Int = 40,
        secondary: Boolean = true,
        onPrimary: () -> Unit = {},
    ) {
        compose.setContent {
            val base = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(base.density, fontScale)) {
                MeeshyTheme {
                    Box(Modifier.height(heightDp.dp)) {
                        OnboardingCardLayout(
                            title = "Title",
                            message = "Message",
                            primary = OnboardingAction("Go", "primary", perform = onPrimary),
                            secondary = if (secondary) OnboardingAction("Later", "secondary") {} else null,
                            illustration = { Box(Modifier.fillMaxWidth().height(80.dp).testTag("illustration")) },
                            content = { Box(Modifier.fillMaxWidth().height(contentDp.dp).testTag("content")) },
                        )
                    }
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `une carte qui tient montre son illustration, son titre et ses deux boutons`() {
        show(heightDp = 460)

        compose.onNodeWithTag("illustration").assertIsDisplayed()
        compose.onNodeWithText("Title").assertIsDisplayed()
        compose.onNodeWithText("Message").assertIsDisplayed()
        compose.onNodeWithTag("primary").assertIsDisplayed()
        compose.onNodeWithTag("secondary").assertIsDisplayed()
    }

    @Test
    fun `l'illustration decorative cede la place quand l'ecran est court`() {
        show(heightDp = 260)

        compose.onNodeWithTag("illustration").assertDoesNotExist()
        compose.onNodeWithText("Title").assertExists()
        compose.onNodeWithTag("primary").assertIsDisplayed()
    }

    @Test
    fun `le bouton principal reste epingle sous un contenu qui defile`() {
        var taps = 0
        show(heightDp = 400, contentDp = 1000, onPrimary = { taps++ })

        compose.onNodeWithTag("primary").assertIsDisplayed().performClick()

        assertThat(taps).isEqualTo(1)
    }

    @Test
    fun `aux grandes polices les boutons defilent avec le contenu`() {
        show(heightDp = 460, fontScale = 2f, contentDp = 400)

        compose.onNodeWithTag("primary").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("secondary").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun `sans secondaire il n'y a qu'un bouton`() {
        show(heightDp = 460, secondary = false)

        compose.onNodeWithTag("secondary").assertDoesNotExist()
    }
}
