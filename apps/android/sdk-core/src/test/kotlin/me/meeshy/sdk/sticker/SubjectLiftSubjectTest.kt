package me.meeshy.sdk.sticker

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Recette S8 du 2026-10-30 : sur une photo sans sujet, le détourage d'ML Kit ne rend pas `null` mais une image ENTIÈREMENT
 * transparente — gardée telle quelle, elle devenait un sticker invisible dans Mes stickers. Une image sans un seul pixel
 * visible n'est pas un sujet : « Aucun sujet trouvé », comme iOS quand Vision ne rend aucune instance.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SubjectLiftSubjectTest {

    private fun transparent(width: Int = 60, height: Int = 90): Bitmap =
        Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.TRANSPARENT) }

    @Test
    fun `a fully transparent lift shows no subject`() {
        assertThat(transparent().showsSubject()).isFalse()
    }

    @Test
    fun `a lift with a visible cut-out shows its subject, even a small one off the sampling grid`() {
        val lifted = transparent().apply {
            (31..33).forEach { x -> (47..49).forEach { y -> setPixel(x, y, Color.RED) } }
        }

        assertThat(lifted.showsSubject()).isTrue()
    }
}
