package me.meeshy.ui.component.audio

import android.content.Context
import android.view.accessibility.AccessibilityManager
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.QueuedAudio
import me.meeshy.sdk.model.fullscreen.AudioFullscreenChromeTiming
import me.meeshy.sdk.model.fullscreen.AudioFullscreenDismissDrag
import me.meeshy.sdk.model.fullscreen.AudioFullscreenDownloadOffer
import me.meeshy.sdk.model.fullscreen.AudioFullscreenPaging
import me.meeshy.sdk.model.fullscreen.AudioFullscreenSequence
import me.meeshy.sdk.model.fullscreen.FullscreenChromeState
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Ce que le plein écran audio demande au lecteur partagé** — une couture mince, pour que l'écran ignore le coordinateur,
 * la conversation et le porteur. UNE implémentation par hôte (la conversation : le coordinateur de l'application).
 */
@Stable
public interface AudioFullscreenPlayer {
    /** L'état du moteur partagé : progression, vitesse, lecture, chargement. */
    public val playback: StateFlow<AudioPlaybackState>

    /** Le vocal courant de la file du lecteur ; il change sans l'écran à la fin d'un vocal ou par la carte système. */
    public val activeAttachmentId: StateFlow<String?>

    /** Jouer [source] suivi de [upcoming] — ou, s'il est déjà la piste active, ne remplacer que sa suite. */
    public fun start(source: AudioFullscreenSource, upcoming: List<QueuedAudio>)

    public fun togglePlayPause()

    public fun skip(seconds: Double)

    public fun seek(fraction: Double)

    public fun setSpeed(speed: PlaybackSpeed)

    /** En sortant, la suite redevient celle de la conversation (les non écoutés après le vocal qui joue). */
    public fun replaceUpcoming(upcoming: List<QueuedAudio>)

    /** La position que l'appareil a mémorisée pour [attachmentId] (ms), `null` s'il n'en a aucune. */
    public fun restingPositionMs(attachmentId: String): Long? = null

    /** Le spectre de [source] (niveaux 0…1), calculé sur une copie déjà en cache ; vide sinon. */
    public fun samples(source: AudioFullscreenSource): StateFlow<List<Float>>
}

/**
 * **Le plein écran audio** (iOS `AudioFullscreenView`) : les vocaux [sources], triés par date de réception, se balaient
 * de page en page ; la page posée joue ([AudioFullscreenPaging] : la page d'entrée sans attendre, une page traversée au
 * doigt après 160 ms — celles qu'on ne fait que traverser ne partent jamais) ; la fin d'un vocal enchaîne sur la page
 * voisine, et l'écran SUIT la piste. Le chrome s'efface après trois secondes d'écoute ([AudioFullscreenChromeTiming]),
 * revient au toucher, à la pause et à la fin. Un glissement franc vers le bas ferme ([AudioFullscreenDismissDrag]) —
 * la lecture continue : rien ici n'arrête le moteur ; la conversation reprend sa file ([conversationTail]).
 *
 * Fond fixe sous le pager : la surface du thème, éclairée par l'[accent] de la conversation.
 *
 * Télécharger ([onDownload]) ne s'offre que sur une page dont le porteur laisse sortir le vocal, et jamais dans une
 * conversation chiffrée de bout en bout ([AudioFullscreenDownloadOffer]). Le portrait porte la présence VIVANTE de
 * l'auteur (la carte de la session), la présence servie par la source en repli — hors ligne : aucun point.
 */
@Composable
public fun AudioFullscreenScreen(
    sources: List<AudioFullscreenSource>,
    startAttachmentId: String,
    player: AudioFullscreenPlayer,
    accent: Color,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    conversationTail: (String) -> List<QueuedAudio> = { emptyList() },
    onDismissToMessage: (String) -> Unit = {},
    onDownload: ((AudioFullscreenSource) -> Unit)? = null,
    conversationIsEndToEnd: Boolean = false,
    actions: AudioFullscreenActionPort? = null,
) {
    val ordered = remember(sources) { AudioFullscreenSequence.ordered(sources) { it.createdAtEpochMs } }
    val ids = remember(ordered) { ordered.map { it.id } }
    val latestOrdered by rememberUpdatedState(ordered)
    val latestIds by rememberUpdatedState(ids)
    val latestPlayer by rememberUpdatedState(player)
    val latestTail by rememberUpdatedState(conversationTail)
    val pagerState = rememberPagerState(initialPage = AudioFullscreenPaging.index(startAttachmentId, ids) ?: 0) { ordered.size }
    val memory = remember { AudioFullscreenTurnMemory() }
    val heard = remember { mutableStateMapOf<String, Long>() }
    val scope = rememberCoroutineScope()
    val isPlaying by remember(player) { player.playback.map { it.isPlaying }.distinctUntilChanged() }
        .collectAsState(initial = player.playback.value.isPlaying)
    var chrome by remember { mutableStateOf(FullscreenChromeState.Initial) }
    var touches by remember { mutableIntStateOf(0) }
    val screenReader = rememberScreenReaderRunning()

    val upcomingAfter: (String) -> List<QueuedAudio> = { id ->
        val later = AudioFullscreenSequence.upcoming(id, latestIds).toSet()
        latestOrdered.filter { it.id in later }.map { it.queuedAudio() }
    }

    LaunchedEffect(pagerState) {
        var entry = true
        snapshotFlow { if (pagerState.isScrollInProgress) null else latestIds.getOrNull(pagerState.settledPage) }
            .distinctUntilChanged()
            .collectLatest { pageId ->
                if (pageId == null) return@collectLatest
                val turned = !entry
                entry = false
                delay(AudioFullscreenPaging.playbackDelayMillis(turnedTo = turned))
                val posed = if (pagerState.isScrollInProgress) null else latestIds.getOrNull(pagerState.settledPage)
                if (AudioFullscreenPaging.isStale(pageId, posed)) return@collectLatest
                val source = latestOrdered.firstOrNull { it.id == pageId } ?: return@collectLatest
                memory.requested = pageId
                latestPlayer.start(source, upcomingAfter(pageId))
            }
    }

    LaunchedEffect(pagerState, player) {
        player.activeAttachmentId.drop(1).distinctUntilChanged().collect { active ->
            val target = AudioFullscreenSequence.pageToFollow(
                activeAttachmentId = active,
                currentPageId = latestIds.getOrNull(pagerState.settledPage),
                ids = latestIds,
                requestedByScreen = memory.requested,
            ) ?: return@collect
            val index = latestIds.indexOf(target)
            if (index >= 0) pagerState.animateScrollToPage(index)
        }
    }

    LaunchedEffect(player) {
        var listening: Pair<String, Long>? = null
        player.playback.collect { state ->
            val left = listening
            if (left != null && left.first != state.attachmentId) heard[left.first] = left.second
            val id = state.attachmentId
            listening = if (id != null && state.isPlaying && state.durationMs > 0L && id in latestIds) {
                id to state.currentTimeMs
            } else {
                left?.takeIf { it.first == id }
            }
        }
    }

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.currentPage }.drop(1).distinctUntilChanged().collect { chrome = chrome.turningPage() }
    }

    LaunchedEffect(isPlaying) {
        if (!isPlaying && !chrome.showsChrome && chrome.overlay == null) chrome = chrome.revealing()
    }

    LaunchedEffect(chrome, isPlaying, touches, screenReader) {
        val wait = AudioFullscreenChromeTiming.autoHideDelay(chrome, isPlaying, screenReader) ?: return@LaunchedEffect
        delay(wait)
        chrome = chrome.autoHiding()
    }

    DisposableEffect(Unit) {
        onDispose {
            val active = latestPlayer.activeAttachmentId.value ?: return@onDispose
            if (active in latestIds) latestPlayer.replaceUpcoming(latestTail(active))
        }
    }

    val dismiss: () -> Unit = {
        latestIds.getOrNull(pagerState.currentPage)
            ?.let { id -> latestOrdered.firstOrNull { it.id == id }?.carrierId }
            ?.let(onDismissToMessage)
        onDismiss()
    }
    BackHandler { if (chrome.overlay != null) chrome = chrome.closingOverlay() else dismiss() }

    val density = LocalDensity.current
    val dragOffset = remember { Animatable(0f) }
    var translation by remember { mutableStateOf(0f) }

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val heightDp = maxHeight.value
        AudioFullscreenBackdrop(accent = accent, modifier = Modifier.fillMaxSize())
        HorizontalPager(
            state = pagerState,
            key = { index -> ordered[index].id },
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { translationY = dragOffset.value }
                .draggable(
                    orientation = Orientation.Vertical,
                    state = rememberDraggableState { delta ->
                        translation += delta / density.density
                        scope.launch { dragOffset.snapTo(AudioFullscreenDismissDrag.offset(translation) * density.density) }
                    },
                    onDragStopped = { velocity ->
                        val closes = AudioFullscreenDismissDrag.dismisses(translation, velocity / density.density, heightDp)
                        translation = 0f
                        if (closes) dismiss() else dragOffset.animateTo(0f)
                    },
                ),
        ) { index ->
            if (!AudioFullscreenPaging.renders(index, pagerState.currentPage)) {
                Box(Modifier.fillMaxSize())
                return@HorizontalPager
            }
            val source = ordered[index].withLivePresence()
            AudioFullscreenPage(
                source = source,
                pageIndex = index,
                pageCount = ordered.size,
                player = player,
                heardPositionMs = heard[source.id],
                upcoming = { upcomingAfter(source.id) },
                accent = accent,
                chromeVisible = chrome.showsChrome,
                onClose = dismiss,
                onToggleChrome = { chrome = chrome.tappingMedia() },
                onRevealChrome = { chrome = chrome.revealing() },
                onChromeInteraction = { touches += 1 },
                onDownload = onDownload?.takeIf { AudioFullscreenDownloadOffer.offers(source.exitOffer, conversationIsEndToEnd) },
                rail = if (actions != null && index == pagerState.currentPage) {
                    @Composable { AudioFullscreenActionRailSlot(actions, source, chrome, onChrome = { chrome = it }, onClose = dismiss) }
                } else {
                    null
                },
                onNext = AudioFullscreenSequence.next(source.id, ids)?.let { id ->
                    { scope.launch { pagerState.animateScrollToPage(latestIds.indexOf(id).coerceAtLeast(0)) }; Unit }
                },
                onPrevious = AudioFullscreenSequence.previous(source.id, ids)?.let { id ->
                    { scope.launch { pagerState.animateScrollToPage(latestIds.indexOf(id).coerceAtLeast(0)) }; Unit }
                },
            )
        }
        val posed = ordered.getOrNull(pagerState.currentPage)
        if (actions != null && posed != null) {
            AudioFullscreenActionOverlays(actions, posed, chrome, accent, onChrome = { chrome = it })
        }
    }
}

