package me.meeshy.sdk.media

import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import java.io.InputStream

/**
 * Le cache qui adopte les octets d'un média tout juste envoyé sous l'adresse que le serveur lui a donnée (#13861) : sa
 * première lecture ne repasse pas par le réseau. Implémenté par les caches Media3 de l'app (`MeeshyMediaCache`) ; le
 * SDK ne décide que de ce qui s'y adopte ([UploadedMediaSeeder]).
 */
public interface UploadedMediaCache {
    /**
     * Adopte [length] octets lus depuis [open] comme la ressource de [url] dans [category]. Rend `true` quand la
     * ressource est en cache entière, `false` sinon (lecture qui échoue, longueur fausse, ressource déjà en écriture) :
     * rien de partiel n'y reste.
     */
    public fun adopt(category: MediaCacheCategory, url: String, length: Long, open: () -> InputStream): Boolean

    public companion object {
        public val None: UploadedMediaCache = object : UploadedMediaCache {
            override fun adopt(category: MediaCacheCategory, url: String, length: Long, open: () -> InputStream): Boolean = false
        }
    }
}
