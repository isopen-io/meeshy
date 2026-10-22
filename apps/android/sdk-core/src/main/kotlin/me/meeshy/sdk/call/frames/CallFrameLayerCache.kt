package me.meeshy.sdk.call.frames

import android.graphics.Bitmap

/**
 * Les deux couches d'un cadre qui ne dépendent pas des visages : le FOND (opaque) et le DESSUS
 * (transparent). Ce qui ne dépend pas des visages se peint une fois par scène et se réutilise à chaque image.
 */
class CallFrameLayers(val backdrop: Bitmap, val overlay: Bitmap) {
    val cost: Int get() = backdrop.byteCount + overlay.byteCount
}

/**
 * LE CACHE DES COUCHES (§ 5.5) : borné en OCTETS, le moins récemment lu est évincé le premier. La clé est
 * la clé de scène ([me.meeshy.sdk.model.call.frames.CallFrameLayerKey]) : tant que le cadre, les personnes,
 * les textes ou la taille ne changent pas, les couches ne se repeignent pas. Une valeur plus lourde que la
 * borne n'est pas gardée (elle sert une fois, sans évincer les couches qui servent à chaque image).
 */
class CallFrameLayerCache<V : Any>(private val costLimit: Long, private val costOf: (V) -> Int) {
    private val entries = object : LinkedHashMap<String, V>(16, 0.75f, true) {}
    private var total = 0L

    @Synchronized
    fun get(key: String): V? = entries[key]

    @Synchronized
    fun put(key: String, value: V) {
        val cost = costOf(value).toLong()
        remove(key)
        if (cost > costLimit) return
        entries[key] = value
        total += cost
        val iterator = entries.entries.iterator()
        while (total > costLimit && iterator.hasNext()) {
            val eldest = iterator.next()
            if (eldest.key == key) continue
            total -= costOf(eldest.value)
            iterator.remove()
        }
    }

    @Synchronized
    fun remove(key: String) {
        entries.remove(key)?.let { total -= costOf(it) }
    }

    /** Vide le cache (changement de compte, pression mémoire). */
    @Synchronized
    fun purge() {
        entries.clear()
        total = 0
    }

    @get:Synchronized
    val size: Int get() = entries.size

    @get:Synchronized
    val totalCost: Long get() = total
}
