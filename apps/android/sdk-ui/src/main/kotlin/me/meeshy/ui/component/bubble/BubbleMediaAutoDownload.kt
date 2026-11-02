package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil.compose.AsyncImage
import coil.compose.rememberAsyncImagePainter
import coil.request.CachePolicy
import coil.request.ImageRequest
import me.meeshy.sdk.model.MediaAutoDownloadDecider
import me.meeshy.sdk.model.MediaAvailability
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.NetworkCondition

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
    val request = remember(url, fetches) {
        ImageRequest.Builder(context)
            .data(url)
            .networkCachePolicy(if (fetches) CachePolicy.ENABLED else CachePolicy.DISABLED)
            .build()
    }
    val fallback = if (fetches || fallbackUrl == null) null else rememberAsyncImagePainter(fallbackUrl)
    AsyncImage(
        model = request,
        contentDescription = contentDescription,
        contentScale = ContentScale.Crop,
        error = fallback,
        modifier = modifier,
    )
}
