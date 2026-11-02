package me.meeshy.ui.component.lottie

import android.graphics.Bitmap
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.zip.CRC32

/**
 * **Des images d'une boucle, encodées en PNG animé (APNG)** — miroir de `AnimatedImageEncoder` (iOS).
 *
 * Le seul conteneur animé AVEC canal alpha que les trois clients savent lire (publié en `image/png`). Android n'a
 * aucun encodeur système d'APNG : chaque image part en PNG par le codec de la plateforme, puis [ApngAssembler]
 * réécrit les blocs `acTL` / `fcTL` / `fdAT`.
 */
public object AnimatedImageEncoder {
    public fun apng(frames: List<Bitmap>, delayMillis: Int, loopCount: Int = 0): ByteArray? {
        if (frames.isEmpty()) return null
        val pngs = frames.map { frame ->
            val out = ByteArrayOutputStream()
            if (!frame.compress(Bitmap.CompressFormat.PNG, 100, out)) return null
            out.toByteArray()
        }
        return ApngAssembler.assemble(pngs, delayMillis, loopCount)
    }
}

/** Assemble des PNG de même taille en un APNG (alpha conservé, `blend_op` SOURCE, `dispose_op` NONE). Pur. */
public object ApngAssembler {
    private val SIGNATURE = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)

    private class Parsed(val ihdr: ByteArray, val idat: ByteArray)

    /** `null` si une entrée n'est pas un PNG lisible ou si les tailles diffèrent. */
    public fun assemble(pngs: List<ByteArray>, delayMillis: Int, loopCount: Int = 0): ByteArray? {
        if (pngs.isEmpty()) return null
        val frames = pngs.map { parse(it) ?: return null }
        val ihdr = frames.first().ihdr
        if (frames.any { !it.ihdr.copyOfRange(0, 8).contentEquals(ihdr.copyOfRange(0, 8)) }) return null
        val width = ByteBuffer.wrap(ihdr, 0, 4).int
        val height = ByteBuffer.wrap(ihdr, 4, 4).int
        val out = ByteArrayOutputStream()
        out.write(SIGNATURE)
        writeChunk(out, "IHDR", ihdr)
        writeChunk(out, "acTL", ByteBuffer.allocate(8).putInt(frames.size).putInt(loopCount.coerceAtLeast(0)).array())
        var sequence = 0
        frames.forEachIndexed { index, frame ->
            writeChunk(out, "fcTL", frameControl(sequence++, width, height, delayMillis))
            if (index == 0) {
                writeChunk(out, "IDAT", frame.idat)
            } else {
                writeChunk(out, "fdAT", ByteBuffer.allocate(4 + frame.idat.size).putInt(sequence++).put(frame.idat).array())
            }
        }
        writeChunk(out, "IEND", ByteArray(0))
        return out.toByteArray()
    }

    private fun frameControl(sequence: Int, width: Int, height: Int, delayMillis: Int): ByteArray =
        ByteBuffer.allocate(26)
            .putInt(sequence).putInt(width).putInt(height).putInt(0).putInt(0)
            .putShort(delayMillis.coerceIn(0, 0xFFFF).toShort()).putShort(1000)
            .put(0).put(0)
            .array()

    private fun parse(png: ByteArray): Parsed? {
        if (png.size < SIGNATURE.size || !png.copyOfRange(0, SIGNATURE.size).contentEquals(SIGNATURE)) return null
        var position = SIGNATURE.size
        var ihdr: ByteArray? = null
        val idat = ByteArrayOutputStream()
        while (position + 12 <= png.size) {
            val length = ByteBuffer.wrap(png, position, 4).int
            if (length < 0 || position + 12 + length > png.size) return null
            val type = String(png, position + 4, 4, Charsets.US_ASCII)
            val data = png.copyOfRange(position + 8, position + 8 + length)
            when (type) {
                "IHDR" -> ihdr = data
                "IDAT" -> idat.write(data)
                "IEND" -> break
            }
            position += 12 + length
        }
        val header = ihdr ?: return null
        return idat.size().takeIf { it > 0 }?.let { Parsed(header, idat.toByteArray()) }
    }

    private fun writeChunk(out: ByteArrayOutputStream, type: String, data: ByteArray) {
        val name = type.toByteArray(Charsets.US_ASCII)
        out.write(ByteBuffer.allocate(4).putInt(data.size).array())
        out.write(name)
        out.write(data)
        val crc = CRC32().apply { update(name); update(data) }
        out.write(ByteBuffer.allocate(4).putInt(crc.value.toInt()).array())
    }
}
