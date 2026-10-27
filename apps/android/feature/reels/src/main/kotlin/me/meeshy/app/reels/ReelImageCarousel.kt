package me.meeshy.app.reels

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Les photos d'un réel, une par page horizontale (iOS `ReelsPlayerView+Carousel`) : chacune tient
 * en entier (`Fit`) sur son propre flou, jamais rognée ni sur fond noir. Le glissement horizontal
 * appartient au carrousel, le vertical au fil de réels — Compose les départage par l'axe.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ReelImageCarousel(
    imageUrls: List<String>,
    modifier: Modifier = Modifier,
    state: PagerState = rememberPagerState(pageCount = { imageUrls.size }),
) {
    val haptics = rememberMeeshyHaptics()
    LaunchedEffect(state) {
        snapshotFlow { state.settledPage }.collect { if (it != 0) haptics.selection() }
    }
    Box(modifier.fillMaxSize()) {
        HorizontalPager(state = state, modifier = Modifier.fillMaxSize(), key = { imageUrls[it] }) { index ->
            Box(Modifier.fillMaxSize()) {
                ReelBlurredFill(imageUrls[index])
                AsyncImage(
                    model = imageUrls[index],
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

/** Le fond d'ambiance d'un média qui ne remplit pas l'écran : sa propre image, rognée et floutée. */
@Composable
internal fun ReelBlurredFill(url: String, modifier: Modifier = Modifier) {
    AsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier
            .fillMaxSize()
            .blur(28.dp)
            .alpha(0.85f),
    )
}

/** « 2/5 » : où l'on en est dans les photos du réel. */
@Composable
internal fun ReelImageCounter(
    current: Int,
    total: Int,
    modifier: Modifier = Modifier,
) {
    if (total <= 1) return
    Text(
        text = "${current + 1}/$total",
        color = Color.White,
        fontSize = 12.sp,
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.45f))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
    )
}
