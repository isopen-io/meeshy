package me.meeshy.app.reels

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Comment
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.video.ReelVideoSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Full-screen vertical reel thread (iOS `ReelsPlayerView` parity): one video per page,
 * the visible page plays while the others stay paused. [seed] anchors the thread on a
 * reel touched in the Feed.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ReelsScreen(
    seed: String? = null,
    onClose: () -> Unit = {},
    viewModel: ReelsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(seed) { viewModel.load(seed) }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        when {
            state.reels.isEmpty() && state.isLoading ->
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = MeeshyPalette.White,
                )

            state.reels.isEmpty() ->
                Text(
                    text = state.errorMessage ?: "",
                    color = MeeshyPalette.White.copy(alpha = 0.7f),
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(MeeshySpacing.xl),
                )

            else -> {
                val pagerState = rememberPagerState(pageCount = { state.reels.size })
                VerticalPager(
                    state = pagerState,
                    modifier = Modifier.fillMaxSize(),
                ) { page ->
                    val reel = state.reels[page]
                    Box(Modifier.fillMaxSize()) {
                        ReelVideoSurface(
                            mediaUrl = reel.videoUrl,
                            isActive = page == pagerState.currentPage,
                            modifier = Modifier.fillMaxSize(),
                        )
                        ReelOverlay(
                            reel = reel,
                            modifier = Modifier
                                .fillMaxSize()
                                .navigationBarsPadding(),
                        )
                    }
                }
            }
        }

        IconButton(
            onClick = onClose,
            modifier = Modifier
                .align(Alignment.TopStart)
                .statusBarsPadding()
                .padding(MeeshySpacing.sm),
        ) {
            Icon(Icons.Filled.Close, contentDescription = "Close", tint = MeeshyPalette.White)
        }
    }
}

@Composable
private fun ReelOverlay(reel: ReelPresentation, modifier: Modifier = Modifier) {
    Box(modifier.padding(MeeshySpacing.lg)) {
        // Author + caption, bottom-left.
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth(0.72f),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MeeshyAvatar(name = reel.authorName ?: "?", size = 36.dp)
                Spacer(Modifier.width(MeeshySpacing.sm))
                Text(
                    text = reel.authorName ?: "",
                    color = MeeshyPalette.White,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            reel.caption?.let {
                Spacer(Modifier.height(MeeshySpacing.sm))
                Text(
                    text = it,
                    color = MeeshyPalette.White.copy(alpha = 0.92f),
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        // Actions column, bottom-right.
        Column(
            modifier = Modifier.align(Alignment.BottomEnd),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            ReelAction(
                icon = if (reel.isLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                tint = if (reel.isLiked) MeeshyPalette.Error else MeeshyPalette.White,
                count = reel.likeCount,
            )
            ReelAction(Icons.AutoMirrored.Filled.Comment, MeeshyPalette.White, reel.commentCount)
            ReelAction(Icons.Filled.Repeat, MeeshyPalette.White, reel.repostCount)
            ReelAction(Icons.Filled.Share, MeeshyPalette.White, null)
        }
    }
}

@Composable
private fun ReelAction(icon: ImageVector, tint: Color, count: Int?) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(30.dp))
        if (count != null) {
            Text(
                text = count.toString(),
                color = MeeshyPalette.White,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}
