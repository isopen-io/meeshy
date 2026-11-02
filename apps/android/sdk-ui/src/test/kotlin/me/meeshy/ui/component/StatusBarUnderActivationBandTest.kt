package me.meeshy.ui.component

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.core.view.WindowCompat
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ActivationInvite
import me.meeshy.ui.component.chrome.StatusBarIconsOverDark
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14170 — les icônes de la barre d'état se lisent sur ce qui est DESSOUS : sur un écran plein à fond sombre (compositeur,
 * réels), claires ; quand le bandeau « Validez votre compte » prend la barre d'état, à la couleur du bandeau ; et dès
 * « Plus tard », de nouveau claires sur la scène sombre.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StatusBarUnderActivationBandTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val invite = ActivationInvite(daysLeft = 19, missingEmail = true, missingPhone = false)

    private fun darkIcons(): Boolean {
        val window = compose.activity.window
        return WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars
    }

    private fun lightThemeWindow() {
        val window = compose.activity.window
        compose.runOnUiThread { WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true }
    }

    private fun darkScreenUnderBand(darkTheme: Boolean, shown: () -> ActivationInvite?) {
        compose.setContent {
            MeeshyTheme(darkTheme = darkTheme) {
                ActivationInviteBand(
                    invite = shown(),
                    title = "Validez votre compte",
                    message = "Jours restants : 19",
                    dismissLabel = "Plus tard",
                    onOpen = {},
                    onDismiss = {},
                ) {
                    StatusBarIconsOverDark()
                    Box(Modifier.fillMaxSize())
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `a dark full screen without the band shows light icons`() {
        lightThemeWindow()
        darkScreenUnderBand(darkTheme = false) { null }

        assertThat(darkIcons()).isFalse()
    }

    @Test
    fun `the light band over a dark screen takes dark icons, and Later gives the scene its light icons back`() {
        lightThemeWindow()
        var invited by mutableStateOf<ActivationInvite?>(invite)
        darkScreenUnderBand(darkTheme = false) { invited }

        assertThat(darkIcons()).isTrue()

        invited = null
        compose.waitForIdle()

        assertThat(darkIcons()).isFalse()
    }

    @Test
    fun `a dark band over a dark screen keeps light icons`() {
        lightThemeWindow()
        darkScreenUnderBand(darkTheme = true) { invite }

        assertThat(darkIcons()).isFalse()
    }
}
