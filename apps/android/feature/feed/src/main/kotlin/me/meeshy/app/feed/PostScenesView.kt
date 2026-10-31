package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.component.media.MosaicArrangement
import me.meeshy.ui.component.media.MosaicLayout
import me.meeshy.ui.component.media.MosaicTile
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **Un post composé sur la scène se lit scène par scène** (#13863 R7, iOS `PostSceneCard` / `PostSceneMosaic`) : chaque scène
 * passe par le moteur unique de la scène (le lecteur que l'application fournit), à la place des médias du post, dans la
 * disposition que l'auteur a choisie. Le carrousel, défaut, montre une scène par page ; les quatre mosaïques posent des scènes
 * ARRÊTÉES côte à côte, « +N » sur la dernière. Toucher une scène l'ouvre en plein écran, sur ELLE, avec son son.
 *
 * Seule la page COURANTE du carrousel joue, et seulement quand l'hôte l'autorise ([live] : la carte élue du fil, ou le détail).
 */
@Composable
internal fun PostScenesView(scenes: FeedPostScenes, live: Boolean, modifier: Modifier = Modifier) {
    var readerAt by rememberSaveable { mutableStateOf<Int?>(null) }
    val reader = LocalPostSceneReaderRenderer.current
    val open: (Int) -> Unit = { index -> if (reader != null) readerAt = index }
    Box(modifier.fillMaxWidth()) {
        when (val arrangement = MosaicLayout.arrange(scenes.items.size, scenes.layout)) {
            MosaicArrangement.Empty -> Unit
            MosaicArrangement.Single, is MosaicArrangement.Paged -> PostScenePager(scenes, live, open)
            is MosaicArrangement.Tiled -> PostSceneMosaicTiles(scenes, arrangement, open)
        }
    }
    val start = readerAt
    if (start != null && reader != null) {
        PostSceneReader(scenes = scenes, start = start, renderer = reader, onDismiss = { readerAt = null })
    }
}

@Composable
private fun PostScenePager(scenes: FeedPostScenes, live: Boolean, onOpen: (Int) -> Unit) {
    val count = scenes.items.size
    val pagerState = rememberPagerState(pageCount = { count })
    val scope = rememberCoroutineScope()
    val current = pagerState.currentPage
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(SCENE_CARD_ASPECT)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(FEED_MEDIA_GROUND),
        ) {
            HorizontalPager(state = pagerState, key = { page -> scenes.items[page].id }, modifier = Modifier.fillMaxSize()) { page ->
                val label = stringResource(R.string.feed_scene_tile, page + 1)
                SceneSurface(
                    item = scenes.items[page],
                    accentHex = scenes.accentHex,
                    live = live && page == current,
                    modifier = Modifier
                        .fillMaxSize()
                        .semantics { contentDescription = label }
                        .clickable(onClickLabel = label) { onOpen(page) },
                )
            }
            if (count > 1) {
                PageCounter(position = current + 1, count = count, modifier = Modifier.align(Alignment.TopEnd))
            }
            if (current > 0) {
                PageArrow(
                    icon = MeeshyIcons.ChevronBackward,
                    label = stringResource(R.string.feed_scene_previous),
                    modifier = Modifier.align(Alignment.CenterStart),
                    onClick = { scope.launch { pagerState.animateScrollToPage(current - 1) } },
                )
            }
            if (current < count - 1) {
                PageArrow(
                    icon = MeeshyIcons.ChevronForward,
                    label = stringResource(R.string.feed_scene_next),
                    modifier = Modifier.align(Alignment.CenterEnd),
                    onClick = { scope.launch { pagerState.animateScrollToPage(current + 1) } },
                )
            }
        }
        if (count > 1) PageDots(count = count, current = current)
    }
}

