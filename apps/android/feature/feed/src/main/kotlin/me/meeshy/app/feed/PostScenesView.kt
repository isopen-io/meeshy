package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.ui.unit.DpSize
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
 * Ce qu'on y entend dépend de l'HÔTE ([host], iOS `PostSceneMosaicHost`) : le fil est muet par construction, la fiche du post
 * fait entendre ses scènes tant que [muted] ne les coupe pas (#13893). Chaque scène porte sa légende là où la place le permet.
 */
@Composable
internal fun PostScenesView(
    scenes: FeedPostScenes,
    live: Boolean,
    modifier: Modifier = Modifier,
    host: PostScenesHost = PostScenesHost.FEED,
    muted: Boolean = false,
) {
    val sound = host.locksMute || muted
    var readerAt by rememberSaveable { mutableStateOf<Int?>(null) }
    val reader = LocalPostSceneReaderRenderer.current
    val open: (Int) -> Unit = { index -> if (reader != null) readerAt = index }
    Box(modifier.fillMaxWidth()) {
        when (val arrangement = MosaicLayout.arrange(scenes.items.size, scenes.layout)) {
            MosaicArrangement.Empty -> Unit
            MosaicArrangement.Single, is MosaicArrangement.Paged -> PostScenePager(scenes, live, sound, open)
            is MosaicArrangement.Tiled -> PostSceneMosaicTiles(scenes, arrangement, sound, open)
        }
    }
    val start = readerAt
    if (start != null && reader != null) {
        PostSceneReader(scenes = scenes, start = start, renderer = reader, onDismiss = { readerAt = null })
    }
}

@Composable
private fun PostScenePager(scenes: FeedPostScenes, live: Boolean, muted: Boolean, onOpen: (Int) -> Unit) {
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
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .semantics { contentDescription = label }
                        .clickable(onClickLabel = label) { onOpen(page) },
                ) {
                    SceneSurface(item = scenes.items[page], accentHex = scenes.accentHex, live = live && page == current, muted = muted, modifier = Modifier.fillMaxSize())
                    scenes.captionAt(page, tileWidth = 1f)?.let { caption ->
                        FeedMediaCaption(text = caption, maxLines = CAPTION_LINES, modifier = Modifier.align(Alignment.BottomStart))
                    }
                }
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
private fun PostSceneMosaicTiles(scenes: FeedPostScenes, arrangement: MosaicArrangement.Tiled, muted: Boolean, onOpen: (Int) -> Unit) {
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
                        SceneTile(scenes, tile = tile, box = DpSize(boxWidth, boxHeight), muted = muted, onOpen = onOpen)
                    }
                }
            }
        }
    }
}

@Composable
private fun SceneTile(scenes: FeedPostScenes, tile: MosaicTile, box: DpSize, muted: Boolean, onOpen: (Int) -> Unit) {
    val item = scenes.items[tile.index]
    val boxWidth = box.width
    val boxHeight = box.height
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
        SceneSurface(item = item, accentHex = scenes.accentHex, live = false, muted = muted, modifier = Modifier.fillMaxSize())
        scenes.captionAt(tile.index, tile.width, tile.overflow)?.let { caption ->
            FeedMediaCaption(text = caption, maxLines = CAPTION_LINES, modifier = Modifier.align(Alignment.BottomStart))
        }
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

/** La scène peinte par le moteur que l'application fournit, remplissant son cadre ; un aplat hors de l'application. */
@Composable
private fun SceneSurface(item: StoryItem, accentHex: String?, live: Boolean, muted: Boolean, modifier: Modifier) {
    val renderer = LocalReelSceneRenderer.current
    Box(modifier) {
        renderer?.invoke(item, accentHex, live, muted, Modifier.fillMaxSize())
    }
}

/**
 * Où les scènes d'un post sont montées — donc ce qu'on y entend (iOS `PostSceneMosaicHost`, #5593) : le fil, muet par
 * construction (plusieurs cartes à l'écran, aucune n'a de son à piloter) ; la fiche du post, qui laisse le lecteur couper.
 */
internal enum class PostScenesHost {
    FEED,
    DETAIL,
    ;

    val locksMute: Boolean get() = this == FEED
}

/**
 * La légende que la scène [index] porte sur sa tuile (iOS `PostSceneMosaic.bandeauDeLegende`) : la sienne, là où la place le
 * permet ([MosaicLayout.tileCarriesCaption]), bornée en mots ; jamais sur le « +N », qui porte déjà son voile et son compteur.
 */
private fun FeedPostScenes.captionAt(index: Int, tileWidth: Float, overflow: Int = 0): String? {
    if (overflow > 0) return null
    val text = captions.getOrNull(index) ?: return null
    if (!MosaicLayout.tileCarriesCaption(layout, index, items.size)) return null
    return MosaicLayout.truncateWords(text, MosaicLayout.captionWordLimit(layout, items.size, tileWidth))
}

private const val CAPTION_LINES = 2

/**
 * Le plein écran des scènes, ouvert sur celle qu'on a touchée : une page par scène, seule la page montrée joue, son compris. Son
 * menu « … » exporte le post entier en vidéo (#13896).
 */
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
            Row(
                modifier = Modifier.align(Alignment.TopEnd).padding(MeeshySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                LocalPostSceneExportRenderer.current?.invoke(scenes.items, scenes.accentHex, Modifier)
                IconButton(onClick = onDismiss) {
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
}

/** La carte d'une scène dans le fil : son 9:16, borné à 1,4 fois la largeur (iOS `SceneCardHeightCap`). */
private const val SCENE_CARD_ASPECT = 1f / 1.4f
