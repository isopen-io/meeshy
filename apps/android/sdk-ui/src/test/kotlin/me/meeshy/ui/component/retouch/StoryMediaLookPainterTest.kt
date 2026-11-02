package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaFraming
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.composer.look.ComposerLookStripItem
import me.meeshy.sdk.model.composer.look.StoryMediaLookMapping
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #13841 : le look d'un média de la scène peint par le peintre UNIQUE de la retouche ([ComposerLookPainter]) — en direct
 * sur la scène comme à la publication —, sans jamais changer ses proportions ; et la section « Filtres et cadres » qui
 * l'écrit.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StoryMediaLookPainterTest {

    @get:Rule
    val compose = createComposeRule()

    private val author = ComposerLookAuthor("self", "Ana", null, CallMontageCaption(CallMontageCaption.BRAND_TITLE, "24 Oct 2026", "10:42"), "24 Oct 2026")

    private fun photo(color: Int = Color.rgb(120, 120, 120)) = Bitmap.createBitmap(90, 160, Bitmap.Config.ARGB_8888).also { it.eraseColor(color) }

    @Test
    fun `un filtre de l appel change les pixels, pas les proportions`() {
        val source = photo()

        val painted = StoryMediaLookPainter.paint(source, StoryMediaLook(filterPreset = "warm"), author)!!

        assertThat(painted.width).isEqualTo(90)
        assertThat(painted.height).isEqualTo(160)
        assertThat(painted.getPixel(45, 80)).isNotEqualTo(source.getPixel(45, 80))
    }

    @Test
    fun `un cadre se pose dans l etendue du media`() {
        val painted = StoryMediaLookPainter.paint(photo(Color.GREEN), StoryMediaLook(frameId = "classic:polaroid"), author)!!

        assertThat(painted.width.toFloat() / painted.height).isWithin(0.02f).of(90f / 160f)
        assertThat(painted.getPixel(1, 158)).isNotEqualTo(Color.GREEN)
    }

    @Test
    fun `un cadrage zoome dans la source sans changer ses proportions`() {
        val painted = StoryMediaLookPainter.paint(photo(), StoryMediaLook(framing = StoryMediaFraming(0.5, 0.5, 2.0)), author)!!

        assertThat(painted.width.toFloat() / painted.height).isWithin(0.02f).of(90f / 160f)
    }

    @Test
    fun `un look inconnu ou neutre rend la source telle quelle`() {
        val source = photo()

        assertThat(StoryMediaLookPainter.paint(source, StoryMediaLook(filterPreset = "sepia-2027", frameId = "frame:inconnu"), author)).isSameInstanceAs(source)
        assertThat(StoryMediaLookPainter.paint(source, StoryMediaLook(), author)).isSameInstanceAs(source)
    }

    @Test
    fun `la cle du rendu suit le look et l auteur que le cadre ecrit`() {
        val warm = StoryMediaLookTransformation(StoryMediaLook(filterPreset = "warm"), author)

        assertThat(warm.cacheKey).contains(StoryMediaLook(filterPreset = "warm").signature)
        assertThat(warm.cacheKey).isNotEqualTo(StoryMediaLookTransformation(StoryMediaLook(filterPreset = "cool"), author).cacheKey)
        assertThat(warm.cacheKey).isNotEqualTo(StoryMediaLookTransformation(StoryMediaLook(filterPreset = "warm"), author.copy(name = "Bo")).cacheKey)
    }

    @Test
    fun `la section Filtres et cadres ecrit la case touchee et montre le choix`() {
        val look = mutableStateOf<StoryMediaLook?>(StoryMediaLook(filterPreset = "warm"))
        compose.setContent {
            MeeshyTheme {
                ComposerMediaLookPanel(look = look.value, onChoose = { item -> look.value = StoryMediaLookMapping.choosing(item, look.value) })
            }
        }

        compose.onNodeWithText("Warm").assertIsSelected()
        compose.onNodeWithText("Frames").performClick()
        compose.onNodeWithText("Polaroid").performScrollTo().performClick()
        compose.waitForIdle()

        assertThat(look.value).isEqualTo(StoryMediaLook(filterPreset = "warm", frameId = "classic:polaroid"))
        compose.onNodeWithText("Polaroid").assertIsSelected()
        compose.onNodeWithText("Filters").performClick()
        compose.onNodeWithText("Warm").assertIsSelected()
        compose.onNodeWithText("Cool").assertIsNotSelected()
    }

    @Test
    fun `les effets offerts sont ceux que la retouche sait peindre`() {
        compose.setContent { MeeshyTheme { ComposerMediaLookPanel(look = null, onChoose = {}) } }

        compose.onNodeWithText("Effects").performClick()
        compose.waitForIdle()

        assertThat(ComposerMediaLookPanelRule.items(me.meeshy.sdk.model.composer.look.ComposerLookFamily.EFFECTS))
            .containsExactlyElementsIn((listOf(me.meeshy.sdk.model.composer.look.CallFaceEffect.NONE) + RetouchRenderableEffects).map { ComposerLookStripItem.Effect(it) })
    }
}
