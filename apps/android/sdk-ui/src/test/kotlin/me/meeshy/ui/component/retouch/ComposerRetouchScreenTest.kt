package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertAny
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.isSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.pinch
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.model.composer.look.ComposerPhotoFrame
import me.meeshy.sdk.model.composer.look.ComposerPhotoLook
import me.meeshy.sdk.model.composer.look.ComposerPhotoRecipe
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.coroutines.EmptyCoroutineContext

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

    /**
     * Les peintures (aperçu, miniatures, export, visage) tournent sur l'horloge de la composition : hors du fil
     * principal, elles revenaient à un instant qui dépendait de la vitesse du runner, et une CI chargée voyait
     * la bande et le rail dans un ordre qu'aucun geste ne produisait (« Terminé » jamais revenu, le Crapaud
     * centré mais pas choisi).
     */
    private fun show(initial: ComposerPhotoRecipe? = null) {
        val photo = Bitmap.createBitmap(90, 160, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.RED) }
        compose.setContent {
            CompositionLocalProvider(LocalRetouchPaintContext provides EmptyCoroutineContext) {
                MeeshyTheme {
                    ComposerRetouchScreen(source = photo, author = author, onDone = { delivered += it }, onCancel = { cancelled++ }, initial = initial)
                }
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
    fun `a l entree, Annuler et Termine sont la, et le rail offre Filtres, Effets et Cadres`() {
        show()
        compose.onNodeWithContentDescription("Cancel").assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
        compose.onNodeWithText("Done").assertHeightIsAtLeast(48.dp)
        compose.onNodeWithText("Filters").assertHeightIsAtLeast(48.dp)
        compose.onNodeWithText("Frames").assertHeightIsAtLeast(48.dp)
        compose.onNodeWithText("Effects").assertHeightIsAtLeast(48.dp)
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
        assertThat(rendered.recipe.look.frame).isEqualTo(screenFrame)
        assertThat(cancelled).isEqualTo(0)
    }

    private val screenFrame = ComposerPhotoFrame.Montage(CallMontageChoice.Classic(CallMontageStyle.SCREEN))

    @Test
    fun `rouvrir une piece retouchee rend son cadre et son texte modifiables, et Termine rend la meme recette`() {
        val recipe = ComposerPhotoRecipe(look = ComposerPhotoLook(frame = screenFrame), texts = listOf(StoryTextObject(id = "t1", text = "MEESHY")))
        show(initial = recipe)
        compose.onNodeWithText("Frames").performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Screen").assertIsSelected()
        compose.onNodeWithText("Frames").performClick()
        compose.waitForIdle()
        tapDone()
        compose.waitUntil(10_000) { delivered.isNotEmpty() }
        val rendered = delivered.single() as ComposerRetouchResult.Rendered
        assertThat(rendered.recipe).isEqualTo(recipe)
        assertThat(rendered.bitmap.getPixel(rendered.bitmap.width / 2, 1)).isNotEqualTo(Color.RED)
    }

    @Test
    fun `le Crapaud choisi dans les Effets part peint, la prise teintee de vert`() {
        show()
        compose.onNodeWithText("Effects").performClick()
        compose.waitForIdle()
        compose.onAllNodesWithContentDescription("None")[0].assertIsSelected()
        compose.onNodeWithContentDescription("Toad").performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Toad").assertIsSelected()
        compose.onNodeWithText("Effects").performClick()
        compose.waitForIdle()
        tapDone()
        compose.waitUntil(10_000) { delivered.isNotEmpty() }
        val rendered = delivered.single() as ComposerRetouchResult.Rendered
        assertThat(Color.green(rendered.bitmap.getPixel(rendered.bitmap.width / 2, rendered.bitmap.height / 2))).isGreaterThan(4)
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

    private fun imageBounds() = compose.onNodeWithTag(RETOUCH_CROP_IMAGE_TAG).fetchSemanticsNode().boundsInRoot

    @Test
    fun `Recadrer garde la photo en grand, posee entiere sous un cadre fixe`() {
        show()
        val screen = compose.onRoot().fetchSemanticsNode().boundsInRoot
        compose.onNodeWithText("Crop").performClick()
        compose.waitForIdle()

        val image = imageBounds()
        assertThat(maxOf(image.width / screen.width, image.height / screen.height)).isAtLeast(0.5f)
        assertThat(image.width / image.height).isWithin(0.01f).of(90f / 160f)
    }

    @Test
    fun `pincer zoome la photo sous le cadre, et la fenetre gardee est celle qui part`() {
        show()
        compose.onNodeWithText("Crop").performClick()
        compose.waitForIdle()
        val before = imageBounds()

        compose.onNodeWithTag(RETOUCH_CROP_IMAGE_TAG).performTouchInput {
            val middle = center
            pinch(middle - Offset(20f, 0f), middle - Offset(120f, 0f), middle + Offset(20f, 0f), middle + Offset(120f, 0f))
        }
        compose.waitForIdle()

        assertThat(imageBounds().width).isGreaterThan(before.width * 1.5f)
        compose.onNodeWithText("Crop").performClick()
        compose.waitForIdle()
        tapDone()
        compose.waitUntil(10_000) { delivered.isNotEmpty() }
        val rendered = delivered.single() as ComposerRetouchResult.Rendered
        assertThat(rendered.bitmap.width).isLessThan(90)
        assertThat(rendered.bitmap.width.toFloat() / rendered.bitmap.height).isWithin(0.05f).of(90f / 160f)
        assertThat(rendered.recipe.crop).isNotNull()
    }

    @Test
    fun `choisir un preset anime le cadre jusqu a ses nouvelles proportions`() {
        show()
        compose.onNodeWithText("Crop").performClick()
        compose.waitForIdle()
        val start = imageBounds()
        compose.mainClock.autoAdvance = false

        compose.onNodeWithText("1:1").performClick()
        compose.mainClock.advanceTimeBy(120)
        val midway = imageBounds()
        compose.mainClock.advanceTimeBy(1_000)
        val end = imageBounds()
        compose.mainClock.autoAdvance = true

        assertThat(end.width).isGreaterThan(start.width + 1f)
        assertThat(midway.width).isGreaterThan(start.width)
        assertThat(midway.width).isLessThan(end.width)
    }

    @Test
    fun `une video illisible ne s ouvre pas en retouche`() {
        assertThat(RetouchVideoProbe.of(java.io.File("/nonexistent/clip.mp4"))).isNull()
    }

    @Test
    fun `Texte ouvre un texte en saisie, et le texte ecrit part dans les pixels de la photo`() {
        show()
        compose.onNodeWithText("Text").performScrollTo().performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Done").assertDoesNotExist()
        compose.onNode(hasSetTextAction()).performTextInput("MEESHY")
        compose.waitForIdle()
        compose.onNodeWithText("Text").performScrollTo().performClick()
        compose.waitForIdle()
        tapDone()
        compose.waitUntil(10_000) { delivered.isNotEmpty() }
        val rendered = delivered.single() as ComposerRetouchResult.Rendered
        val pixels = IntArray(rendered.bitmap.width * rendered.bitmap.height)
        rendered.bitmap.getPixels(pixels, 0, rendered.bitmap.width, 0, 0, rendered.bitmap.width, rendered.bitmap.height)
        assertThat(pixels.any { Color.green(it) > 150 }).isTrue()
    }

    @Test
    fun `le fond Noir choisi sous le texte se cuit dans la photo`() {
        show()
        compose.onNodeWithText("Text").performScrollTo().performClick()
        compose.waitForIdle()
        compose.onNode(hasSetTextAction()).performTextInput("MEESHY")
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Black").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Text").performScrollTo().performClick()
        compose.waitForIdle()
        tapDone()
        compose.waitUntil(10_000) { delivered.isNotEmpty() }
        val rendered = delivered.single() as ComposerRetouchResult.Rendered
        val pixels = IntArray(rendered.bitmap.width * rendered.bitmap.height)
        rendered.bitmap.getPixels(pixels, 0, rendered.bitmap.width, 0, 0, rendered.bitmap.width, rendered.bitmap.height)
        assertThat(pixels.count { Color.red(it) < 30 && Color.green(it) < 30 && Color.blue(it) < 30 }).isGreaterThan(20)
    }

    @Test
    fun `chaque fond est une pastille radio, Aucun d abord choisi puis Verre une fois touche`() {
        show()
        compose.onNodeWithText("Text").performScrollTo().performClick()
        compose.waitForIdle()
        compose.onNode(hasSetTextAction()).performTextInput("MEESHY")
        compose.waitForIdle()
        compose.onAllNodesWithContentDescription("None").assertAny(isSelected())
        compose.onNodeWithContentDescription("Glass").assertIsNotSelected().performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Glass").assertIsSelected()
        compose.onNodeWithContentDescription("Black").assertIsNotSelected()
    }
}
