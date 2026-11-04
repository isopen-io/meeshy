package me.meeshy.app.conversations

import android.content.ClipData
import android.content.ClipDescription
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.draganddrop.DragAndDropSourceScope
import androidx.compose.foundation.draganddrop.dragAndDropSource
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitLongPressOrCancellation
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.compose.ui.draganddrop.DragAndDropTarget
import androidx.compose.ui.draganddrop.DragAndDropTransferData
import androidx.compose.ui.draganddrop.mimeTypes
import androidx.compose.ui.draganddrop.positionInRoot
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.conversationlist.ChipDropAction
import me.meeshy.sdk.model.conversationlist.ConversationListSectionDefaults
import me.meeshy.sdk.model.conversationlist.DragAutoScroll
import me.meeshy.sdk.model.conversationlist.DragSectionCollapse
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius

/**
 * Le glisser-déposer d'une conversation vers un en-tête de section (iOS `ConversationListView+DragDrop` et
 * `+ChipDrag`) : l'état du glissement en cours, hissé hors des rangées. Le doigt qui survole la liste replie
 * toutes les sections ([DragSectionCollapse]) ; l'en-tête d'origine se teinte, l'en-tête survolé s'illumine ;
 * le dépôt se résout par `ChipDropResolver` côté ViewModel. TalkBack n'a pas de glisser-déposer : le menu
 * « Déplacer vers… » de la rangée reste l'alternative accessible.
 */
@Stable
internal class ConversationDragState {

    var draggedId by mutableStateOf<String?>(null)
        private set
    var hoveredSectionId by mutableStateOf<String?>(null)
        private set
    private var collapse by mutableStateOf(DragSectionCollapse.Idle)

    /** Les sections dépliées pendant le glissement (vide : tout est replié) ; `null` hors glissement. */
    var collapsedExpanded by mutableStateOf<Set<String>?>(null)
        private set

    val originSectionId: String? get() = collapse.origin
    val isDragging: Boolean get() = draggedId != null

    var fingerY: Float = 0f
    var viewportTop: Float = 0f
    var viewportBottom: Float = 0f

    /** Vrai tant que la dernière image de défilement a réellement déplacé la liste. */
    var isAutoScrolling: Boolean = false

    private var pendingOrigin: String? = null
    private var droppedOn: String? = null

    fun start(conversationId: String, originSectionId: String?) {
        draggedId = conversationId
        pendingOrigin = originSectionId
    }

    fun onListEntered(baseExpanded: Set<String>) {
        if (!isDragging || collapse.isActive) return
        val step = DragSectionCollapse.begin(collapse, baseExpanded, pendingOrigin)
        collapse = step.state
        collapsedExpanded = step.expanded
    }

    fun hover(sectionId: String?) {
        hoveredSectionId = sectionId
    }

    fun noteDropped(sectionId: String) {
        droppedOn = sectionId
    }

    /** Fin (dépôt ou annulation) : l'ensemble à restaurer, cible dépliée comprise ; l'état retombe à zéro. */
    fun finish(): Set<String>? {
        val restored = collapse.takeIf { it.isActive }?.let {
            DragSectionCollapse.end(it, collapsedExpanded.orEmpty(), droppedOn).expanded
        }
        draggedId = null
        hoveredSectionId = null
        collapse = DragSectionCollapse.Idle
        collapsedExpanded = null
        pendingOrigin = null
        droppedOn = null
        isAutoScrolling = false
        return restored
    }
}

@Composable
internal fun rememberConversationDragState(): ConversationDragState = remember { ConversationDragState() }

private fun DragAndDropEvent.isConversationDrag(state: ConversationDragState): Boolean =
    state.isDragging && mimeTypes().contains(ClipDescription.MIMETYPE_TEXT_PLAIN)

