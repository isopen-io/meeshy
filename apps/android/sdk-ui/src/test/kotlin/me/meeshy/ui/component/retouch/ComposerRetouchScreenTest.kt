package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** La retouche unique : la rangée haute, le rail, la bande, et ce que « Terminé » remet (#12614). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ComposerRetouchScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private val delivered = mutableListOf<ComposerRetouchResult>()
    private var cancelled = 0

    private val author = ComposerLookAuthor("self", "Ana", null, CallMontageCaption(CallMontageCaption.BRAND_TITLE, "24 Oct 2026", "10:42"), "24 Oct 2026")

    private fun show() {
        val photo = Bitmap.createBitmap(90, 160, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.RED) }
        compose.setContent {
            MeeshyTheme {
                ComposerRetouchScreen(source = photo, author = author, onDone = { delivered += it }, onCancel = { cancelled++ })
            }
        }
        compose.waitForIdle()
    }

    /** « Terminé » revient quand l'outil ou la bande se referme : on l'attend avant de le toucher. */
    private fun tapDone() {
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Done").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Done").performClick()
    }

    @Test
    fun `a l entree, Annuler et Termine sont la, et le rail offre Filtres et Cadres`() {
        show()
        compose.onNodeWithContentDescription("Cancel").assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
        compose.onNodeWithText("Done").assertHeightIsAtLeast(48.dp)
        compose.onNodeWithText("Filters").assertHeightIsAtLeast(48.dp)
        compose.onNodeWithText("Frames").assertHeightIsAtLeast(48.dp)
        compose.onNodeWithText("Effects").assertDoesNotExist()
    }

    @Test
    fun `une prise intouchee part telle quelle`() {
        show()
        tapDone()
        compose.waitUntil(5_000) { delivered.isNotEmpty() }
        assertThat(delivered).containsExactly(ComposerRetouchResult.Original)
    }

    @Test
    fun `ouvrir les cadres cache Termine, et choisir l Ecran rend la photo dans un appareil`() {
        show()
        compose.onNodeWithText("Frames").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Done").assertDoesNotExist()
        compose.onAllNodesWithContentDescription("No frame")[0].assertIsSelected()
        compose.onNodeWithContentDescription("Screen").performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Screen").assertIsSelected()
        compose.onNodeWithText("Frames").performClick()
        compose.waitForIdle()
        tapDone()
        compose.waitUntil(10_000) { delivered.isNotEmpty() }
        val rendered = delivered.single() as ComposerRetouchResult.Rendered
        assertThat(rendered.bitmap.width % 2).isEqualTo(0)
        assertThat(rendered.bitmap.getPixel(rendered.bitmap.width / 2, 1)).isNotEqualTo(Color.RED)
        assertThat(cancelled).isEqualTo(0)
    }

    @Test
    fun `Annuler abandonne une seule fois`() {
        show()
        compose.onNodeWithContentDescription("Cancel").performClick()
        compose.waitForIdle()
        assertThat(cancelled).isEqualTo(1)
        assertThat(delivered).isEmpty()
    }

    @Test
    fun `Recadrer montre ses presets et cache Termine, et le carre part carre`() {
        show()
        compose.onNodeWithText("Crop").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Done").assertDoesNotExist()
        compose.onNodeWithText("Original").assertHeightIsAtLeast(48.dp)
        compose.onNodeWithText("1:1").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("1:1").assertIsSelected()
        compose.onNodeWithText("Crop").performClick()
        compose.waitForIdle()
        tapDone()
        compose.waitUntil(10_000) { delivered.isNotEmpty() }
        val rendered = delivered.single() as ComposerRetouchResult.Rendered
        assertThat(rendered.bitmap.width).isEqualTo(rendered.bitmap.height)
        assertThat(rendered.bitmap.width).isEqualTo(90)
    }

    @Test
    fun `une video illisible ne s ouvre pas en retouche`() {
        assertThat(RetouchVideoProbe.of(java.io.File("/nonexistent/clip.mp4"))).isNull()
    }

    @Test
    fun `Texte ouvre un texte en saisie, et le texte ecrit part dans les pixels de la photo`() {
        show()
        compose.onNodeWithText("Text").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Done").assertDoesNotExist()
        compose.onNode(hasSetTextAction()).performTextInput("MEESHY")
        compose.waitForIdle()
        compose.onNodeWithText("Text").performClick()
        compose.waitForIdle()
        tapDone()
        compose.waitUntil(10_000) { delivered.isNotEmpty() }
        val rendered = delivered.single() as ComposerRetouchResult.Rendered
        val pixels = IntArray(rendered.bitmap.width * rendered.bitmap.height)
        rendered.bitmap.getPixels(pixels, 0, rendered.bitmap.width, 0, 0, rendered.bitmap.width, rendered.bitmap.height)
        assertThat(pixels.any { Color.green(it) > 150 }).isTrue()
    }
}
