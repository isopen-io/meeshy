package me.meeshy.app.chat

import android.graphics.BitmapFactory
import com.google.common.truth.Truth.assertThat
import java.nio.file.Files
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Recette S8 2026-11-01 : le sticker 😎 partait en PNG 512×512 VIDE (1 112 octets). La police d'emoji couleur d'Android est
 * une police BITMAP (CBDT) que Skia ne dessine pas au-delà de 256 px (« Font size too large to fit in cache ») : peint à
 * 409 px, le glyphe ne laissait rien. Le glyphe se peint donc sous ce plafond, puis l'image s'agrandit.
 *
 * Robolectric n'embarque pas la police d'emoji couleur : le témoin de pixels dessine une LETTRE (police de repli), ce qui
 * prouve que la couche de dessin pose bien le glyphe dans le cadre ; le plafond est prouvé par sa propre règle.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ComposerEmojiStickerTest {

    @Test
    fun `le glyphe se peint sous le plafond des polices d'emoji bitmap`() {
        assertThat(ComposerEmojiSticker.GLYPH_TEXT_SIZE).isAtMost(ComposerEmojiSticker.COLOR_EMOJI_MAX_TEXT_SIZE)
    }

    @Test
    fun `le PNG produit fait 512 px de côté et porte des pixels opaques au centre`() {
        val dir = Files.createTempDirectory("sticker").toFile()
        val file = ComposerEmojiSticker.render("M", dir)
        val bitmap = BitmapFactory.decodeFile(file.absolutePath)

        assertThat(bitmap.width).isEqualTo(512)
        assertThat(bitmap.height).isEqualTo(512)
        val opaque = (0 until bitmap.height step 4).sumOf { y ->
            (0 until bitmap.width step 4).count { x -> (bitmap.getPixel(x, y) ushr 24) > 0 }
        }
        assertThat(opaque).isGreaterThan(50)
    }
}
