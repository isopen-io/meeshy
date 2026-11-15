package me.meeshy.ui.component.media

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.imageLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.loading.LoadingSheenLaw
import me.meeshy.sdk.model.media.DecodeBudget
import me.meeshy.sdk.model.media.DisplayMetrics
import me.meeshy.sdk.model.media.ImageChrome
import me.meeshy.sdk.model.media.ImageLoadPolicy
import me.meeshy.sdk.model.media.ImagePhase
import me.meeshy.ui.R
import me.meeshy.ui.component.bubble.LocalBubbleMediaAutoDownload
import me.meeshy.ui.component.skeleton.LoadingSheenStyle
import me.meeshy.ui.component.skeleton.LocalLoadingSheenPhase
import me.meeshy.ui.component.skeleton.loadingSheen
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **L'image unique de l'app** (miroir de `CachedAsyncImage`, iOS) : residente en memoire/disque elle s'affiche sans
 * attente ; sinon le flou ThumbHash occupe le cadre (jamais de case vide, aucun saut de mise en page) puis un fondu
 * l'ouvre. Decodee a la taille utile ([surface]) ; soumise a la politique de telechargement de l'hote
 * ([LocalBubbleMediaAutoDownload], absente = libre) sauf [autoLoad] (geste manuel) et fichiers locaux.
 *
 * Etats : reflet seulement pendant un chargement reel ; echec avec « Reessayer » ; retenue avec « toucher pour
 * telecharger » ; [showsStatusOverlays] = false pour une surface decorative, sans aucun chrome. [reloadToken] relance
 * le chargement quand un media arrive sous la meme URL.
 */
@Composable
public fun MeeshyAsyncImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    surface: DecodeBudget.Surface = DecodeBudget.Surface.Fullscreen,
    thumbHash: String? = null,
    sizeBytes: Long? = null,
    contentScale: ContentScale = ContentScale.Crop,
    showsStatusOverlays: Boolean = true,
    autoLoad: Boolean = false,
    reloadToken: Any? = null,
) {
    val tokens = MeeshyTheme.tokens
    val blur = rememberThumbHashPainter(thumbHash)
    val backdrop = modifier.background(tokens.backgroundTertiary)
    if (url.isNullOrEmpty()) {
        CompositionLocalProvider(LocalLoadingSheenPhase provides LoadingSheenLaw.phase(false, false, false)) {
            Box(backdrop.loadingSheen(LoadingSheenStyle.skeleton(tokens.textMuted.copy(alpha = 0.3f)))) {
                blur?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
            }
        }
        return
    }
    val context = LocalContext.current
    val loader = context.imageLoader
    val density = LocalDensity.current.density
    val config = LocalConfiguration.current
    val widthPx = remember(surface, density, config.screenWidthDp, config.screenHeightDp) {
        DecodeBudget.targetWidthPx(surface, DisplayMetrics(config.screenWidthDp.toFloat(), config.screenHeightDp.toFloat(), density))
    }
    val memoryKey = ImageRequests.memoryKey(url, widthPx)
    val policy = LocalBubbleMediaAutoDownload.current
    val policyAllows = policy?.fetches(sizeBytes, MediaKind.IMAGE) ?: true
    var attempt by remember(url, reloadToken) { mutableIntStateOf(0) }
    var manual by remember(url, reloadToken) { mutableStateOf(false) }
    var onDevice by remember(url, widthPx) { mutableStateOf(LocalImagePresence.inMemory(loader, memoryKey)) }
    var phase by remember(url, reloadToken) { mutableStateOf(ImagePhase.LOADING) }
    LaunchedEffect(url, widthPx) {
        if (!onDevice) onDevice = withContext(Dispatchers.IO) { LocalImagePresence.isOnDevice(loader, url, memoryKey) }
    }
    val skip = ImageLoadPolicy.shouldSkipNetworkFetch(
        autoLoad = autoLoad || manual,
        isLocalFile = ImageLoadPolicy.isLocalFile(url),
        hasLocalCacheHit = onDevice,
        policyAllowsAutoLoad = policyAllows,
    )
    val request = remember(url, widthPx, skip, attempt, reloadToken) {
        ImageRequests.build(context, url, widthPx, allowNetwork = !skip, attempt = attempt, reloadToken = reloadToken)
    }
    val chrome = ImageChrome.of(phase, showsStatusOverlays)
    val sheenPhase = LoadingSheenLaw.phase(true, phase == ImagePhase.DEFERRED, phase == ImagePhase.FAILED)
    Box(backdrop, contentAlignment = Alignment.Center) {
        if (phase != ImagePhase.LOADED) {
            CompositionLocalProvider(LocalLoadingSheenPhase provides sheenPhase) {
                Box(Modifier.fillMaxSize().loadingSheen(LoadingSheenStyle.skeleton(tokens.textMuted.copy(alpha = 0.3f)))) {
                    blur?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                }
            }
        }
        AsyncImage(
            model = request,
            contentDescription = contentDescription,
            contentScale = contentScale,
            modifier = Modifier.fillMaxSize(),
            onSuccess = { phase = ImagePhase.LOADED },
            onError = { phase = ImagePhase.afterError(networkAllowed = !skip) },
            onLoading = { if (phase != ImagePhase.LOADED) phase = ImagePhase.LOADING },
        )
        when (chrome) {
            ImageChrome.NONE -> Unit
            ImageChrome.RETRY -> StatusChip(stringResource(R.string.content_failure_retry)) { attempt += 1; phase = ImagePhase.LOADING }
            ImageChrome.TAP_TO_DOWNLOAD -> StatusChip(stringResource(R.string.image_tap_to_download)) { manual = true; phase = ImagePhase.LOADING }
        }
    }
}

@Composable
private fun StatusChip(label: String, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .widthIn(min = 48.dp)
            .heightIn(min = 48.dp)
            .semantics(mergeDescendants = true) { contentDescription = label }
            .clickable(role = Role.Button, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(label, color = MeeshyTheme.tokens.textPrimary)
    }
}
