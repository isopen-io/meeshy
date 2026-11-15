package me.meeshy.sdk.model.mediacache

import java.security.MessageDigest

/**
 * Clé de cache d'un média : SHA-256 de l'URL canonique, 8 premiers octets en hexadécimal
 * minuscule (16 caractères), suivis de l'extension du chemin s'il y en a une.
 * Miroir de `DiskCacheStore.fileKey(for:)` (iOS) — FORMAT STABLE, jamais modifié : un
 * changement orphelinerait tout le cache disque et toutes les épingles persistées.
 */
public object MediaCacheKey {
    private const val DIGEST_PREFIX_BYTES = 8

    public fun of(url: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(url.toByteArray(Charsets.UTF_8))
        val hex = digest.take(DIGEST_PREFIX_BYTES).joinToString("") { "%02x".format(it) }
        val extension = pathExtension(url)
        return if (extension.isEmpty()) hex else "$hex.$extension"
    }

    private fun pathExtension(url: String): String {
        val noQuery = url.substringBefore('#').substringBefore('?')
        val path = if ("://" in noQuery) noQuery.substringAfter("://").substringAfter('/', "") else noQuery
        val lastSegment = path.substringAfterLast('/')
        if (!lastSegment.contains('.')) return ""
        return lastSegment.substringAfterLast('.')
    }
}
