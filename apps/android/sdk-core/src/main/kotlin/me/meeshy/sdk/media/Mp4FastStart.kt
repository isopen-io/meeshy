package me.meeshy.sdk.media

import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer

/**
 * Démarrage rapide réseau : place la boîte `moov` AVANT `mdat` pour que la lecture
 * commence sans attendre la fin du téléchargement, comme `shouldOptimizeForNetworkUse`
 * sur iOS. Les offsets de chunks (`stco`/`co64`) sont décalés de la taille de `moov`.
 * Sans effet (retour `false`, fichier intact) si le fichier est déjà en démarrage
 * rapide ou ne se laisse pas lire.
 */
internal object Mp4FastStart {
    private const val HEADER = 8L
    private val CONTAINERS = setOf("moov", "trak", "mdia", "minf", "stbl")

    private data class Box(val type: String, val offset: Long, val size: Long)

    fun apply(file: File): Boolean {
        val scratch = File(file.parentFile, file.name + ".faststart")
        return try {
            val rewritten = RandomAccessFile(file, "r").use { source -> rewrite(source, scratch) }
            if (rewritten) {
                file.delete() && scratch.renameTo(file)
            } else {
                scratch.delete()
                false
            }
        } catch (failure: Exception) {
            scratch.delete()
            false
        }
    }

    private fun rewrite(source: RandomAccessFile, scratch: File): Boolean {
        val boxes = topLevelBoxes(source) ?: return false
        val moov = boxes.firstOrNull { it.type == "moov" } ?: return false
        val firstMdat = boxes.firstOrNull { it.type == "mdat" } ?: return false
        if (moov.offset < firstMdat.offset || boxes.any { it.type == "mdat" && it.offset > moov.offset }) return false
        val patched = ByteArray(moov.size.toInt()).also {
            source.seek(moov.offset)
            source.readFully(it)
        }
        shiftChunkOffsets(patched, moov.size)
        scratch.outputStream().buffered().use { out ->
            val insertAfter = boxes.indexOfFirst { it.type == "ftyp" }
            if (insertAfter < 0) out.write(patched)
            boxes.forEachIndexed { index, box ->
                if (box.type != "moov") copy(source, box, out)
                if (index == insertAfter) out.write(patched)
            }
        }
        return true
    }

    private fun copy(source: RandomAccessFile, box: Box, out: java.io.OutputStream) {
        source.seek(box.offset)
        val buffer = ByteArray(64 * 1024)
        var remaining = box.size
        while (remaining > 0) {
            val read = source.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
            check(read > 0)
            out.write(buffer, 0, read)
            remaining -= read
        }
    }

    private fun topLevelBoxes(source: RandomAccessFile): List<Box>? {
        val length = source.length()
        val boxes = mutableListOf<Box>()
        var offset = 0L
        while (offset + HEADER <= length) {
            source.seek(offset)
            val head = ByteArray(16)
            source.read(head, 0, 8)
            val buffer = ByteBuffer.wrap(head)
            var size = buffer.int.toLong() and 0xFFFFFFFFL
            val type = String(head, 4, 4, Charsets.ISO_8859_1)
            if (size == 1L) {
                source.read(head, 8, 8)
                size = ByteBuffer.wrap(head, 8, 8).long
            } else if (size == 0L) {
                size = length - offset
            }
            if (size < HEADER || offset + size > length) return null
            boxes += Box(type, offset, size)
            offset += size
        }
        return boxes
    }

    private fun shiftChunkOffsets(moov: ByteArray, delta: Long) {
        walk(moov, 8, moov.size, delta)
    }

    private fun walk(data: ByteArray, start: Int, end: Int, delta: Long) {
        var position = start
        while (position + 8 <= end) {
            val size = ByteBuffer.wrap(data, position, 4).int
            if (size < 8 || position + size > end) return
            val type = String(data, position + 4, 4, Charsets.ISO_8859_1)
            val payload = position + 8
            when {
                type in CONTAINERS -> walk(data, payload, position + size, delta)
                type == "stco" -> patch(data, payload, entryBytes = 4, delta = delta)
                type == "co64" -> patch(data, payload, entryBytes = 8, delta = delta)
            }
            position += size
        }
    }

    private fun patch(data: ByteArray, payload: Int, entryBytes: Int, delta: Long) {
        val buffer = ByteBuffer.wrap(data)
        val count = buffer.getInt(payload + 4)
        var at = payload + 8
        repeat(count) {
            if (entryBytes == 4) {
                buffer.putInt(at, (buffer.getInt(at).toLong() + delta).toInt())
            } else {
                buffer.putLong(at, buffer.getLong(at) + delta)
            }
            at += entryBytes
        }
    }
}
