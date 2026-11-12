package me.meeshy.ui.component.viewer

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import coil.compose.AsyncImage
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.GalleryPage
import me.meeshy.sdk.model.GalleryPageKind
import me.meeshy.sdk.model.SocialMediaGallery
import me.meeshy.sdk.model.fullscreen.FullscreenChromeState
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.R
import me.meeshy.ui.component.fullscreen.FullscreenChromeButton
import me.meeshy.ui.component.fullscreen.FullscreenChromeVisibility
import me.meeshy.ui.component.fullscreen.FullscreenScrims
import me.meeshy.ui.component.fullscreen.icon
import me.meeshy.ui.component.video.ReelVideoSurface
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **LE plein écran des médias sociaux** — fil, détail, commentaire et reel l'ouvrent avec la MÊME composition
 * ([SocialMediaGallery], un site unique côté modèle). Fond noir, glisser horizontal entre les pages typées :
 * image (zoom, glisser vers le bas pour fermer), vidéo (lecteur du pool) ou scène ([scenePage], l'emplacement que le lot de
 * scène branche ; sans lui, la vignette). En pied : l'auteur de la page, sa légende servie par le Prisme (repliable,
 * « Développer »), puis la pellicule soulignée de l'[accent].
 *
 * [onCommentMedia] émet la page dont on veut parler à l'hôte (qui en tire la citation `postMediaId`) ; le bouton n'est
 * offert que si [canCommentMedia] l'accepte — un média de commentaire ne se cite pas.
 */
@Composable
public fun MeeshyMediaViewer(
    gallery: SocialMediaGallery,
    initialIndex: Int,
    accent: Color,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    timestampFor: (GalleryPage) -> String? = { it.attribution.createdAtIso },
    canCommentMedia: (GalleryPage) -> Boolean = { false },
    onCommentMedia: ((GalleryPage) -> Unit)? = null,
    scenePage: (@Composable BoxScope.(page: GalleryPage, isActive: Boolean) -> Unit)? = null,
    onImageSaved: ((Result<Unit>) -> Unit)? = null,
) {
    if (gallery.isEmpty) return
    ViewerDialog(onDismissRequest = onDismiss, properties = viewerDialogProperties(secure = false)) {
        MediaViewerContent(
            gallery = gallery,
            initialIndex = initialIndex,
            accent = accent,
            onDismiss = onDismiss,
            modifier = modifier,
            timestampFor = timestampFor,
            canCommentMedia = canCommentMedia,
            onCommentMedia = onCommentMedia,
            scenePage = scenePage,
            onImageSaved = onImageSaved,
        )
    }
}

