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
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import android.content.Intent
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.reels.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.video.ReelVideoSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** How many reels from the end of the thread trigger the next cursor page. */
private const val LOAD_MORE_THRESHOLD = 3

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
    onOpenPost: (String) -> Unit = {},
    viewModel: ReelsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Muet par defaut (autoplay poli) ; le toggle vaut pour toute la session Reels.
    var muted by rememberSaveable { mutableStateOf(true) }
    val shareContext = LocalContext.current

    LaunchedEffect(seed) { viewModel.load(seed) }

    // Leaving the reels thread closes the last dwell session (records its view if
    // it qualified) — the pager's per-settle end never fires for the final reel.
    DisposableEffect(Unit) {
        onDispose { viewModel.setCurrentReel(null) }
    }

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
                // Le reel visible possede la post room : c'est l'abonnement qui rend
                // `post:liked`/`post:unliked` livrables pour un reel dont on ne suit pas
                // l'auteur. Keye sur les ids (egalite structurelle) et non sur `state.reels`,
                // qui est une nouvelle liste a chaque like optimiste.
                val reelIds = state.reels.map { it.id }
                LaunchedEffect(pagerState, reelIds) {
                    snapshotFlow { pagerState.currentPage }
                        .distinctUntilChanged()
                        .collect { page ->
                            viewModel.setCurrentReel(reelIds.getOrNull(page))
                            // Infinite scroll: fetch the next cursor page a few reels before
                            // the pager runs out, so the fetch lands before the user does.
                            if (page >= reelIds.size - LOAD_MORE_THRESHOLD) viewModel.loadMore()
                        }
                }
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
                            muted = muted,
                        )
                        ReelOverlay(
                            reel = reel,
                            onLike = { viewModel.toggleLike(reel.id) },
                            onComments = { onOpenPost(reel.id) },
                            onRepost = { viewModel.repost(reel.id) },
                            onBookmark = { viewModel.toggleBookmark(reel.id) },
                            onShare = {
                                viewModel.recordShare(reel.id)
                                val send = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, "https://meeshy.me/post/${'$'}{reel.id}")
                                }
                                shareContext.startActivity(Intent.createChooser(send, null))
                            },
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
            Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.reels_close), tint = MeeshyPalette.White)
        }

        // Toggle son : les reels DEMARRENT muets, ce bouton est le seul chemin
        // pour entendre la piste — il doit donc etre visible en permanence.
        IconButton(
            onClick = { muted = !muted },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(MeeshySpacing.sm),
        ) {
            Icon(
                imageVector = if (muted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp,
                contentDescription = stringResource(if (muted) R.string.reels_unmute else R.string.reels_mute),
                tint = MeeshyPalette.White,
            )
        }
    }
}

@Composable
private fun ReelOverlay(
    reel: ReelPresentation,
    onLike: () -> Unit,
    onComments: () -> Unit,
    onRepost: () -> Unit,
    onBookmark: () -> Unit,
    onShare: () -> Unit,
    modifier: Modifier = Modifier,
) {
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
                contentDescription = stringResource(R.string.reels_like),
                onClick = onLike,
            )
            ReelAction(
                icon = Icons.AutoMirrored.Filled.Comment,
                tint = MeeshyPalette.White,
                count = reel.commentCount,
                contentDescription = stringResource(R.string.reels_comments),
                onClick = onComments,
            )
            ReelAction(
                icon = Icons.Filled.Repeat,
                tint = MeeshyPalette.White,
                count = reel.repostCount,
                contentDescription = stringResource(R.string.reels_repost),
                onClick = onRepost,
            )
            ReelAction(
                icon = if (reel.isBookmarked) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
                tint = if (reel.isBookmarked) MeeshyPalette.Warning else MeeshyPalette.White,
                count = reel.bookmarkCount,
                contentDescription = stringResource(
                    if (reel.isBookmarked) R.string.reels_unbookmark else R.string.reels_bookmark,
                ),
                onClick = onBookmark,
            )
            ReelAction(
                icon = Icons.Filled.Share,
                tint = MeeshyPalette.White,
                count = null,
                contentDescription = stringResource(R.string.reels_share),
                onClick = onShare,
            )
        }
    }
}

@Composable
private fun ReelAction(
    icon: ImageVector,
    tint: Color,
    count: Int?,
    contentDescription: String? = null,
    onClick: () -> Unit = {},
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(onClick = onClick) {
            Icon(icon, contentDescription = contentDescription, tint = tint, modifier = Modifier.size(30.dp))
        }
        if (count != null) {
            Text(
                text = count.toString(),
                color = MeeshyPalette.White,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}
