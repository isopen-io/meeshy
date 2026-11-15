package me.meeshy.ui.story.canvas

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Le pont d'invalidation d'une image retouchée (iOS : le bitmap retouché remplace l'ancien sous la MÊME adresse). L'adresse
 * d'une image retouchée reste CONSTANTE ; ce qui change est son cookie de version, monotone et commun à toutes les
 * adresses : chaque [invalidate] en donne un strictement plus grand que tous les précédents. Le cookie entre dans la clé du
 * cache d'images ([cacheKey]) — l'ancienne image n'est jamais resservie, et aucune requête ne se fait sans cache non vide.
 *
 * [evict] reçoit l'ancienne clé de cache à retirer (la mémoire de Coil) ; l'hôte la branche.
 */
public class SceneEditedBitmapBridge(private val evict: (String) -> Unit = {}) {
    private val clock = AtomicLong(0L)
    private val versions = ConcurrentHashMap<String, Long>()

    /** Le cookie courant de [url] ; 0 tant qu'elle n'a jamais été retouchée. */
    public fun versionOf(url: String): Long = versions[url] ?: 0L

    /** La clé de cache de [url] : l'adresse seule tant qu'elle n'est pas retouchée, sinon adresse et cookie. */
    public fun cacheKey(url: String): String = cacheKey(url, versionOf(url))

    /** [url] vient d'être retouchée : son cookie avance, l'ancienne image quitte le cache. Rend le nouveau cookie. */
    public fun invalidate(url: String): Long {
        val previous = cacheKey(url)
        val next = clock.incrementAndGet()
        versions[url] = next
        evict(previous)
        return next
    }

    public companion object {
        public fun cacheKey(url: String, version: Long): String = if (version <= 0L) url else "$url#v$version"
    }
}
