package me.meeshy.ui.component.media

import android.content.Context
import coil.request.CachePolicy
import coil.request.ImageRequest
import coil.size.Dimension
import coil.size.Size
import me.meeshy.sdk.model.media.DecodeBudget

/**
 * Les requetes d'image de l'app : decodage a la taille utile (palier de [DecodeBudget.bucket]) et cle de memoire
 * qui porte ce palier, de sorte qu'un cadre de 120 dp et un plein ecran ne partagent pas un bitmap de mauvaise taille.
 * La cle disque reste l'URL nue : le fichier est le meme a toutes les tailles.
 */
public object ImageRequests {
    public const val CROSSFADE_MILLIS: Int = 150

    public fun memoryKey(url: String, targetWidthPx: Int?): String =
        if (targetWidthPx == null) url else "$url#w${DecodeBudget.bucket(targetWidthPx)}"

    public fun build(
        context: Context,
        url: String,
        targetWidthPx: Int?,
        allowNetwork: Boolean,
        attempt: Int = 0,
        reloadToken: Any? = null,
    ): ImageRequest = ImageRequest.Builder(context)
        .data(url)
        .memoryCacheKey(memoryKey(url, targetWidthPx))
        .diskCacheKey(url)
        .apply {
            if (targetWidthPx != null) size(Size(Dimension.Pixels(DecodeBudget.bucket(targetWidthPx)), Dimension.Undefined))
        }
        .networkCachePolicy(if (allowNetwork) CachePolicy.ENABLED else CachePolicy.DISABLED)
        .crossfade(CROSSFADE_MILLIS)
        .setParameter("attempt", attempt, memoryCacheKey = null)
        .setParameter("reload", reloadToken?.toString(), memoryCacheKey = null)
        .build()
}
