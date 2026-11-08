package me.meeshy.sdk.media

import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Mémoire BORNÉE des empreintes de fichiers (miroir d'iOS `FileDigestMemo`). L'empreinte est la clé du point de reprise :
 * sans mémoire, un vocal ou une vidéo de 200 Mo rejoué par la file après une coupure se relisait autant de fois qu'il
 * était retenté, avant le premier octet envoyé. Un fichier est reconnu par son chemin, sa taille ET sa date de
 * modification : un fichier réécrit au même chemin change d'identité et se rehache. Au-delà de [capacity], la plus
 * ancienne entrée cède.
 */
@Singleton
public class FileDigestMemo(capacity: Int) {
    @Inject
    public constructor() : this(DEFAULT_CAPACITY)

    private data class Identity(val path: String, val size: Long, val modifiedAt: Long)

    private val capacity = maxOf(1, capacity)
    private val digests = object : LinkedHashMap<Identity, String>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Identity, String>): Boolean = size > this@FileDigestMemo.capacity
    }

    public val count: Int get() = synchronized(digests) { digests.size }

    public fun digest(file: File, compute: () -> String): String {
        val identity = identityOf(file) ?: return compute()
        synchronized(digests) { digests[identity] }?.let { return it }
        val computed = compute()
        synchronized(digests) { digests.getOrPut(identity) { computed } }
        return computed
    }

    private fun identityOf(file: File): Identity? {
        if (!file.exists()) return null
        return Identity(file.absoluteFile.normalize().path, file.length(), file.lastModified())
    }

    public companion object {
        public const val DEFAULT_CAPACITY = 32
    }
}
