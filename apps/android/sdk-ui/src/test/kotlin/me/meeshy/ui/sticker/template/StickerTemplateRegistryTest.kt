package me.meeshy.ui.sticker.template

import androidx.test.core.app.ApplicationProvider
import android.content.Context
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import me.meeshy.sdk.model.sticker.StickerTemplateFamily
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StickerTemplateRegistryTest {

    private val metrics = StickerTemplateMetrics.preview(104f)
    private val words = mapOf("text" to "Coucou")

    @Test
    fun `chaque famille du catalogue a son type de dessin, et chaque dessinateur son gabarit`() {
        StickerTemplateFamily.entries.forEach { family ->
            val drawing = StickerTemplateFamilyTable.drawing(family)
            assertThat(drawing.family).isEqualTo(family)
            drawing.drawers.forEach { drawer ->
                val template = StickerTemplateCatalog.template(drawer.id)
                assertThat(template).isNotNull()
                assertThat(template!!.family).isEqualTo(family)
            }
        }
    }

    @Test
    fun `les dix cadres a mots se dessinent, les familles squelettes pas encore`() {
        assertThat(StickerTemplateRegistry.drawableTemplateIds).containsExactlyElementsIn(
            StickerTemplateCatalog.templates(StickerTemplateFamily.TEXT).map { it.id },
        )
        assertThat(StickerTemplateRegistry.knows("weather.sunny")).isFalse()
    }

    @Test
    fun `un gabarit inconnu rend null, jamais un gabarit fabrique`() {
        assertThat(StickerTemplateRegistry.drawer("text.future")).isNull()
        assertThat(StickerTemplateRegistry.measuredSize("text.future", words, metrics)).isNull()
        assertThat(StickerTemplateRegistry.image("text.future", words, metrics, 2f)).isNull()
        assertThat(StickerTemplateRegistry.dieCutImage("text.future", words, metrics, 2f)).isNull()
    }

    @Test
    fun `le texte determine la taille de l'image, a l'echelle de l'ecran`() {
        val short = StickerTemplateRegistry.image("text.badge", words, metrics, 2f)!!
        val long = StickerTemplateRegistry.image("text.badge", mapOf("text" to "Un message nettement plus long"), metrics, 2f)!!
        assertThat(long.size.width).isAtLeast(short.size.width)
        assertThat(short.bitmap.config).isEqualTo(android.graphics.Bitmap.Config.ARGB_8888)
        assertThat(short.bitmap.width).isAtLeast((short.size.width * 2f).toInt())
    }

    @Test
    fun `le rendu est memoise et deterministe pour les memes emplacements, mesures et densite`() {
        val first = StickerTemplateRegistry.image("text.neon", words, metrics, 2f)!!
        val again = StickerTemplateRegistry.image("text.neon", words, metrics, 2f)!!
        assertThat(again.bitmap).isSameInstanceAs(first.bitmap)
        val denser = StickerTemplateRegistry.image("text.neon", words, metrics, 3f)!!
        assertThat(denser.bitmap).isNotSameInstanceAs(first.bitmap)
    }

    @Test
    fun `le contour decoupe agrandit l'image de la marge sur chaque bord`() {
        val plain = StickerTemplateRegistry.image("text.speechBubble", words, metrics, 2f)!!
        val cut = StickerTemplateRegistry.dieCutImage("text.speechBubble", words, metrics, 2f)!!
        val margin = StickerDieCut.margin(plain.size.width, plain.size.height)
        assertThat(cut.size.width).isWithin(0.01f).of(plain.size.width + 2 * margin)
        assertThat(cut.size.height).isWithin(0.01f).of(plain.size.height + 2 * margin)
        assertThat(cut.bitmap.width).isGreaterThan(plain.bitmap.width)
    }

    @Test
    fun `chaque cadre a un nom localise`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        StickerTemplateCatalog.templates(StickerTemplateFamily.TEXT).forEach {
            assertThat(StickerTemplateRegistry.drawer(it.id)!!.name(context)).isNotEmpty()
        }
    }

    @Test
    fun `un cadre sans mots dessine quand meme, un cadre en capitales mesure les capitales`() {
        assertThat(StickerTemplateRegistry.image("text.tape", emptyMap(), metrics, 2f)).isNotNull()
        val lower = StickerTemplateRegistry.measuredSize("text.stamp", mapOf("text" to "oui"), metrics)!!
        assertThat(lower.width).isGreaterThan(0f)
    }

    @Test
    fun `un gabarit minuscule se dessine grand puis se reduit a sa taille mesuree`() {
        val tiny = StickerTemplateMetrics.sticker(2f)
        val measured = StickerTemplateRegistry.measuredSize("text.badge", words, tiny)!!
        val render = StickerTemplateRegistry.image("text.badge", words, tiny, 1f)!!
        assertThat(render.size).isEqualTo(measured)
    }

    @Test
    fun `chaque cadre a mots se dessine identiquement a chaque appel, a l'echelle de l'ecran`() {
        StickerTemplateCatalog.templates(StickerTemplateFamily.TEXT).forEach {
            StickerTemplateGoldenSupport.assertDrawsIdentically(it.id, words, metrics, 2f)
        }
    }
}