@Composable
internal fun MediaViewerContent(
    gallery: SocialMediaGallery,
    initialIndex: Int,
    accent: Color,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    timestampFor: (GalleryPage) -> String? = { it.attribution.createdAtIso },
    canCommentMedia: (GalleryPage) -> Boolean = { false },
    onCommentMedia: ((GalleryPage) -> Unit)? = null,
    scenePage: (@Composable BoxScope.(page: GalleryPage, isActive: Boolean) -> Unit)? = null,
    onImageSaved: ((Result<Unit>) -> Unit)? = null,
) {
    val pages = gallery.pages
    val pagerState = rememberPagerState(initialPage = initialIndex.coerceIn(0, pages.lastIndex), pageCount = { pages.size })
    var zoomed by rememberSaveable { mutableStateOf(false) }
    var chrome by remember { mutableStateOf(FullscreenChromeState.Initial) }
    var dragProgress by remember { mutableFloatStateOf(0f) }
    var busy by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val shareTitle = stringResource(R.string.viewer_share_outside)

    SystemBarsForViewer(immersive = !chrome.showsChrome)
    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.settledPage }.drop(1).collect {
            haptics.light()
            chrome = chrome.turningPage()
            zoomed = false
        }
    }

    val page = pages[pagerState.currentPage.coerceIn(0, pages.lastIndex)]
    val exits = ImageViewerExits.offered(
        isExportable = page.kind == GalleryPageKind.IMAGE && page.url != null,
        canSave = onImageSaved != null && GalleryImageSaver.isSupported,
        canShare = true,
    )
    fun runExit(exit: ImageViewerExit) {
        val url = page.url ?: return
        if (busy) return
        busy = true
        scope.launch {
            when (exit) {
                ImageViewerExit.Save -> GalleryImageSaver.save(context, url).also { busy = false; onImageSaved?.invoke(it) }
                ImageViewerExit.Share -> GalleryMediaSharer.share(context, url, shareTitle).also { busy = false; if (it.isFailure) haptics.error() }
            }
        }
    }

    Box(modifier = modifier.fillMaxSize().background(Color.Black.copy(alpha = 1f - STAGE_FADE_ON_DRAG * dragProgress))) {
        HorizontalPager(
            state = pagerState,
            userScrollEnabled = !zoomed,
            key = { pages[it].id },
            modifier = Modifier.fillMaxSize(),
        ) { index ->
            val item = pages[index]
            val active = index == pagerState.currentPage
            when (item.kind) {
                GalleryPageKind.IMAGE -> ZoomableImagePage(
                    url = item.url.orEmpty(),
                    thumbnailUrl = item.thumbnailUrl,
                    altText = item.alt,
                    isActive = active,
                    onZoomChanged = { z -> if (index == pagerState.settledPage) zoomed = z },
                    onTap = { chrome = chrome.tappingMedia() },
                    onDragProgress = { dragProgress = it },
                    onDismiss = onDismiss,
                )
                GalleryPageKind.VIDEO -> Box(Modifier.fillMaxSize()) {
                    if (active && item.url != null) {
                        ReelVideoSurface(mediaUrl = item.url.orEmpty(), isActive = true, muted = false, fit = true, modifier = Modifier.fillMaxSize())
                    } else {
                        PosterPage(item)
                    }
                }
                GalleryPageKind.SCENE -> Box(Modifier.fillMaxSize()) {
                    if (scenePage != null) scenePage(item, active) else PosterPage(item)
                }
            }
        }

        val chromeVisible = chrome.showsChrome && dragProgress == 0f
        FullscreenScrims(topInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding(), chromeVisible = chromeVisible)
        FullscreenChromeVisibility(visible = chromeVisible, onReveal = { chrome = chrome.revealing() }, modifier = Modifier.fillMaxSize()) {
            ImageViewerTopBar(
                onClose = onDismiss,
                exits = exits,
                isBusy = busy,
                onExit = ::runExit,
                modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding(),
            )
            Column(
                modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().graphicsLayer { alpha = if (zoomed) 0f else 1f },
            ) {
                if (onCommentMedia != null && canCommentMedia(page)) {
                    FullscreenChromeButton(
                        icon = FullscreenChromeSymbol.Reply.icon,
                        label = stringResource(R.string.fullscreen_reply),
                        onClick = { onCommentMedia(page) },
                        modifier = Modifier.align(Alignment.End).padding(horizontal = MeeshySpacing.lg),
                    )
                }
                ImageViewerMetadataBlock(
                    author = page.attribution.name?.takeIf { it.isNotBlank() },
                    timestamp = timestampFor(page)?.takeIf { it.isNotBlank() },
                    caption = page.caption,
                    captionKey = page.id,
                    identity = page.attribution.name?.let { ImageViewerAuthor(userId = page.attribution.userId, avatarUrl = page.attribution.avatarUrl) },
                )
                MediaFilmstrip(
                    pages = pages,
                    current = pagerState.currentPage,
                    accent = accent,
                    onSelect = { target -> scope.launch { pagerState.animateScrollToPage(target) } },
                )
            }
        }
    }
}

@Composable
private fun PosterPage(page: GalleryPage) {
    AsyncImage(
        model = page.thumbnailUrl ?: page.url.takeIf { page.kind == GalleryPageKind.IMAGE },
        contentDescription = page.alt,
        contentScale = ContentScale.Fit,
        modifier = Modifier.fillMaxSize(),
    )
}

private const val STAGE_FADE_ON_DRAG = 0.6f