@Composable
private fun PostSceneMosaicTiles(scenes: FeedPostScenes, arrangement: MosaicArrangement.Tiled, onOpen: (Int) -> Unit) {
    val scroll = rememberScrollState()
    BoxWithConstraints(modifier = Modifier.fillMaxWidth().aspectRatio(1f / arrangement.aspectRatio)) {
        val boxWidth = maxWidth
        val boxHeight = maxHeight
        Box(
            modifier = Modifier
                .fillMaxSize()
                .then(if (arrangement.span > 1f) Modifier.horizontalScroll(scroll) else Modifier),
        ) {
            Box(modifier = Modifier.width(boxWidth * arrangement.span).height(boxHeight)) {
                arrangement.tiles.forEach { tile ->
                    val item = scenes.items.getOrNull(tile.index) ?: return@forEach
                    key(item.id) {
                        SceneTile(item = item, accentHex = scenes.accentHex, tile = tile, boxWidth = boxWidth, boxHeight = boxHeight, onOpen = onOpen)
                    }
                }
            }
        }
    }
}

@Composable
private fun SceneTile(item: StoryItem, accentHex: String?, tile: MosaicTile, boxWidth: Dp, boxHeight: Dp, onOpen: (Int) -> Unit) {
    val label = if (tile.overflow > 0) {
        stringResource(R.string.feed_scene_more, tile.index + 1, tile.overflow)
    } else {
        stringResource(R.string.feed_scene_tile, tile.index + 1)
    }
    Box(
        modifier = Modifier
            .offset(x = boxWidth * tile.x, y = boxHeight * tile.y)
            .size(width = boxWidth * tile.width, height = boxHeight * tile.height)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(FEED_MEDIA_GROUND)
            .semantics { contentDescription = label }
            .clickable(onClickLabel = label) { onOpen(tile.index) },
    ) {
        SceneSurface(item = item, accentHex = accentHex, live = false, modifier = Modifier.fillMaxSize())
        if (tile.overflow > 0) {
            Box(
                modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.feed_hidden_images, tile.overflow),
                    color = MeeshyPalette.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 22.sp,
                )
            }
        }
    }
}

/** La scène peinte par le moteur que l'application fournit, muette, remplissant son cadre ; un aplat hors de l'application. */
@Composable
private fun SceneSurface(item: StoryItem, accentHex: String?, live: Boolean, modifier: Modifier) {
    val renderer = LocalReelSceneRenderer.current
    Box(modifier) {
        renderer?.invoke(item, accentHex, live, Modifier.fillMaxSize())
    }
}

/** Le plein écran des scènes, ouvert sur celle qu'on a touchée : une page par scène, seule la page montrée joue, son compris. */
@Composable
private fun PostSceneReader(scenes: FeedPostScenes, start: Int, renderer: PostSceneReaderRenderer, onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        val pagerState = rememberPagerState(initialPage = start.coerceIn(0, scenes.items.lastIndex), pageCount = { scenes.items.size })
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            HorizontalPager(state = pagerState, key = { page -> scenes.items[page].id }, modifier = Modifier.fillMaxSize()) { page ->
                renderer(scenes.items[page], scenes.accentHex, page == pagerState.currentPage, Modifier.fillMaxSize())
            }
            if (scenes.items.size > 1) {
                PageCounter(position = pagerState.currentPage + 1, count = scenes.items.size, modifier = Modifier.align(Alignment.TopStart))
            }
            IconButton(onClick = onDismiss, modifier = Modifier.align(Alignment.TopEnd).padding(MeeshySpacing.sm)) {
                Box(
                    modifier = Modifier.size(36.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(imageVector = MeeshyIcons.Close, contentDescription = stringResource(R.string.feed_translation_close), tint = MeeshyPalette.White)
                }
            }
        }
    }
}

/** La carte d'une scène dans le fil : son 9:16, borné à 1,4 fois la largeur (iOS `SceneCardHeightCap`). */
private const val SCENE_CARD_ASPECT = 1f / 1.4f
