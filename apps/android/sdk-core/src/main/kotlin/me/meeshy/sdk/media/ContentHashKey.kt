package me.meeshy.sdk.media

import java.security.MessageDigest

/** L'empreinte SHA-256 d'une source, calculée EN FLUX par un tampon borné : un fichier de 200 Mo n'est jamais en mémoire. */
internal object ContentHash {
    private const val BUFFER_BYTES = 64 * 1024

    fun sha256Hex(source: MediaUploadSource): String {
        val digest = MessageDigest.getInstance("SHA-256")
        source.open().use { input ->
            val buffer = ByteArray(BUFFER_BYTES)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
