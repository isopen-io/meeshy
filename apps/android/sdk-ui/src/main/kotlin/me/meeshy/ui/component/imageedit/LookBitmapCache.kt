package me.meeshy.ui.component.imageedit

import android.graphics.Bitmap
import android.util.LruCache
import java.lang.ref.WeakReference

/**
 * Le cache des images réglées, indexé par INSTANCE d'image et par VALEURS : un curseur qui revient
 * sur une valeur déjà vue ne refait aucun rendu, et un bitmap remplacé ne resservira jamais le look
 * de l'ancien. Chaque entrée garde un lien FAIBLE vers sa source : l'identité d'un objet libéré peut
 * être rendue à un autre, l'entrée n'est donc servie qu'à CETTE instance vivante.
 */
public class LookBitmapCache(maxBytes: Int = DEFAULT_MAX_BYTES) {
    private class Entry(source: Bitmap, val baked: Bitmap) {
        val source: WeakReference<Bitmap> = WeakReference(source)
    }

    private val lru = object : LruCache<String, Entry>(maxBytes) {
        override fun sizeOf(key: String, value: Entry): Int = value.baked.byteCount
    }

    public fun get(source: Bitmap, instanceId: String?, signature: String): Bitmap? {
        val entry = lru.get(key(source, instanceId, signature)) ?: return null
        return if (entry.source.get() === source) entry.baked else null
    }

    public fun put(source: Bitmap, instanceId: String?, signature: String, baked: Bitmap) {
        lru.put(key(source, instanceId, signature), Entry(source, baked))
    }

    public fun clear() {
        lru.evictAll()
    }

    private fun key(source: Bitmap, instanceId: String?, signature: String): String =
        "${instanceId.orEmpty()}#${System.identityHashCode(source)}|$signature"

    public companion object {
        public const val DEFAULT_MAX_BYTES: Int = 40 * 1024 * 1024
    }
}
