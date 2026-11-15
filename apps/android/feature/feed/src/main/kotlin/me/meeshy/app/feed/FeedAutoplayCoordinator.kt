package me.meeshy.app.feed

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalDensity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import me.meeshy.sdk.call.CallActivityGate
import me.meeshy.sdk.model.FeedReelAutoplay
import me.meeshy.sdk.model.FeedReelFrame
import me.meeshy.sdk.model.FeedReelKind
import me.meeshy.sdk.model.FeedReelVisibility

/**
 * Qui joue dans le fil (iOS `ReelFeedAutoplayCoordinator`) : UNE surface, la plus centrée, réels et scènes confondus —
 * source unique de « qui joue ». Un repost de réel se rapporte sous l'id du post CONTENANT, jamais deux surfaces pour un même
 * réel. L'élection est un [StateFlow] que seules les cartes visibles lisent, jamais la liste.
 *
 * Call-aware aussi HORS du défilement : [callActive] coupe la lecture à l'ouverture d'un appel (la session audio lui
 * appartient) sans attendre un geste, et la rend à sa fin. Le préchauffage ([prewarmId]) désigne la surface qui suit l'active.
 */
class FeedAutoplayCoordinator(
    private val scope: CoroutineScope,
    callActive: Flow<Boolean> = emptyFlow(),
    private val debounceMs: Long = ELECTION_DEBOUNCE_MS,
    private val prewarmsNeighbours: () -> Boolean = { true },
) {
    private val activeFlow = MutableStateFlow<String?>(null)
    private val prewarmFlow = MutableStateFlow<String?>(null)
    private val callFlow = MutableStateFlow(false)

    val activeId: StateFlow<String?> = activeFlow.asStateFlow()
    val prewarmId: StateFlow<String?> = prewarmFlow.asStateFlow()
    val isCallActive: Boolean get() = callFlow.value

    private val reported = LinkedHashMap<String, FeedReelFrame>()
    private var viewportMin = 0f
    private var viewportMax = 0f
    private var pending: Job? = null

    init {
        callActive.onEach { active ->
            val wasActive = callFlow.value
            callFlow.value = active
            if (active) clear() else if (wasActive) electReported()
        }.launchIn(scope)
    }

    fun report(frame: FeedReelFrame) {
        reported[frame.id] = frame
    }

    fun forget(id: String) {
        reported.remove(id)
    }

    fun reportViewport(min: Float, max: Float) {
        viewportMin = min
        viewportMax = max
    }

    /** Les cadres rapportés, dans l'ordre d'arrivée — la matière que [FeedAutoplayElectionEffect] relit quand le défilement se calme. */
    fun reportedFrames(): List<FeedReelFrame> = reported.values.toList()

    fun electReported() = update(reportedFrames(), viewportMin, viewportMax)

    /**
     * Élit sur [frames] après 100 ms de calme. Pendant un appel : personne, tout de suite, sans débounce.
     */
    fun update(frames: List<FeedReelFrame>, viewportMin: Float, viewportMax: Float) {
        if (isCallActive) {
            clear()
            return
        }
        pending?.cancel()
        pending = scope.launch {
            delay(debounceMs)
            if (isCallActive) {
                clear()
                return@launch
            }
            val next = FeedReelAutoplay.mostCentered(frames, viewportMin, viewportMax)
            if (next != activeFlow.value) activeFlow.value = next
            val neighbour = if (prewarmsNeighbours()) FeedReelAutoplay.prewarmAfter(next, frames) else null
            if (neighbour != prewarmFlow.value) prewarmFlow.value = neighbour
        }
    }

    /** Plus personne ne joue : l'écran quitte le premier plan, le fil se vide, un appel s'ouvre. */
    fun clear() {
        pending?.cancel()
        pending = null
        if (activeFlow.value != null) activeFlow.value = null
        if (prewarmFlow.value != null) prewarmFlow.value = null
    }

    /** Cette surface est-elle celle que le fil lit ? */
    fun isLive(id: String): Boolean = activeFlow.value == id

    companion object {
        const val ELECTION_DEBOUNCE_MS: Long = 100L
    }
}

/** `null` hors d'un fil élisant (détail d'un post, listes d'un profil) : toute surface reste une image fixe. */
val LocalFeedAutoplayCoordinator = staticCompositionLocalOf<FeedAutoplayCoordinator?> { null }

/** Le porteur Hilt de ce que le fil tient hors composition : l'état d'appel et la mémoire du son. */
@HiltViewModel
class FeedAutoplayViewModel @Inject constructor(
    callGate: CallActivityGate,
) : ViewModel() {
    val callActive: StateFlow<Boolean> = callGate.isActiveFlow
    val audioProbe = FeedAudioProbe()
}

/**
 * Le coordinateur du fil, lié à la composition de l'écran, et la boucle qui l'alimente : les scènes de [sceneCoordinator]
 * (post composé, story republiée, réel composé) concourent avec les surfaces rapportées par [reelFrame], et l'élu est
 * reflété sur les scènes. 100 ms après le dernier mouvement des cartes ; l'écran qui quitte le premier plan coupe tout.
 */
@Composable
internal fun rememberFeedAutoplay(
    host: FeedAutoplayViewModel,
    sceneCoordinator: FeedSceneCoordinator,
    listState: LazyListState,
    sceneIds: Set<String>,
): FeedAutoplayCoordinator {
    val scope = rememberCoroutineScope()
    val coordinator = remember(host) { FeedAutoplayCoordinator(scope = scope, callActive = host.callActive) }
    val density = LocalDensity.current.density
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val foreground = lifecycleState.isAtLeast(Lifecycle.State.STARTED)
    LaunchedEffect(coordinator, sceneCoordinator, sceneIds) {
        coordinator.activeId.collect { sceneCoordinator.adopt(it?.takeIf { id -> id in sceneIds }) }
    }
    LaunchedEffect(coordinator, listState, sceneIds, foreground, density) {
        if (!foreground) {
            coordinator.clear()
            return@LaunchedEffect
        }
        // Le débounce de 100 ms est celui du coordinateur : chaque mouvement des cartes annule l'élection en attente.
        snapshotFlow {
            val info = listState.layoutInfo
            info.visibleItemsInfo.map { Triple(it.key, it.offset, it.size) } to (info.viewportStartOffset to info.viewportEndOffset)
        }
            .collect {
                val scenes = sceneCoordinator.reportedFrames().map { f ->
                    FeedReelVisibility.reported(f.id, FeedReelKind.SCENE, f.top, f.bottom, density)
                }
                val others = coordinator.reportedFrames().filter { r -> scenes.none { it.id == r.id } }
                val (min, max) = sceneCoordinator.viewportBounds()
                coordinator.update(scenes + others, min, max)
            }
    }
    return coordinator
}