/**
 * Source : un appui long suivi d'un déplacement lève la rangée. Un appui long immobile garde le menu
 * contextuel — la rangée referme son menu dès qu'elle devient glissée.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Modifier.conversationDragSource(
    state: ConversationDragState,
    conversationId: String,
    originSectionId: String?,
): Modifier {
    val gesture: suspend DragAndDropSourceScope.() -> Unit = remember(state, conversationId, originSectionId) {
        {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                val pressed = awaitLongPressOrCancellation(down.id) ?: return@awaitEachGesture
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    val change = event.changes.firstOrNull { it.id == pressed.id } ?: return@awaitEachGesture
                    if (!change.pressed) return@awaitEachGesture
                    if ((change.position - pressed.position).getDistance() > viewConfiguration.touchSlop) break
                }
                state.start(conversationId, originSectionId)
                startTransfer(DragAndDropTransferData(ClipData.newPlainText(DRAG_LABEL, conversationId)))
            }
        }
    }
    return dragAndDropSource(gesture)
}

/**
 * Posé sur toute la liste : le premier passage du doigt la replie, sa position nourrit le défilement
 * automatique, la fin du glissement (dépôt ou annulation) restaure les sections. N'accepte jamais de dépôt :
 * les en-têtes, plus profonds, le reçoivent.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Modifier.conversationListDragWatch(
    state: ConversationDragState,
    baseExpanded: () -> Set<String>,
    onFinished: (Set<String>?) -> Unit,
): Modifier {
    val latestBase by rememberUpdatedState(baseExpanded)
    val latestFinished by rememberUpdatedState(onFinished)
    val shouldStart = remember(state) { { event: DragAndDropEvent -> event.isConversationDrag(state) } }
    val target = remember(state) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) = state.onListEntered(latestBase())
            override fun onMoved(event: DragAndDropEvent) {
                state.fingerY = event.positionInRoot.y
            }
            override fun onDrop(event: DragAndDropEvent): Boolean = false
            override fun onEnded(event: DragAndDropEvent) = latestFinished(state.finish())
        }
    }
    return this
        .onGloballyPositioned {
            val bounds = it.boundsInRoot()
            state.viewportTop = bounds.top
            state.viewportBottom = bounds.bottom
        }
        .dragAndDropTarget(shouldStartDragAndDrop = shouldStart, target = target)
}

/**
 * Cible d'un en-tête : refus (sections calculées, En direct, tête World Wide) sans surbrillance ni haptique ;
 * sinon l'en-tête s'illumine à l'entrée (haptique légère), le dépôt est résolu par [resolve].
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Modifier.sectionDropTarget(
    state: ConversationDragState,
    sectionId: String,
    haptics: MeeshyHaptics,
    resolve: (conversationId: String, sectionId: String, isAutoScrolling: Boolean) -> ChipDropAction,
): Modifier {
    val latestResolve by rememberUpdatedState(resolve)
    val shouldStart = remember(state, sectionId) {
        { event: DragAndDropEvent ->
            ConversationListSectionDefaults.acceptsDrop(sectionId) && event.isConversationDrag(state)
        }
    }
    val target = remember(state, sectionId, haptics) {
        object : DragAndDropTarget {
            override fun onEntered(event: DragAndDropEvent) {
                state.hover(sectionId)
                haptics.light()
            }
            override fun onMoved(event: DragAndDropEvent) {
                state.fingerY = event.positionInRoot.y
            }
            override fun onExited(event: DragAndDropEvent) {
                if (state.hoveredSectionId == sectionId) state.hover(null)
            }
            override fun onDrop(event: DragAndDropEvent): Boolean {
                val id = state.draggedId ?: return false
                state.noteDropped(sectionId)
                val action = latestResolve(id, sectionId, state.isAutoScrolling)
                if (action != ChipDropAction.None) haptics.success()
                return true
            }
        }
    }
    return dragAndDropTarget(shouldStartDragAndDrop = shouldStart, target = target)
}

/**
 * L'en-tête d'origine se teinte (couleur primaire 22 %), l'en-tête survolé s'illumine (fond 12 %, liseré 2 dp).
 * Dessiné PAR-DESSUS le contenu : le sticker a son propre fond, qui cacherait une teinte posée dessous.
 */
@Composable
internal fun Modifier.dragHeaderDecoration(isOrigin: Boolean, isTarget: Boolean, sectionColor: Color): Modifier {
    val origin by animateFloatAsState(if (isOrigin) ORIGIN_ALPHA else 0f, tween(FADE_MILLIS), label = "drag-origin")
    val target by animateFloatAsState(if (isTarget) 1f else 0f, tween(FADE_MILLIS), label = "drag-target")
    return drawWithContent {
        drawContent()
        val radius = CornerRadius(MeeshyRadius.sm.toPx())
        if (origin > 0f) drawRoundRect(MeeshyPalette.Indigo500.copy(alpha = origin), cornerRadius = radius)
        if (target > 0f) {
            drawRoundRect(sectionColor.copy(alpha = TARGET_ALPHA * target), cornerRadius = radius)
            val stroke = TARGET_BORDER.toPx()
            drawRoundRect(
                sectionColor.copy(alpha = target),
                topLeft = Offset(stroke / 2, stroke / 2),
                size = Size(size.width - stroke, size.height - stroke),
                cornerRadius = radius,
                style = Stroke(stroke),
            )
        }
    }
}

/** Le défilement automatique : tant que le doigt stationne dans une zone de bord, la liste défile à l'image. */
@Composable
internal fun ConversationDragAutoScroll(state: ConversationDragState, listState: LazyListState) {
    val density = LocalDensity.current.density
    LaunchedEffect(state.isDragging) {
        if (!state.isDragging) return@LaunchedEffect
        var last = withFrameMillis { it }
        while (true) {
            val now = withFrameMillis { it }
            val speed = DragAutoScroll.speed(state.fingerY, state.viewportTop, state.viewportBottom, density)
            if (DragAutoScroll.shouldRun(speed)) {
                val consumed = listState.scrollBy(DragAutoScroll.displacement(speed, now - last))
                state.isAutoScrolling = consumed != 0f
            } else {
                state.isAutoScrolling = false
            }
            last = now
        }
    }
}

private const val DRAG_LABEL = "conversation"
private const val ORIGIN_ALPHA = 0.22f
private const val TARGET_ALPHA = 0.12f
private const val FADE_MILLIS = 200
private val TARGET_BORDER = 2.dp
