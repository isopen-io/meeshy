package me.meeshy.sdk.media

import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import java.io.InputStream

/**
 * Le cache qui adopte les octets d'un média tout juste envoyé sous l'adresse que le serveur lui a donnée (#13861) : sa
 * première lecture ne repasse pas par le réseau. Implémenté par les caches Media3 de l'app (`MeeshyMediaCache`) pour
 * l'audio et la vidéo et par le cache disque de Coil (`CoilUploadedImageCache`) pour les images (#13876), réunis par
 * [byCategory] ; le SDK ne décide que de ce qui s'y adopte ([UploadedMediaSeeder]).
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

        /**
         * Le cache qui confie chaque catégorie au cache qui la porte (#13876) : les images au cache de Coil, l'audio et la
         * vidéo aux caches Media3. Une catégorie sans cache n'adopte rien.
         */
        public fun byCategory(routes: Map<MediaCacheCategory, UploadedMediaCache>): UploadedMediaCache =
            object : UploadedMediaCache {
                override fun adopt(category: MediaCacheCategory, url: String, length: Long, open: () -> InputStream): Boolean =
                    (routes[category] ?: None).adopt(category, url, length, open)
            }
    }
}
