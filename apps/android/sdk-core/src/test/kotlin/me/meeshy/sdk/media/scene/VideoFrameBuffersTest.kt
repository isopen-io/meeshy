package me.meeshy.sdk.media.scene

import com.google.common.truth.Truth.assertThat
import java.nio.ByteBuffer
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * **Une vidéo posée se décode dans UN bitmap, réutilisé** (#13897, recette S8 du 2026-11-01 à 0 h 51) : l'export mourait en
 * OutOfMemoryError à la seconde suivant son départ. Le décodeur copiait ses trois plans YUV dans des tableaux neufs, puis
 * fabriquait un tableau de pixels et un bitmap neufs, à CHAQUE image de sortie — des dizaines de mégaoctets par seconde
 * qu'Android 9 devait ramasser sur un tas de 256 Mo déjà presque plein. L'empreinte d'une vidéo posée est désormais fixe :
 * un bitmap, trois plans et un tableau de pixels, quel que soit le nombre d'images.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class VideoFrameBuffersTest {

    private val width = 8
    private val height = 4

    /** Une image grise de luminance [luma] (chroma neutre), lue par [buffers] depuis les tampons du décodeur. */
    private fun gray(buffers: VideoFrameBuffers, luma: Int): YuvPlanes {
        val chroma = ByteBuffer.wrap(ByteArray(width / 2 * height / 2) { 128.toByte() })
        return YuvPlanes(
            width = width, height = height,
            y = buffers.plane(0, ByteBuffer.wrap(ByteArray(width * height) { luma.toByte() }), 0), yRowStride = width, yPixelStride = 1,
            u = buffers.plane(1, chroma, 0), uRowStride = width / 2, uPixelStride = 1,
            v = buffers.plane(2, chroma, 0), vRowStride = width / 2, vPixelStride = 1,
        )
    }

    private fun drawn(buffers: VideoFrameBuffers, frames: Int) =
        (0 until frames).map { index -> buffers.render(gray(buffers, 16 + index * 7), rotationDegrees = 0, maxLongSide = 1_080) }

    @Test
    fun `trente images d une video posee tiennent dans un seul bitmap et quatre tableaux`() {
        val buffers = VideoFrameBuffers()

        val frames = drawn(buffers, frames = 30)

        assertThat(frames.map(System::identityHashCode).distinct()).hasSize(1)
        assertThat(buffers.bitmapsAllocated).isEqualTo(1)
        assertThat(buffers.arraysAllocated).isEqualTo(4)
    }

    @Test
    fun `le bitmap reutilise montre la derniere image decodee`() {
        val buffers = VideoFrameBuffers()

        val last = drawn(buffers, frames = 30).last()

        val luma = (16 + 29 * 7 - 16) * 298 + 128 shr 8
        assertThat(last.getPixel(width / 2, height / 2) and 0xFF).isEqualTo(luma.coerceAtMost(255))
        assertThat(last.width).isEqualTo(width)
        assertThat(last.height).isEqualTo(height)
    }

    @Test
    fun `liberer les tampons rend le bitmap`() {
        val buffers = VideoFrameBuffers()
        val last = drawn(buffers, frames = 3).last()

        buffers.release()

        assertThat(last.isRecycled).isTrue()
    }
}
