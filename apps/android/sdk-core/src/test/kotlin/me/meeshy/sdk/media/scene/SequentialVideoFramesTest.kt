package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13897 — recette S8 du 2026-10-31 (23 h 50) : un fond vidéo de 8,2 s et une vidéo POSÉE de 15,6 s ; l'export s'arrêtait
 * 38 s plus tard sur « Muxer error ← Abort: no output sample written in the last 10000 milliseconds ». Les images de la vidéo
 * posée se lisaient par `MediaMetadataRetriever.getFramesAtIndex`, six à la fois : chaque lot redécodait depuis l'image clé
 * précédente, et une vidéo de galerie aux images clés espacées tenait le fil GL plus de dix secondes sur un seul lot.
 * Désormais la source se décode UNE fois, dans l'ordre : chaque image sort du décodeur une seule fois, seule celle qu'on
 * montre se convertit, et seul le retour de la boucle repositionne le décodeur.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SequentialVideoFramesTest {

    /** Une source de [count] images, une toutes les [stepMillis] ; [stallAfter] : le décodeur ne rend plus rien passé ce rang. */
    private class Source(private val count: Int, private val stepMillis: Long = 33L, private val stallAfter: Int = Int.MAX_VALUE) : VideoFrameDecoder {
        var cursor = 0
        var decoded = 0
        val seeks = mutableListOf<Long>()
        val rendered = mutableListOf<Long>()
        var held = 0
        var asked = 0
        var released = false

        override fun seekTo(sourceMillis: Long) {
            seeks += sourceMillis
            cursor = (sourceMillis / stepMillis).toInt().coerceIn(0, count)
        }

        override fun next(): DecodedVideoFrame? {
            asked++
            if (cursor >= count || cursor >= stallAfter) return null
            val millis = cursor * stepMillis
            cursor++
            decoded++
            held++
            return object : DecodedVideoFrame {
                override val presentationMillis = millis
                override fun render(): Bitmap = Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888).also { rendered += millis }
                override fun release() { held-- }
            }
        }

        override fun release() { released = true }
    }

    private fun frames(source: Source) = SequentialVideoFrames(source)

    @Test
    fun `une source lue dans l ordre sort chaque image du decodeur une seule fois, sans repositionner`() {
        val source = Source(count = 480)
        val frames = frames(source)

        (0L until 15_600L step 33L).forEach { frames.frameAt(it) }

        assertThat(source.seeks).isEmpty()
        assertThat(source.decoded).isAtMost(474)
        assertThat(source.held).isAtMost(1)
    }

    @Test
    fun `seule l image montree se convertit, la plus proche avant l instant demande`() {
        val source = Source(count = 600, stepMillis = 16L)
        val frames = frames(source)

        frames.frameAt(0)
        frames.frameAt(100)
        frames.frameAt(200)

        assertThat(source.rendered).containsExactly(0L, 96L, 192L).inOrder()
    }

    @Test
    fun `une image tenue sur plusieurs instants se rend une fois`() {
        val source = Source(count = 100, stepMillis = 66L)
        val frames = frames(source)

        val first = frames.frameAt(10)
        val again = frames.frameAt(40)

        assertThat(again).isSameInstanceAs(first)
        assertThat(source.rendered).containsExactly(0L)
    }

    @Test
    fun `le retour de la boucle repositionne une fois, au debut de la fenetre`() {
        val source = Source(count = 480)
        val frames = frames(source)

        (2_000L until 4_000L step 33L).forEach { frames.frameAt(it) }
        (2_000L until 4_000L step 33L).forEach { frames.frameAt(it) }

        assertThat(source.seeks).containsExactly(2_000L, 2_000L).inOrder()
    }

    @Test
    fun `un decodeur qui ne rend plus rien laisse la derniere image et n est plus sollicite avant la boucle`() {
        val source = Source(count = 480, stallAfter = 10)
        val frames = frames(source)

        val stalled = frames.frameAt(1_000)
        val asked = source.asked
        val later = (1_033L until 2_000L step 33L).map { frames.frameAt(it) }

        assertThat(stalled).isNotNull()
        assertThat(source.rendered).containsExactly(297L)
        assertThat(later.all { it === stalled }).isTrue()
        assertThat(source.asked).isEqualTo(asked)
    }

    @Test
    fun `rendre les images rend le decodeur et ce qu il tenait`() {
        val source = Source(count = 480)
        val frames = frames(source)
        frames.frameAt(500)

        frames.release()

        assertThat(source.released).isTrue()
        assertThat(source.held).isEqualTo(0)
    }

    @Test
    fun `un decodeur qui leve ne pose plus rien et n est plus rouvert`() {
        var opened = 0
        val frames = GuardedVideoFrames("fg.mp4") {
            opened++
            object : PlacedVideoFrames {
                override fun frameAt(sourceMillis: Long): Bitmap? = throw IllegalStateException("codec")
                override fun release() = Unit
            }
        }

        assertThat(frames.frameAt(0)).isNull()
        assertThat(frames.frameAt(33)).isNull()
        assertThat(opened).isEqualTo(1)
    }
}
