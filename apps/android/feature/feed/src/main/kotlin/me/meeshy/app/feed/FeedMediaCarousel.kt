package me.meeshy.app.feed

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **Le carrousel : une image par page** (#6514), l'agencement par défaut de
 * toute publication qui n'en déclare aucun.
 *
 * La boîte prend le rapport de l'image la plus HAUTE, pas celui de la page
 * courante : une carte qui changerait de hauteur à chaque glissement ferait
 * sauter tout le fil sous le doigt.
 *
 * Les flèches ne sont pas une commodité. Le glissement est le seul autre chemin
 * vers les images 2 à N, et il ne suffit ni à TalkBack ni à une main qui tient
 * l'appareil d'un pouce. Elles ne sont montées que là où elles ont un effet :
 * pas de « précédente » sur la première page, pas de « suivante » sur la
 * dernière.
 */
@Composable
internal fun FeedMediaCarousel(images: List<FeedPostImage>, onImageTap: ((Int) -> Unit)?) {
    val pagerState = rememberPagerState(pageCount = { images.size })
    val scope = rememberCoroutineScope()
    val tallest = remember(images) { images.minOf { feedImageAspectRatio(it) } }
    val openLabel = stringResource(R.string.feed_open_media)
    val current = pagerState.currentPage
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(tallest)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(FEED_MEDIA_GROUND),
        ) {
            HorizontalPager(
                state = pagerState,
                key = { page -> images[page].id },
                modifier = Modifier.fillMaxSize(),
            ) { page ->
                val image = images[page]
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .opensMedia(index = page, label = openLabel, onImageTap = onImageTap),
                ) {
                    FeedMediaImage(image = image, preferThumbnail = false)
                    image.captionFor(MosaicLayoutMode.CAROUSEL, page, images.size, tileWidth = 1f)?.let { caption ->
                        FeedMediaCaption(text = caption, modifier = Modifier.align(Alignment.BottomStart))
                    }
                }
            }
            PageCounter(
                position = current + 1,
                count = images.size,
                modifier = Modifier.align(Alignment.TopEnd),
            )
            if (current > 0) {
                PageArrow(
                    icon = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                    label = stringResource(R.string.feed_media_previous),
                    modifier = Modifier.align(Alignment.CenterStart),
                    onClick = { scope.launch { pagerState.animateScrollToPage(current - 1) } },
                )
            }
            if (current < images.size - 1) {
                PageArrow(
                    icon = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    label = stringResource(R.string.feed_media_next),
                    modifier = Modifier.align(Alignment.CenterEnd),
                    onClick = { scope.launch { pagerState.animateScrollToPage(current + 1) } },
                )
            }
        }
        PageDots(count = images.size, current = current)
    }
}

@Composable
private fun PageCounter(position: Int, count: Int, modifier: Modifier = Modifier) {
    Text(
        text = stringResource(R.string.feed_media_page_counter, position, count),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        color = MeeshyPalette.White,
        modifier = modifier
            .padding(10.dp)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(Color.Black.copy(alpha = 0.5f))
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

@Composable
private fun PageArrow(icon: ImageVector, label: String, modifier: Modifier, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = modifier.padding(horizontal = 4.dp)) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.45f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = icon, contentDescription = label, tint = MeeshyPalette.White)
        }
    }
}

/** Sous les pages, sur le fond de la carte : posées dedans, elles disputeraient le bas à la légende. */
@Composable
private fun PageDots(count: Int, current: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(count) { position ->
            val active = position == current
            val width by animateDpAsState(targetValue = if (active) 18.dp else 6.dp, label = "feed-carousel-dot")
            Box(
                modifier = Modifier
                    .width(width)
                    .height(6.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(MeeshyPalette.Indigo500.copy(alpha = if (active) 1f else 0.28f)),
            )
        }
    }
}
