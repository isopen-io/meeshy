package me.meeshy.app.reels

import android.content.Intent
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import me.meeshy.sdk.model.PostShareLink
import me.meeshy.sdk.model.ReelSwitchWork
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.fullscreen.FullscreenScrims
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.ui.unit.LayoutDirection

/** How many reels from the end of the thread trigger the next cursor page. */
private const val LOAD_MORE_THRESHOLD = 3

/**
 * Full-screen vertical reel thread (iOS `ReelsPlayerView` parity): one reel per page, the elected
 * page plays while the others stay paused. [seed] anchors the thread on a reel touched in the Feed.
 *
 * Performance contract : le pager ne lit jamais la progression de lecture ; chaque page lit sa
 * propre élection par `derivedStateOf`, si bien qu'un passage ne recompose que les deux pages
 * touchées. Seuls la page affichée et la suivante créent un lecteur (la suivante en pause, pour
 * que son premier plan soit prêt) ; une page qui sort de la fenêtre libère le sien.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ReelsScreen(
    seed: String? = null,
    onClose: () -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
    viewModel: ReelsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val quickEmojis by viewModel.quickEmojis.collectAsStateWithLifecycle()
    // Muet par defaut (autoplay poli) ; le toggle vaut pour toute la session Reels.
    var muted by rememberSaveable { mutableStateOf(true) }
    // Mode immersif : un appui long efface tout le chrome, un toucher le rend.
    var chromeHidden by rememberSaveable { mutableStateOf(false) }
    val shareContext = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    // Commentaires en feuille superposee (issue #4815) : le lecteur ne quitte jamais
    // l'ecran, la video du reel visible continue de jouer sous la feuille.
    var commentsReelId by rememberSaveable { mutableStateOf<String?>(null) }
    val pagerState = rememberPagerState(pageCount = { state.reels.size })

    LaunchedEffect(seed) { viewModel.load(seed) }

    // Leaving the reels thread closes the last dwell session (records its view if
    // it qualified) — the pager's per-settle end never fires for the final reel.
    DisposableEffect(Unit) {
        onDispose { viewModel.setCurrentReel(null) }
    }

    val railActions = remember(viewModel) {
        ReelRailActions(
            onLike = viewModel::toggleLike,
            onReact = viewModel::react,
            onComments = { commentsReelId = it },
            onBookmark = viewModel::toggleBookmark,
            onRepost = viewModel::repost,
        )
    }
    val openProfile by rememberUpdatedState(onOpenProfile)
    val openAuthor = remember { { id: String -> openProfile(id) } }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        val seedFailure = state.seedFailure
        if (seedFailure != null) {
            ReelOpenFailure(failure = seedFailure, onRetry = viewModel::retry, onClose = onClose)
        } else if (state.reels.isEmpty()) {
            ReelEmptyStates(state = state, onRetry = viewModel::retry)
        } else {
            ReelsPager(
                pagerState = pagerState,
                reels = state.reels,
                viewModel = viewModel,
                muted = muted,
                chromeHidden = chromeHidden,
                quickEmojis = quickEmojis,
                railActions = railActions,
                onChromeHidden = { chromeHidden = it },
                onOpenAuthor = openAuthor,
                onSettled = {
                    // Jamais de chrome masqué porté sur le réel suivant ; un haptique léger pose le passage.
                    chromeHidden = false
                    haptics.light()
                },
            )
            FullscreenScrims(
                topInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding(),
                chromeVisible = !chromeHidden,
            )
        }
        ReelTopChrome(
            reel = state.reels.getOrNull(pagerState.currentPage),
            chromeHidden = chromeHidden,
            muted = muted,
            viewModel = viewModel,
            onClose = onClose,
            onToggleMute = { muted = !muted },
            onReveal = { chromeHidden = false },
            onOpen = { id -> onOpenPost(id) },
            onShare = { reel ->
                viewModel.recordShare(reel.id)
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, PostShareLink.webLink(reel.id))
                }
                shareContext.startActivity(Intent.createChooser(send, null))
            },
        )
        FeedbackToastHost(toasts = viewModel.toasts)
    }

    val openCommentsReelId = commentsReelId
    if (openCommentsReelId != null) {
        ReelCommentsSheet(
            reelId = openCommentsReelId,
            onDismiss = { commentsReelId = null },
            onOpenPost = {
                commentsReelId = null
                onOpenPost(openCommentsReelId)
            },
            // The reel row's own server-known total, so the sheet's title never regresses
            // to "how many are loaded on screen" (a page-capped undercount).
            initialCommentCount = state.reels.firstOrNull { it.id == openCommentsReelId }?.commentCount,
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ReelsPager(
    pagerState: PagerState,
    reels: List<ReelPresentation>,
    viewModel: ReelsViewModel,
    muted: Boolean,
    chromeHidden: Boolean,
    quickEmojis: List<String>,
    railActions: ReelRailActions,
    onChromeHidden: (Boolean) -> Unit,
    onOpenAuthor: (String) -> Unit,
    onSettled: () -> Unit,
) {
    // Le reel visible possede la post room : c'est l'abonnement qui rend
    // `post:liked`/`post:unliked` livrables pour un reel dont on ne suit pas
    // l'auteur. Keye sur les ids (egalite structurelle) et non sur `reels`,
    // qui est une nouvelle liste a chaque like optimiste.
    val reelIds = reels.map { it.id }
    val currentOnSettled by rememberUpdatedState(onSettled)
    // Hors premier plan (ON_STOP), aucun lecteur ne vit : les décodeurs sont rendus au système,
    // la page affichée reprend à sa position au retour (voir ReelPage).
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
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
    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.settledPage }
            .distinctUntilChanged()
            .drop(1)
            .collect { currentOnSettled() }
    }
    VerticalPager(
        state = pagerState,
        modifier = Modifier.fillMaxSize(),
        // Une page voisine est composee (donc son poster charge) ; son LECTEUR, lui, n'est cree que
        // pour la page suivante (`loads` ci-dessous) — ni la precedente ni plus loin.
        beyondViewportPageCount = 1,
        key = { index -> reels.getOrNull(index)?.id ?: index },
    ) { page ->
        val reel = reels[page]
        val isElected by remember(pagerState, page) { derivedStateOf { pagerState.currentPage == page } }
        val isSettled by remember(pagerState, page) { derivedStateOf { pagerState.settledPage == page } }
        val loadsMedia by remember(pagerState, page) {
            derivedStateOf {
                lifecycleState.isAtLeast(Lifecycle.State.STARTED) &&
                    (page == pagerState.currentPage || page == pagerState.currentPage + 1)
            }
        }
        ReelPage(
            reel = reel,
            isElected = isElected,
            isEngaged = ReelSwitchWork.engages(isElected = isElected, isSettled = isSettled),
            loadsMedia = loadsMedia,
            muted = muted,
            chromeHidden = chromeHidden,
            isOwn = viewModel.isOwn(reel),
            quickEmojis = quickEmojis,
            railActions = railActions,
            onChromeHidden = onChromeHidden,
            onOpenAuthor = onOpenAuthor,
        )
    }
}
