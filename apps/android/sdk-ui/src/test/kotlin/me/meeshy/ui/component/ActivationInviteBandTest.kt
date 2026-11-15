package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.activity.ComponentActivity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.ViewGroup
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import kotlin.math.abs
import me.meeshy.sdk.model.ActivationInvite
import me.meeshy.ui.theme.DarkMeeshyTokens
import me.meeshy.ui.theme.LightMeeshyTokens
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Directive porteur du 2026-10-31 : « il faut rendre la bannière opaque par-dessus tout » (#13854). Le bandeau ne
 * laisse rien transparaître de ce qu'il couvre, et ce qu'il couvrait se range DESSOUS : l'écran commence sous lui,
 * le ✕ du compositeur garde ses 48 dp et reste touchable ; « Plus tard » le retire et l'écran remonte.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ActivationInviteBandTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val invite = ActivationInvite(daysLeft = 19, missingEmail = true, missingPhone = false)

    private fun showBand(invite: ActivationInvite?, darkTheme: Boolean = false, onOpen: () -> Unit = {}, onClose: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme(darkTheme = darkTheme) {
                ActivationInviteBand(
                    invite = invite,
                    title = "Validez votre compte",
                    message = "Jours restants : 19",
                    dismissLabel = "Plus tard",
                    onOpen = onOpen,
                    onDismiss = {},
                ) {
                    Box(Modifier.fillMaxSize().background(Color.Red).statusBarsPadding()) {
                        Box(Modifier.size(48.dp).testTag("composerClose").clickable(onClick = onClose))
                    }
                }
            }
        }
    }

    @Test
    fun `the banner surface is opaque in light and dark`() {
        assertThat(ActivationInviteBannerDefaults.containerColor(LightMeeshyTokens).alpha).isEqualTo(1f)
        assertThat(ActivationInviteBannerDefaults.containerColor(DarkMeeshyTokens).alpha).isEqualTo(1f)
    }

    /** La vue Compose dessinee en logiciel, puis le pixel lu au point (x, y) du noeud [tag], en pixels du noeud. */
    private fun pixel(tag: String, x: Float, y: (height: Float) -> Float): Color {
        val bounds = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot
        val root = compose.activity.findViewById<ViewGroup>(android.R.id.content).getChildAt(0)
        val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        compose.runOnUiThread { root.draw(Canvas(bitmap)) }
        return Color(bitmap.getPixel((bounds.left + x).toInt(), (bounds.top + y(bounds.height)).toInt()))
    }

    private fun showBannerOverRed(darkTheme: Boolean) {
        compose.setContent {
            MeeshyTheme(darkTheme = darkTheme) {
                Box(Modifier.fillMaxSize().background(Color.Red)) {
                    ActivationInviteBanner(
                        invite = invite,
                        title = "Validez votre compte",
                        message = "Jours restants : 19",
                        dismissLabel = "Plus tard",
                        onOpen = {},
                        onDismiss = {},
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private fun assertPainted(painted: Color, expected: Color) {
        assertThat(abs(painted.red - expected.red)).isLessThan(0.02f)
        assertThat(abs(painted.green - expected.green)).isLessThan(0.02f)
        assertThat(abs(painted.blue - expected.blue)).isLessThan(0.02f)
    }

    @Test
    fun `nothing under the banner shows through it in light`() {
        showBannerOverRed(darkTheme = false)

        assertPainted(pixel(ActivationInviteBannerDefaults.TEST_TAG, 4f) { it / 2 }, ActivationInviteBannerDefaults.containerColor(LightMeeshyTokens))
    }

    @Test
    fun `nothing under the banner shows through it in dark`() {
        showBannerOverRed(darkTheme = true)

        assertPainted(pixel(ActivationInviteBannerDefaults.TEST_TAG, 4f) { it / 2 }, ActivationInviteBannerDefaults.containerColor(DarkMeeshyTokens))
    }

    @Test
    fun `the screen starts under the banner and the composer close keeps its 48 dp`() {
        var closed = 0
        var opened = 0
        showBand(invite, onOpen = { opened++ }, onClose = { closed++ })

        val banner = compose.onNodeWithTag(ActivationInviteBannerDefaults.TEST_TAG).getUnclippedBoundsInRoot()
        val close = compose.onNodeWithTag("composerClose").getUnclippedBoundsInRoot()
        assertThat(close.top).isAtLeast(banner.bottom)
        assertThat(close.bottom - close.top).isEqualTo(48.dp)
        assertThat(close.right - close.left).isEqualTo(48.dp)

        compose.onNodeWithTag("composerClose").performClick()
        assertThat(closed).isEqualTo(1)
        assertThat(opened).isEqualTo(0)
    }

    @Test
    fun `the band paints an opaque strip across the whole width, dark theme included`() {
        showBand(invite, darkTheme = true)
        compose.waitForIdle()

        assertPainted(pixel(ActivationInviteBannerDefaults.BAND_TAG, 2f) { it / 2 }, DarkMeeshyTokens.backgroundPrimary)
    }

    @Test
    fun `without an invite the screen takes the whole height`() {
        showBand(invite = null)

        compose.onNodeWithTag(ActivationInviteBannerDefaults.TEST_TAG).assertDoesNotExist()
        assertThat(compose.onNodeWithTag("composerClose").getUnclippedBoundsInRoot().top).isEqualTo(0.dp)
    }

    @Test
    fun `the banner still opens and dismisses inside the band`() {
        var opened = 0
        showBand(invite, onOpen = { opened++ })

        compose.onNodeWithText("Validez votre compte").performClick()

        assertThat(opened).isEqualTo(1)
    }
}
