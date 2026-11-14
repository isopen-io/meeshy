package me.meeshy.app.calls

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onPlaced
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.call.CallGlassMorph
import me.meeshy.sdk.model.call.CallGlassMorphFrame
import me.meeshy.sdk.model.call.CallGlassPoint
import me.meeshy.sdk.model.call.CallGlassSize
import me.meeshy.sdk.model.call.CallPillMotion

/*
 * Loi 17.2 — LE MORPHISME DU VERRE DE LA PILULE, par une transformation seule (miroir de `createPillGlass` du web). La
 * mise en page prend d'un coup sa forme finale ; le verre en repart de la taille qu'il montrait, vue comme une échelle de
 * la nouvelle ancrée à son bord du bas, et la rejoint ; ce que la mise en page a déplacé dedans (les boutons de la rangée,
 * les sous-titres) repart de là où on le voyait, par une translation. Tout se trace au DESSIN : aucune image ne remesure
 * ni ne recompose. « Réduire les animations » (loi 17.10) : ni échelle ni glissement, l'ancien verre se fond dans le nouveau.
 */

private val MorphEasing = FastOutSlowInEasing

/** The pill's glass that morphs: what it shows at each frame, from the size it is laid out at. Read at draw time only. */
@Stable
internal class CallGlassMorpher(private val scope: CoroutineScope) {
    private val progress = Animatable(1f)
    private var laidOut: CallGlassSize? = null
    private var morph: CallGlassMorph? = null
    private var starting = false
    private var job: Job? = null
    internal val paint = Paint()

    fun frame(size: Size, reduceMotion: Boolean): CallGlassMorphFrame {
        val next = CallGlassSize(size.width, size.height)
        val shown = current()
        if (next != laidOut) restart(next, shown, reduceMotion)
        return current()
    }

    private fun current(): CallGlassMorphFrame {
        val p = progress.value
        return morph?.frame(if (starting) 0f else p) ?: CallGlassMorphFrame.Rest
    }

    private fun restart(next: CallGlassSize, shown: CallGlassMorphFrame, reduceMotion: Boolean) {
        val before = laidOut
        laidOut = next
        if (before == null) return
        val started = CallPillMotion.morph(shown.seen(before), next, reduceMotion) ?: return
        morph = started
        starting = true
        job?.cancel()
        job = scope.launch {
            progress.snapTo(0f)
            starting = false
            progress.animateTo(1f, tween(CallPillMotion.millis(reduceMotion), easing = MorphEasing))
        }
    }
}

@Composable
internal fun rememberCallGlassMorpher(): CallGlassMorpher {
    val scope = rememberCoroutineScope()
    return remember(scope) { CallGlassMorpher(scope) }
}

/** The glass layer drawn at the frame's scale (anchored bottom centre), and under reduction its old shape fading out. */
private fun Modifier.morphingGlass(morpher: CallGlassMorpher, reduceMotion: Boolean): Modifier = drawWithContent {
    val frame = morpher.frame(size, reduceMotion)
    if (frame.ghostAlpha > 0f) drawScaled(frame.ghostScaleX, frame.ghostScaleY, frame.ghostAlpha, morpher.paint)
    drawScaled(frame.scaleX, frame.scaleY, frame.alpha, morpher.paint)
}

private fun ContentDrawScope.drawScaled(scaleX: Float, scaleY: Float, alpha: Float, paint: Paint) {
    if (alpha <= 0f) return
    withTransform({ scale(scaleX, scaleY, pivot = Offset(size.width / 2f, size.height)) }) {
        if (alpha >= 1f) {
            this@drawScaled.drawContent()
        } else {
            paint.alpha = alpha
            drawContext.canvas.saveLayer(Rect(Offset.Zero, size), paint)
            this@drawScaled.drawContent()
            drawContext.canvas.restore()
        }
    }
}

/** Where the pill's glass is laid out: what [followsCallGlass] measures its place from (its bottom centre). */
internal class CallGlassAnchor {
    var coordinates: LayoutCoordinates? = null
}

/** Something the layout may move inside the glass: drawn from where it was seen, it joins its place by a translation. */
@Stable
internal class CallGlassFollower(private val scope: CoroutineScope) {
    private val offset = Animatable(Offset.Zero, Offset.VectorConverter)
    private var at: CallGlassPoint? = null
    private var pending: Offset? = null
    private var job: Job? = null

    fun placed(anchor: CallGlassAnchor, self: LayoutCoordinates, reduceMotion: Boolean) {
        val root = anchor.coordinates?.takeIf { it.isAttached && self.isAttached } ?: return
        val corner = root.localPositionOf(self, Offset.Zero)
        val now = CallGlassPoint(corner.x + self.size.width / 2f - root.size.width / 2f, corner.y - root.size.height)
        val before = at
        at = now
        if (before == null) return
        val drawn = shift()
        val gap = CallPillMotion.followShift(CallGlassPoint(before.x + drawn.x, before.y + drawn.y), now, reduceMotion) ?: return
        val from = Offset(gap.x, gap.y)
        pending = from
        job?.cancel()
        job = scope.launch {
            offset.snapTo(from)
            pending = null
            offset.animateTo(Offset.Zero, tween(CallPillMotion.UNFOLD_MILLIS, easing = MorphEasing))
        }
    }

    fun shift(): Offset {
        val animated = offset.value
        return pending ?: animated
    }
}

@Composable
internal fun rememberCallGlassFollower(): CallGlassFollower {
    val scope = rememberCoroutineScope()
    return remember(scope) { CallGlassFollower(scope) }
}

internal fun Modifier.followsCallGlass(follower: CallGlassFollower, anchor: CallGlassAnchor, reduceMotion: Boolean): Modifier = this
    .onPlaced { follower.placed(anchor, it, reduceMotion) }
    .drawWithContent {
        val shift = follower.shift()
        translate(shift.x, shift.y) { this@drawWithContent.drawContent() }
    }

/**
 * The pill's glass block ([CallControlsGlass]'s look: [CallGlassPlate] and the tone veil of law 3) drawn as its OWN layer
 * behind the content, so that only the glass morphs while the buttons keep their proportions. [anchor] receives where the
 * block is laid out, for what follows the glass inside it.
 */
@Composable
internal fun CallMorphingControlsGlass(
    anchor: CallGlassAnchor,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(CALL_PILL_RADIUS),
    content: @Composable ColumnScope.() -> Unit,
) {
    val morpher = rememberCallGlassMorpher()
    Box(modifier.onPlaced { anchor.coordinates = it }) {
        Box(Modifier.matchParentSize().morphingGlass(morpher, reduceMotion)) {
            CallGlassPlate(modifier = Modifier.matchParentSize(), shape = shape) {
                Box(Modifier.matchParentSize().callToneVeil(CallGlassTone::veilAlpha, shape))
            }
        }
        val tone = LocalCallGlassTone.current
        CompositionLocalProvider(
            LocalCallGlassTone provides tone.withinVeiledBlock,
            LocalCallGlassToneProgress provides CallRestingToneFade,
        ) {
            Column(Modifier.fillMaxWidth().clip(shape), content = content)
        }
    }
}
