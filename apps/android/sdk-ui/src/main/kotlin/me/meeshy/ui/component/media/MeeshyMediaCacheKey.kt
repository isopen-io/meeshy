package me.meeshy.ui.component.media

import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.cache.CacheKeyFactory
import me.meeshy.sdk.model.mediacache.MediaCacheKey

/**
 * Clé canonique d'un média dans les caches Media3 : celle de [MediaCacheKey] (SHA-256 de l'URL,
 * 8 octets, extension conservée), la MÊME que le cache disque d'iOS et que la table d'épingles.
 * Une clé unique est ce qui permet à l'éviction de reconnaître une épingle, au cache de rouvrir un
 * média sans réseau et à l'entonnoir de ne lancer qu'un transfert par ressource.
 */
@UnstableApi
public object MeeshyMediaCacheKey : CacheKeyFactory {
    public fun of(url: String): String = MediaCacheKey.of(url)

    override fun buildCacheKey(dataSpec: DataSpec): String =
        dataSpec.key ?: of(dataSpec.uri.toString())
}
