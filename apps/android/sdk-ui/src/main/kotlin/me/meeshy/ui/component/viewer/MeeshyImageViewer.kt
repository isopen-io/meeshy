package me.meeshy.ui.component.viewer

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.compose.AsyncImagePainter
import coil.imageLoader
import coil.memory.MemoryCache
import coil.request.ImageRequest
import kotlinx.coroutines.launch
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshySpacing

/** Radius of the blurred backdrop shown behind a video/image poster that has not resolved to a sharp frame yet (#3878). */
private val BACKDROP_BLUR_RADIUS = 24.dp

/**
 * Fullscreen swipeable image viewer (charte graphique: fond noir immersif).
 * Pinch-zoom + pan + double-tap per page; horizontal swipe changes page only
 * at rest scale so panning a zoomed image never fights the pager.
 */
@Composable
public fun MeeshyImageViewer(
    imageUrls: List<String>,
    initialIndex: Int,
    onDismiss: () -> Unit,
    captions: List<String?> = emptyList(),
    authors: List<String?> = emptyList(),
    timestamps: List<String?> = emptyList(),
    /**
     * Per-page low-res thumbnail, positionally aligned with [imageUrls]
     * (#3878) — used ONLY as a blurred backdrop while the full-resolution
     * image is still loading, never as the displayed sharp image itself. A
     * page past the end of this list, or holding `null`, shows no backdrop.
     */
    thumbnailUrls: List<String?> = emptyList(),
    onImageSaved: ((Result<Unit>) -> Unit)? = null,
) {
    if (imageUrls.isEmpty()) return
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        val pagerState = rememberPagerState(
            initialPage = initialIndex.coerceIn(0, imageUrls.lastIndex),
            pageCount = { imageUrls.size },
        )
        var currentPageZoomed by rememberSaveable { mutableStateOf(false) }
        var saving by remember { mutableStateOf(false) }

        val context = LocalContext.current
        val scope = rememberCoroutineScope()
        LaunchedEffect(pagerState.currentPage, imageUrls) {
            val loader = context.imageLoader
            ImageViewerPrefetch.neighbors(
                currentIndex = pagerState.currentPage,
                total = imageUrls.size,
            ).forEach { index ->
                loader.enqueue(
                    ImageRequest.Builder(context).data(imageUrls[index]).build(),
                )
            }
        }

        Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(
                state = pagerState,
                userScrollEnabled = !currentPageZoomed,
                modifier = Modifier.fillMaxSize(),
            ) { page ->
                ZoomableImage(
                    url = imageUrls[page],
                    thumbnailUrl = thumbnailUrls.getOrNull(page),
                    onZoomChanged = { zoomed ->
                        if (page == pagerState.settledPage) currentPageZoomed = zoomed
                    },
                    onTap = onDismiss,
                )
            }

            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .statusBarsPadding()
                    .padding(MeeshySpacing.sm),
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.image_viewer_close),
                    tint = Color.White,
                )
            }

            if (onImageSaved != null && GalleryImageSaver.isSupported) {
                IconButton(
                    onClick = {
                        if (!saving) {
                            saving = true
                            scope.launch {
                                val result = GalleryImageSaver.save(context, imageUrls[pagerState.currentPage])
                                saving = false
                                onImageSaved(result)
                            }
                        }
                    },
                    enabled = !saving,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .statusBarsPadding()
                        .padding(MeeshySpacing.sm),
                ) {
                    Icon(
                        imageVector = Icons.Filled.FileDownload,
                        contentDescription = stringResource(R.string.image_viewer_save),
                        tint = Color.White,
                    )
                }
            }

            if (imageUrls.size > 1) {
                Text(
                    text = "${pagerState.currentPage + 1} / ${imageUrls.size}",
                    style = MaterialTheme.typography.labelLarge,
                    color = Color.White,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .statusBarsPadding()
                        .padding(MeeshySpacing.lg),
                )
            }

            val caption = captions.getOrNull(pagerState.currentPage)?.takeIf { it.isNotBlank() }
            val author = authors.getOrNull(pagerState.currentPage)?.takeIf { it.isNotBlank() }
            val timestamp = timestamps.getOrNull(pagerState.currentPage)?.takeIf { it.isNotBlank() }
            val hasHeader = author != null || timestamp != null
            if ((hasHeader || caption != null) && !currentPageZoomed) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(Color.Black.copy(alpha = 0.45f))
                        .navigationBarsPadding()
                        .padding(MeeshySpacing.lg),
                ) {
                    if (hasHeader) {
                        Text(
                            text = listOfNotNull(author, timestamp).joinToString("  ·  "),
                            style = MaterialTheme.typography.labelLarge,
                            color = Color.White,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    if (caption != null) {
                        Text(
                            text = caption,
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White,
                            textAlign = TextAlign.Center,
                            maxLines = 4,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ZoomableImage(
    url: String,
    thumbnailUrl: String?,
    onZoomChanged: (Boolean) -> Unit,
    onTap: () -> Unit,
) {
    // Feature 3 (#3878, miroir du patron iOS #3871 / web `resolveFullscreenImageSource`) :
    // le plein écran s'ouvre sur le plein format NET — résident (déjà décodé
    // dans le cache mémoire Coil) ⇒ affiché tel quel, sans spinner ; sinon
    // chargé, avec la vignette pour SEUL fond flou assumé pendant l'attente,
    // jamais l'image affichée nette elle-même.
    //
    // La sonde Coil est une AMORCE, pas un verdict : `memoryCache.get(Key(url))`
    // dit qu'une entrée existe sous cette clé, pas que Coil la SERVIRA pour
    // cette taille. La bulle charge le même `url` à 252.dp ; Coil y écrit un
    // bitmap sous-échantillonné que `MemoryCacheService.isCacheValueValid`
    // REFUSE ensuite pour une requête plein écran (`EXTRA_IS_SAMPLED`), et
    // relance un décodage. C'est donc l'état RÉEL de l'`AsyncImage` qui fait
    // foi : la sonde évite au cas résident de composer un fond ne serait-ce
    // qu'une image, et `onState` corrige un faux positif (Loading ⇒ le fond
    // revient) comme il retire le fond une fois le net à l'écran (Success).
    val context = LocalContext.current
    var isFullDisplayed by remember(url) {
        mutableStateOf(context.imageLoader.memoryCache?.get(MemoryCache.Key(url)) != null)
    }
    val canRenderBlurredBackdrop = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val mount = remember(url, thumbnailUrl, isFullDisplayed, canRenderBlurredBackdrop) {
        ImageViewerSource.resolve(
            fullUrl = url,
            thumbnailUrl = thumbnailUrl,
            isFullResident = isFullDisplayed,
            canRenderBlurredBackdrop = canRenderBlurredBackdrop,
        )
    }

    var scale by remember { mutableFloatStateOf(ImageViewerTransform.MIN_SCALE) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    var containerWidth by remember { mutableFloatStateOf(0f) }
    var containerHeight by remember { mutableFloatStateOf(0f) }

    fun applyScale(newScale: Float) {
        scale = ImageViewerTransform.clampScale(newScale)
        offsetX = ImageViewerTransform.clampOffset(offsetX, containerWidth, scale)
        offsetY = ImageViewerTransform.clampOffset(offsetY, containerHeight, scale)
        onZoomChanged(scale > ImageViewerTransform.MIN_SCALE)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                containerWidth = size.width.toFloat()
                containerHeight = size.height.toFloat()
                detectTapGestures(
                    onTap = { onTap() },
                    onDoubleTap = {
                        offsetX = 0f
                        offsetY = 0f
                        applyScale(ImageViewerTransform.doubleTapTarget(scale))
                    },
                )
            }
            .pointerInput(Unit) {
                detectTransformGestures { _, pan, zoom, _ ->
                    containerWidth = size.width.toFloat()
                    containerHeight = size.height.toFloat()
                    val newScale = ImageViewerTransform.clampScale(scale * zoom)
                    scale = newScale
                    offsetX = ImageViewerTransform.clampOffset(
                        offsetX + pan.x,
                        containerWidth,
                        newScale,
                    )
                    offsetY = ImageViewerTransform.clampOffset(
                        offsetY + pan.y,
                        containerHeight,
                        newScale,
                    )
                    onZoomChanged(newScale > ImageViewerTransform.MIN_SCALE)
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        // Fond flou assumé pendant le chargement du plein format — jamais
        // l'image affichée nette elle-même. Absent dès que le plein format
        // est à l'écran (rien à couvrir, aucune transition).
        mount?.backdropUrl?.let { backdropUrl ->
            AsyncImage(
                model = backdropUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .blur(BACKDROP_BLUR_RADIUS),
            )
        }
        AsyncImage(
            model = mount?.fullUrl ?: url,
            contentDescription = stringResource(R.string.bubble_image_description),
            contentScale = ContentScale.Fit,
            onState = { state ->
                when (state) {
                    is AsyncImagePainter.State.Success -> isFullDisplayed = true
                    // Coil a rejeté l'entrée mémoire (taille invalide) ou
                    // recharge : le fond doit revenir tant que rien de net
                    // n'est à l'écran. Un succès depuis le cache mémoire
                    // enchaîne Loading→Success dans la MÊME image, donc sans
                    // fond visible.
                    is AsyncImagePainter.State.Loading -> isFullDisplayed = false
                    else -> Unit
                }
            },
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = offsetX
                    translationY = offsetY
                },
        )
    }
}
