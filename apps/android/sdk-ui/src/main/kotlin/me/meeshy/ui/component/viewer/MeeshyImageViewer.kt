package me.meeshy.ui.component.viewer

import android.os.Build
import android.view.ViewGroup
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import coil.imageLoader
import coil.request.ImageRequest
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.fullscreen.FullscreenChromeState
import me.meeshy.ui.R
import me.meeshy.ui.component.fullscreen.FullscreenChromeVisibility
import me.meeshy.ui.component.fullscreen.FullscreenScrims
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * Fullscreen swipeable image viewer — port of iOS `ConversationMediaGalleryView` for images.
 *
 * - The black stage covers the whole screen, system bars included; in immersion (a tap on the
 *   media, [FullscreenChromeState.tappingMedia]) the chrome and the system bars leave.
 * - The chrome is the kit's: the close disc, the ⋯ menu of exits (save, share outside Meeshy —
 *   absent for a protected page, [ImageViewerExits]), the readability scrims, then at the bottom
 *   the author line, the folding caption and the filmstrip that shows the position.
 * - Each page zooms up to ×5 and closes on a swipe down at rest ([ZoomableImagePage]); a page
 *   change gives a light haptic.
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
     * Per-page low-res thumbnail, positionally aligned with [imageUrls] (#3878) — the blurred
     * backdrop while the full image loads, and the filmstrip tile. Never the displayed sharp image.
     */
    thumbnailUrls: List<String?> = emptyList(),
    /** Per-page author-authored accessibility description (#6739, #6813), aligned with [imageUrls]. */
    altTexts: List<String?> = emptyList(),
    /**
     * Per page, whether the piece may leave Meeshy (save, share). A page past the end of this list
     * may leave; a `false` page (view-once, blurred) gets no ⋯ menu at all.
     */
    exportable: List<Boolean> = emptyList(),
    onImageSaved: ((Result<Unit>) -> Unit)? = null,
) {
    if (imageUrls.isEmpty()) return
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        val pagerState = rememberPagerState(
            initialPage = initialIndex.coerceIn(0, imageUrls.lastIndex),
            pageCount = { imageUrls.size },
        )
        var currentPageZoomed by rememberSaveable { mutableStateOf(false) }
        var chrome by remember { mutableStateOf(FullscreenChromeState.Initial) }
        var dragProgress by remember { mutableFloatStateOf(0f) }
        var busy by remember { mutableStateOf(false) }
        val context = LocalContext.current
        val scope = rememberCoroutineScope()
        val haptics = rememberMeeshyHaptics()
        val shareTitle = stringResource(R.string.viewer_share_outside)

        SystemBarsForViewer(immersive = !chrome.showsChrome)

        LaunchedEffect(pagerState.currentPage, imageUrls) {
            val loader = context.imageLoader
            ImageViewerPrefetch.neighbors(currentIndex = pagerState.currentPage, total = imageUrls.size)
                .forEach { index -> loader.enqueue(ImageRequest.Builder(context).data(imageUrls[index]).build()) }
        }
        LaunchedEffect(pagerState) {
            snapshotFlow { pagerState.settledPage }.drop(1).collect {
                haptics.light()
                chrome = chrome.turningPage()
            }
        }

        val page = pagerState.currentPage
        val exits = ImageViewerExits.offered(
            isExportable = ImageViewerExits.isExportable(exportable, page),
            canSave = onImageSaved != null && GalleryImageSaver.isSupported,
            canShare = true,
        )
        fun runExit(exit: ImageViewerExit) {
            if (busy) return
            busy = true
            val url = imageUrls[pagerState.currentPage]
            scope.launch {
                when (exit) {
                    ImageViewerExit.Save -> {
                        val result = GalleryImageSaver.save(context, url)
                        busy = false
                        onImageSaved?.invoke(result)
                    }
                    ImageViewerExit.Share -> {
                        val result = GalleryMediaSharer.share(context, url, shareTitle)
                        busy = false
                        if (result.isFailure) haptics.error()
                    }
                }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 1f - STAGE_FADE_ON_DRAG * dragProgress)),
        ) {
            HorizontalPager(
                state = pagerState,
                userScrollEnabled = !currentPageZoomed,
                modifier = Modifier.fillMaxSize(),
            ) { index ->
                ZoomableImagePage(
                    url = imageUrls[index],
                    thumbnailUrl = thumbnailUrls.getOrNull(index),
                    altText = altTexts.getOrNull(index)?.takeIf { it.isNotBlank() },
                    isActive = index == pagerState.currentPage,
                    onZoomChanged = { zoomed -> if (index == pagerState.settledPage) currentPageZoomed = zoomed },
                    onTap = { chrome = chrome.tappingMedia() },
                    onDragProgress = { dragProgress = it },
                    onDismiss = onDismiss,
                )
            }

            val chromeVisible = chrome.showsChrome && dragProgress == 0f
            FullscreenScrims(
                topInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding(),
                chromeVisible = chromeVisible,
            )
            FullscreenChromeVisibility(
                visible = chromeVisible,
                onReveal = { chrome = chrome.revealing() },
                modifier = Modifier.fillMaxSize(),
            ) {
                ImageViewerTopBar(
                    onClose = onDismiss,
                    exits = exits,
                    isBusy = busy,
                    onExit = ::runExit,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .statusBarsPadding(),
                )
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .graphicsLayer { alpha = if (currentPageZoomed) 0f else 1f },
                ) {
                    ImageViewerMetadataBlock(
                        author = authors.getOrNull(page)?.takeIf { it.isNotBlank() },
                        timestamp = timestamps.getOrNull(page)?.takeIf { it.isNotBlank() },
                        caption = captions.getOrNull(page)?.takeIf { it.isNotBlank() },
                        captionKey = page,
                    )
                    ImageViewerFilmstrip(
                        thumbnails = imageUrls.indices.map { thumbnailUrls.getOrNull(it) ?: imageUrls[it] },
                        current = page,
                        onSelect = { target -> scope.launch { pagerState.animateScrollToPage(target) } },
                    )
                }
            }
        }
    }
}

/** How much of the black stage fades while a swipe down follows the finger. */
private const val STAGE_FADE_ON_DRAG = 0.6f

/**
 * The viewer's own window draws under the system bars (light glyphs on the black stage) and hides
 * them in immersion — iOS hands the whole height to the media.
 */
@Composable
private fun SystemBarsForViewer(immersive: Boolean) {
    val view = LocalView.current
    val window = (view.parent as? DialogWindowProvider)?.window ?: return
    DisposableEffect(window) {
        window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        window.addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN)
        window.setDimAmount(0f)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        onDispose { }
    }
    LaunchedEffect(window, immersive) {
        val controller = WindowCompat.getInsetsController(window, view)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (immersive) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }
}