/** La présence de l'auteur lue au niveau de SA page : la carte vivante, sinon celle que la source a servie. */
@Composable
private fun AudioFullscreenSource.withLivePresence(): AudioFullscreenSource {
    val live = rememberPresence(author.userId) ?: return this
    return if (live == authorPresence) this else copy(authorPresence = live)
}

/** La piste que l'écran a lui-même demandée — tenue HORS de l'état Compose : la noter ne refait aucune page. */
internal class AudioFullscreenTurnMemory {
    var requested: String? = null
}

/**
 * Le sol d'un vocal (iOS `AudioFullscreenBackdrop`) : la surface du thème, éclairée en haut par l'accent de la
 * conversation, en bas par l'indigo de Meeshy. Fixe sous le pager : il ne glisse pas avec les pages.
 */
@Composable
internal fun AudioFullscreenBackdrop(accent: Color, modifier: Modifier = Modifier) {
    val isDark = MeeshyTheme.isDark
    val floor = MeeshyTheme.tokens.backgroundPrimary
    val glow = accent.copy(alpha = if (isDark) 0.42f else 0.22f)
    val indigo = MeeshyPalette.Indigo500.copy(alpha = if (isDark) 0.18f else 0.08f)
    Box(
        modifier
            .background(floor)
            .clearAndSetSemantics { }
            .drawBehind {
                val extent = maxOf(size.width, size.height)
                drawRect(
                    Brush.radialGradient(
                        colors = listOf(glow, Color.Transparent),
                        center = Offset(size.width * 0.5f, size.height * 0.22f),
                        radius = (extent * 0.62f).coerceAtLeast(1f),
                    ),
                )
                drawRect(
                    Brush.radialGradient(
                        colors = listOf(indigo, Color.Transparent),
                        center = Offset(size.width * 0.1f, size.height),
                        radius = (extent * 0.55f).coerceAtLeast(1f),
                    ),
                )
            },
    )
}

/** TalkBack (exploration au toucher) tourne-t-il ? Suivi en direct : l'activer ou le couper pendant l'écoute compte. */
@Composable
internal fun rememberScreenReaderRunning(): Boolean {
    val context = LocalContext.current
    val manager = remember(context) { context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager }
    var running by remember(manager) { mutableStateOf(manager?.isEnabled == true && manager.isTouchExplorationEnabled) }
    DisposableEffect(manager) {
        val listener = AccessibilityManager.TouchExplorationStateChangeListener { enabled ->
            running = enabled && manager?.isEnabled == true
        }
        manager?.addTouchExplorationStateChangeListener(listener)
        onDispose { manager?.removeTouchExplorationStateChangeListener(listener) }
    }
    return running
}
