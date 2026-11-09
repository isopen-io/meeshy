package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.EntityImageFormat
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.coroutines.EmptyCoroutineContext

/** La retouche de la capture ouverte sur une image d'identité (#17257) : le format imposé, le rond voilé, Annuler muet. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class EntityImageRetouchScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val delivered = mutableListOf<ComposerRetouchResult>()
    private var cancelled = 0

    private val author = ComposerLookAuthor("self", "Ana", null, CallMontageCaption(CallMontageCaption.BRAND_TITLE, "9 Nov 2026", "10:42"), "9 Nov 2026")

    private fun show(format: EntityImageFormat?) {
        val photo = Bitmap.createBitmap(120, 90, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.RED) }
        compose.setContent {
            CompositionLocalProvider(LocalRetouchPaintContext provides EmptyCoroutineContext) {
                MeeshyTheme {
                    ComposerRetouchScreen(source = photo, author = author, onDone = { delivered += it }, onCancel = { cancelled++ }, format = format)
                }
            }
        }
        compose.waitForIdle()
    }

    private fun tapDone() {
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Done").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Done").performClick()
    }

    @Test
    fun `l avatar se cadre sous un voile rond, et Termine le rend carre`() {
        show(EntityImageFormat.AVATAR)
        compose.onNodeWithTag(ENTITY_ROUND_VEIL_TAG).assertExists()
        tapDone()
        compose.waitUntil(10_000) { delivered.isNotEmpty() }
        val rendered = delivered.single() as ComposerRetouchResult.Rendered
        assertThat(rendered.bitmap.width).isEqualTo(rendered.bitmap.height)
    }

    @Test
    fun `la banniere part en bandeau trois fois plus large que haut, sans voile rond`() {
        show(EntityImageFormat.BANNER)
        compose.onNodeWithTag(ENTITY_ROUND_VEIL_TAG).assertDoesNotExist()
        tapDone()
        compose.waitUntil(10_000) { delivered.isNotEmpty() }
        val rendered = delivered.single() as ComposerRetouchResult.Rendered
        assertThat(rendered.bitmap.width.toDouble() / rendered.bitmap.height).isWithin(0.1).of(3.0)
    }

    @Test
    fun `un format impose ne propose aucun preset de proportions`() {
        show(EntityImageFormat.BANNER)
        compose.onNodeWithText("Crop").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Original").assertDoesNotExist()
        compose.onNodeWithText("16:9").assertDoesNotExist()
        compose.onNodeWithTag(RETOUCH_CROP_IMAGE_TAG).assertExists()
    }

    @Test
    fun `Annuler ne rend rien`() {
        show(EntityImageFormat.AVATAR)
        compose.onNodeWithContentDescription("Cancel").performClick()
        compose.waitForIdle()
        assertThat(cancelled).isEqualTo(1)
        assertThat(delivered).isEmpty()
    }

    @Test
    fun `sans format, la retouche de la capture n a pas de voile`() {
        show(null)
        compose.onNodeWithTag(ENTITY_ROUND_VEIL_TAG).assertDoesNotExist()
    }
}
