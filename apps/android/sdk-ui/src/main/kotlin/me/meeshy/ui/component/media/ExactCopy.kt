package me.meeshy.ui.component.media

import java.io.InputStream
import java.io.OutputStream

private const val COPY_BUFFER_BYTES = 64 * 1024

/**
 * Copie exactement [length] octets de [input] vers [out] : rend `false` si la source s'arrête avant ou en a davantage.
 * Un cache qui adopte un fichier envoyé (#13861, #13876) n'adopte que la taille que le serveur a annoncée.
 */
internal fun copyExactly(input: InputStream, out: OutputStream, length: Long): Boolean {
    val buffer = ByteArray(COPY_BUFFER_BYTES)
    var copied = 0L
    while (copied < length) {
        val read = input.read(buffer, 0, minOf(buffer.size.toLong(), length - copied).toInt())
        if (read < 0) return false
        out.write(buffer, 0, read)
        copied += read
    }
    return input.read() < 0
}
