package me.meeshy.app.feed

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlin.math.abs
import kotlin.math.min

/** Le cadre d'une scène dans la fenêtre du fil, en pixels (l'ordonnée haute et basse de la scène elle-même, pas de sa carte). */
data class FeedSceneFrame(val id: String, val top: Float, val bottom: Float) {
    val height: Float get() = bottom - top
}

/**
 * Qui joue dans le fil (iOS `ReelFeedAutoplayCoordinator` + `mostCenteredReel`) : UNE seule scène, la plus visible. Pure.
 *
 * L'entrée exige la moitié de la carte à l'écran ; la sortante garde sa place tant que le tiers de la carte reste visible et
 * qu'aucun rival n'est nettement plus près du centre — sans cette hystérésis, deux cartes de même hauteur se disputeraient la
 * lecture à chaque pixel de défilement (une scène préparée puis défaite à chaque image).
 */
object FeedSceneElector {

    private const val ENTER_VISIBLE_FRACTION = 0.5f
    private const val STAY_VISIBLE_FRACTION = 0.3f
    private const val SWITCH_MARGIN_OF_VIEWPORT = 0.12f

    fun elect(
        frames: List<FeedSceneFrame>,
        viewportTop: Float,
        viewportBottom: Float,
        incumbent: String? = null,
        callActive: Boolean = false,
    ): String? {
        val viewportHeight = viewportBottom - viewportTop
        if (callActive || viewportHeight <= 0f) return null
        val middle = (viewportTop + viewportBottom) / 2f
        fun distance(frame: FeedSceneFrame) = abs((frame.top + frame.bottom) / 2f - middle)
        val eligible = frames.filter { frame ->
            if (frame.height <= 0f) return@filter false
            val visible = (min(frame.bottom, viewportBottom) - maxOf(frame.top, viewportTop)).coerceAtLeast(0f)
            val fraction = visible / min(frame.height, viewportHeight)
            fraction >= (if (frame.id == incumbent) STAY_VISIBLE_FRACTION else ENTER_VISIBLE_FRACTION)
        }
        val best = eligible.minByOrNull(::distance) ?: return null
        val held = eligible.firstOrNull { it.id == incumbent } ?: return best.id
        val margin = SWITCH_MARGIN_OF_VIEWPORT * viewportHeight
        return if (distance(best) < distance(held) - margin) best.id else held.id
    }
}

/**
 * La scène active du fil. Les cartes ne lisent que [isLive] — dans une portée dérivée, pour qu'une élection ne recompose que
 * les deux cartes qui changent d'état, jamais la liste.
 *
 * Chaque scène rapporte SON cadre ([report], par `Modifier.sceneFrame`) et la liste son viewport ([reportViewport]) : l'élection
 * mesure la scène elle-même, comme iOS, pas la carte qui l'enveloppe. Ces cadres ne sont pas de l'état observable — les rapporter
 * à chaque image de défilement ne recompose rien ; [electReported] les lit une fois, quand le défilement s'est calmé.
 */
@Stable
class FeedSceneCoordinator {

    var activeId: String? by mutableStateOf(null)
        private set

    fun update(frames: List<FeedSceneFrame>, viewportTop: Float, viewportBottom: Float, callActive: Boolean = false) {
        val next = FeedSceneElector.elect(frames, viewportTop, viewportBottom, activeId, callActive)
        if (next != activeId) activeId = next
    }

    private val reported = HashMap<String, FeedSceneFrame>()
    private var viewportTop = 0f
    private var viewportBottom = 0f

    fun report(id: String, top: Float, bottom: Float) {
        reported[id] = FeedSceneFrame(id, top, bottom)
    }

    fun forget(id: String) {
        reported.remove(id)
    }

    fun reportViewport(top: Float, bottom: Float) {
        viewportTop = top
        viewportBottom = bottom
    }

    fun electReported(callActive: Boolean = false) = update(reported.values.toList(), viewportTop, viewportBottom, callActive)

    fun clear() {
        if (activeId != null) activeId = null
    }

    fun isLive(id: String): Boolean = activeId == id
}

