package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import java.nio.ByteBuffer

/**
 * **L'empreinte FIXE d'une vidéo posée** (#13897, recette S8 du 2026-11-01 à 0 h 51) : un bitmap, trois plans YUV et un
 * tableau de pixels, alloués à la première image et réécrits à chacune des suivantes. Le décodeur en allouait de neufs à
 * chaque image de sortie, et l'export mourait en OutOfMemoryError sur le tas de 256 Mo d'Android 9. Le bitmap rendu
 * appartient à ces tampons : il est réécrit à l'image suivante et rendu par [release].
 */
internal class VideoFrameBuffers {
    var bitmapsAllocated: Int = 0
        private set
    var arraysAllocated: Int = 0
        private set
    private val planes = arrayOfNulls<ByteArray>(PLANES)
    private var pixels: IntArray? = null
    private var bitmap: Bitmap? = null

    /** Le plan [slot] (0 : Y, 1 : U, 2 : V) recopié depuis [buffer] à partir d'[offset], dans le tableau du plan. */
    fun plane(slot: Int, buffer: ByteBuffer, offset: Int): ByteArray {
        val view = buffer.duplicate()
        view.position(minOf(offset, view.limit()))
        val size = view.remaining()
        val target = planes[slot]?.takeIf { it.size == size } ?: ByteArray(size).also {
            planes[slot] = it
            arraysAllocated++
        }
        view.get(target)
        return target
    }

    /** L'image [planes] convertie ([YuvFrameConverter]) dans le bitmap de la vidéo. */
    fun render(planes: YuvPlanes, rotationDegrees: Int, maxLongSide: Int): Bitmap {
        val converted = YuvFrameConverter.convert(planes, rotationDegrees, maxLongSide, pixels)
        if (converted.pixels !== pixels) {
            pixels = converted.pixels
            arraysAllocated++
        }
        val target = bitmap?.takeIf { !it.isRecycled && it.width == converted.width && it.height == converted.height }
            ?: Bitmap.createBitmap(converted.width, converted.height, Bitmap.Config.ARGB_8888).also {
                bitmap?.recycle()
                bitmap = it
                bitmapsAllocated++
            }
        target.setPixels(converted.pixels, 0, converted.width, 0, 0, converted.width, converted.height)
        return target
    }

    fun release() {
        bitmap?.recycle()
        bitmap = null
        pixels = null
        planes.fill(null)
    }

    private companion object {
        const val PLANES = 3
    }
}
