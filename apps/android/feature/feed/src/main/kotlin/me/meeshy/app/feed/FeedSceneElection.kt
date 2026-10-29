package me.meeshy.app.feed

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlin.math.abs
import kotlin.math.min

/** Le cadre d'une scène dans la fenêtre du fil, en pixels (l'ordonnée haute et basse de sa carte). */
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
 */
@Stable
class FeedSceneCoordinator {

    var activeId: String? by mutableStateOf(null)
        private set

    fun update(frames: List<FeedSceneFrame>, viewportTop: Float, viewportBottom: Float, callActive: Boolean = false) {
        val next = FeedSceneElector.elect(frames, viewportTop, viewportBottom, activeId, callActive)
        if (next != activeId) activeId = next
    }

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
 * Alimente [coordinator] depuis le défilement de [listState] : les cartes de [sceneIds] visibles, recomptées après 100 ms de
 * calme (le défilement ne ré-élit pas à chaque image). L'écran qui quitte le premier plan coupe toute scène.
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
        snapshotFlow {
            val info = listState.layoutInfo
            val frames = info.visibleItemsInfo
                .filter { it.key in sceneIds }
                .map { FeedSceneFrame(it.key as String, it.offset.toFloat(), (it.offset + it.size).toFloat()) }
            Triple(frames, info.viewportStartOffset.toFloat(), info.viewportEndOffset.toFloat())
        }
            .debounce(ELECTION_DEBOUNCE_MS)
            .collect { (frames, top, bottom) -> coordinator.update(frames, top, bottom) }
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
        val quotesScene = quoted != null && (quoted.storyItem != null || quoted.reelCover is ReelCover.Scene)
        return quotesScene || (isReel && reelCover is ReelCover.Scene)
    }
