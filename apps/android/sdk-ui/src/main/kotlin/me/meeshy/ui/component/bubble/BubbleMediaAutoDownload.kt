package me.meeshy.ui.component.bubble

import androidx.annotation.OptIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.media3.common.util.UnstableApi
import coil.compose.AsyncImage
import coil.compose.rememberAsyncImagePainter
import coil.memory.MemoryCache
import coil.request.CachePolicy
import coil.request.ImageRequest
import me.meeshy.sdk.model.MediaAutoDownloadDecider
import me.meeshy.sdk.model.MediaAvailability
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.piece.PieceBadge
import me.meeshy.ui.component.media.MeeshyMediaCache

/**
 * La politique de téléchargement automatique des médias du fil (#14639) : le réseau du moment et
 * les préférences « Réglages › Médias », fournis par l'hôte. Elle décide si une bulle va CHERCHER
 * un média sur le réseau ; un média déjà en cache s'affiche toujours, hors ligne compris.
 *
 * Sous [me.meeshy.sdk.model.MediaDownloadPolicyEngine.SMALL_MEDIA_AUTO_DOWNLOAD_BYTES], une image
 * descend seule dès que l'appareil est en ligne.
 */
@Immutable
public data class BubbleMediaAutoDownload(
    val condition: NetworkCondition,
    val prefs: MediaDownloadPreferences,
) {
    /** La bulle peut-elle aller chercher sur le réseau une image de [sizeBytes] octets ? */
    public fun fetches(sizeBytes: Long?, kind: MediaKind = MediaKind.IMAGE): Boolean =
        MediaAutoDownloadDecider.decide(
            kind = kind,
            availability = MediaAvailability.NEEDS_DOWNLOAD,
            condition = condition,
            prefs = prefs,
            sizeBytes = sizeBytes,
        ).shouldDownload
}

/** `null` : aucun hôte n'a branché de politique — la bulle charge comme avant. */
public val LocalBubbleMediaAutoDownload = compositionLocalOf<BubbleMediaAutoDownload?> { null }

/**
 * **Une vidéo rendue en ligne de fichier se télécharge-t-elle seule ?** (#14652, miroir de
 * `VideoAvailabilityResolver.shouldAutoStart`, iOS) — la MÊME politique que l'image de bulle, appliquée au genre
 * vidéo : sous 100 Ko en ligne, toujours ; au-delà, la préférence vidéo de « Réglages › Médias » ; hors ligne, jamais.
 * Seule une rangée encore « à télécharger » part : ni scellée, ni protégée, ni déjà là, ni en échec. Sans politique
 * fournie par l'hôte, rien ne part seul.
 */
internal fun bubbleAutoDownloadsVideo(policy: BubbleMediaAutoDownload?, file: BubbleFile, badge: PieceBadge): Boolean =
    policy != null && file.isVideo && badge is PieceBadge.Idle &&
        policy.fetches(file.sizeBytes?.toLong(), MediaKind.VIDEO)

/** Met la vidéo de [url] dans le cache de lecture ; rend `true` quand elle y est entière. */
public fun interface BubbleVideoPrefetcher {
    public suspend fun prefetch(url: String): Boolean
}

/** `null` : le cache vidéo Media3 de l'app ([MeeshyMediaCache]), celui que le lecteur relit. */
public val LocalBubbleVideoPrefetcher = staticCompositionLocalOf<BubbleVideoPrefetcher?> { null }

@OptIn(UnstableApi::class)
@Composable
internal fun rememberBubbleVideoPrefetcher(): BubbleVideoPrefetcher {
    val provided = LocalBubbleVideoPrefetcher.current
    val context = LocalContext.current.applicationContext
    return provided ?: remember(context) { BubbleVideoPrefetcher { url -> MeeshyMediaCache.get(context).prefetch(MediaCacheCategory.VIDEO, url) } }
}

/** La politique (absente ⇒ libre) laisse-t-elle la bulle chercher ce média sur le réseau ? */
internal fun bubbleFetchesFromNetwork(policy: BubbleMediaAutoDownload?, sizeBytes: Long?): Boolean =
    policy?.fetches(sizeBytes) ?: true

/**
 * L'image d'une bulle sous la politique de téléchargement : [url] vient du réseau si la politique
 * le permet, sinon du seul cache ; à défaut, [fallbackUrl] (la vignette légère) la remplace.
 */
@Composable
internal fun BubblePolicyImage(
    url: String,
    fallbackUrl: String?,
    sizeBytes: Long?,
    contentDescription: String,
    modifier: Modifier = Modifier,
) {
    val fetches = bubbleFetchesFromNetwork(LocalBubbleMediaAutoDownload.current, sizeBytes)
    val context = LocalContext.current
    val painted = remember { PaintedImage() }
    val request = remember(url, fetches) {
        ImageRequest.Builder(context)
            .data(url)
            .networkCachePolicy(if (fetches) CachePolicy.ENABLED else CachePolicy.DISABLED)
            .placeholderMemoryCacheKey(painted.key)
            .build()
    }
    val fallback = if (fetches || fallbackUrl == null) null else rememberAsyncImagePainter(fallbackUrl)
    AsyncImage(
        model = request,
        contentDescription = contentDescription,
        contentScale = ContentScale.Crop,
        error = fallback,
        onSuccess = { painted.key = it.result.memoryCacheKey },
        modifier = modifier,
    )
}

/**
 * Ce que la case a peint en dernier : quand son adresse change (l'aperçu local d'un envoi cède à l'URL du serveur,
 * #15104), l'image d'avant reste à l'écran jusqu'à la nouvelle — aucune case vide entre les deux.
 */
private class PaintedImage {
    var key: MemoryCache.Key? = null
}