/** `null` hors d'un fil élisant (détail d'un post, listes d'un profil) : toute scène reste une image fixe. */
val LocalFeedSceneCoordinator = staticCompositionLocalOf<FeedSceneCoordinator?> { null }

/** Cette scène est-elle celle que le fil lit ? Lu dans une portée dérivée : seule la carte qui change de camp recompose. */
@Composable
internal fun rememberSceneLive(sceneId: String?): State<Boolean> {
    val coordinator = LocalFeedSceneCoordinator.current
    return remember(coordinator, sceneId) {
        derivedStateOf { sceneId != null && coordinator != null && coordinator.isLive(sceneId) }
    }
}

/**
 * Alimente [coordinator] depuis le défilement de [listState] : l'élection est refaite, sur les cadres que les scènes rapportent,
 * 100 ms après le dernier mouvement des cartes de [sceneIds] (le défilement ne ré-élit pas à chaque image). L'écran qui quitte le
 * premier plan coupe toute scène.
 */
@OptIn(FlowPreview::class)
@Composable
internal fun FeedSceneElectionEffect(coordinator: FeedSceneCoordinator, listState: LazyListState, sceneIds: Set<String>) {
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val foreground = lifecycleState.isAtLeast(Lifecycle.State.STARTED)
    LaunchedEffect(coordinator, listState, sceneIds, foreground) {
        if (!foreground || sceneIds.isEmpty()) {
            coordinator.clear()
            return@LaunchedEffect
        }
        // Le déclencheur : où sont les cartes à scène. Les cadres mesurés viennent des scènes, relus après le calme.
        snapshotFlow {
            val info = listState.layoutInfo
            info.visibleItemsInfo.filter { it.key in sceneIds }.map { Triple(it.key, it.offset, it.size) } to
                (info.viewportStartOffset to info.viewportEndOffset)
        }
            .debounce(ELECTION_DEBOUNCE_MS)
            .collect { coordinator.electReported() }
    }
}

private const val ELECTION_DEBOUNCE_MS = 100L

/**
 * La carte montre-t-elle une scène (réel composé, story ou réel republié) ? Seules ces cartes concourent à l'élection :
 * une carte sans scène n'a rien à lire.
 */
internal val FeedPostPresentation.carriesScene: Boolean
    get() {
        val quoted = repostEmbed?.takeIf { !it.isUnavailable && republishedReel == null }
        val quotesScene = quoted?.storyItem != null
        return quotesScene || (isReel && reelCover is ReelCover.Scene)
    }

/**
 * Cette scène rapporte son cadre (en pixels de fenêtre, rognage ignoré : une scène à moitié sortie garde sa pleine hauteur) au
 * coordinateur du fil, et l'oublie en quittant la composition. Hors fil, ou sans [sceneId], aucun effet.
 */
@Composable
internal fun Modifier.sceneFrame(sceneId: String?): Modifier {
    val coordinator = LocalFeedSceneCoordinator.current
    if (coordinator == null || sceneId == null) return this
    DisposableEffect(coordinator, sceneId) { onDispose { coordinator.forget(sceneId) } }
    return onGloballyPositioned { layout ->
        if (!layout.isAttached) return@onGloballyPositioned
        val top = layout.positionInWindow().y
        coordinator.report(sceneId, top, top + layout.size.height)
    }
}

/** La liste du fil rapporte son viewport, dans les mêmes coordonnées que les cadres des scènes. */
@Composable
internal fun Modifier.sceneViewport(): Modifier {
    val coordinator = LocalFeedSceneCoordinator.current ?: return this
    return onGloballyPositioned { layout ->
        if (!layout.isAttached) return@onGloballyPositioned
        val top = layout.positionInWindow().y
        coordinator.reportViewport(top, top + layout.size.height)
    }
}

/** La clé de la carte dans la liste du fil : celle que l'élection lit (`sceneIds`) — un seul endroit pour les deux. */
internal fun FeedPostPresentation.listKey(): String = id

/** Les cartes du fil qui montrent une scène, par la clé de leur ligne. */
internal fun feedSceneIds(posts: List<FeedPostPresentation>): Set<String> = posts.filter { it.carriesScene }.map(FeedPostPresentation::listKey).toSet()
