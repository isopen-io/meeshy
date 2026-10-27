package me.meeshy.app.chat.river

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.reading.river.RiverMetrics
import me.meeshy.sdk.model.reading.river.RiverTimeScale
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * R-3 — la poignée du temps, au bord du volet : une piste graduée (`RiverTimeScale`) et une poignée
 * qu'on TIENT pour sauter à la période voulue. Elle apparaît au défilement et s'efface au repos.
 *
 * Elle ne calcule aucun temps ni aucun rang : elle lit l'échelle, pose la poignée à [fraction], et
 * rend à l'hôte la fraction où le doigt l'a laissée ([onSeek]) — c'est l'hôte qui cadre. Le geste est
 * capté dans la seule colonne de la poignée et CONSOMMÉ : le défilement de la pile ne l'emporte pas.
 * La visibilité est lue à la phase de dessin (`graphicsLayer`), sans recomposer.
 */
@Composable
internal fun RiverTimeHandle(
    scale: RiverTimeScale,
    labels: RiverTimeLabels,
    fraction: Double,
    isVisible: Boolean,
    onSeek: (Double) -> Unit,
    modifier: Modifier = Modifier,
) {
    val reduceMotion = LocalReduceMotion.current
    var dragFraction by remember { mutableStateOf<Double?>(null) }
    val shown = dragFraction ?: fraction
    val targetAlpha = if (isVisible || dragFraction != null) 1f else 0f
    val alpha by animateFloatAsState(
        targetValue = targetAlpha,
        animationSpec = tween(if (reduceMotion) 0 else (RiverMetrics.Motion.HANDLE_FADE_DURATION_SECONDS * 1000).toInt()),
        label = "river-time-handle",
    )
    val density = LocalDensity.current
    val handleHeight = RiverMetrics.TimeHandle.HANDLE_HEIGHT.dp
    val handleWidth = RiverMetrics.TimeHandle.HANDLE_WIDTH.dp
    val inset = RiverMetrics.TimeHandle.TRACK_INSET.dp
    val label = stringResource(R.string.riviere_time_handle_label)
    val value = labels.at(shown)
    val latestSeek = rememberUpdatedState(onSeek)

    BoxWithConstraints(
        modifier
            .fillMaxHeight()
            .graphicsLayer { this.alpha = alpha }
            .clearAndSetSemantics {
                contentDescription = label
                stateDescription = value
            },
    ) {
        val trackHeight = (maxHeight - handleHeight).coerceAtLeast(0.dp)
        val trackPx = with(density) { trackHeight.toPx() }
        val handlePx = with(density) { handleHeight.toPx() }
        Track(scale, labels, trackHeight, handleHeight, handleWidth, inset)
        Row(
            Modifier
                .align(Alignment.TopEnd)
                .padding(end = inset)
                .offset { IntOffset(0, (trackPx * shown).toInt()) },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            if (dragFraction != null) {
                Text(
                    text = value,
                    color = MeeshyTheme.tokens.textPrimary,
                    fontSize = MeeshyFontSize.small,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MeeshyTheme.tokens.backgroundSecondary.copy(alpha = 0.96f))
                        .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xsPlus),
                )
            }
            Box(
                Modifier
                    .size(handleWidth, handleHeight)
                    .shadow(4.dp, CircleShape)
                    .clip(CircleShape)
                    .background(MeeshyTheme.tokens.backgroundSecondary),
                contentAlignment = Alignment.Center,
            ) {
                Icon(MeeshyIcons.Menu, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(14.dp))
            }
        }
        // La colonne de la poignée : la seule surface qui capte le doigt, et qui le garde.
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .width(handleWidth + inset * 2)
                .fillMaxHeight()
                .pointerInput(trackPx, handlePx) {
                    fun fractionAt(y: Float): Double =
                        if (trackPx <= 0f) 0.0 else ((y - handlePx / 2f) / trackPx).toDouble().coerceIn(0.0, 1.0)
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        down.consume()
                        var y = down.position.y
                        dragFraction = fractionAt(y)
                        drag(down.id) { change ->
                            y = change.position.y
                            dragFraction = fractionAt(y)
                            change.consume()
                        }
                        val landed = fractionAt(y)
                        dragFraction = null
                        latestSeek.value(landed)
                    }
                },
        )
    }
}

@Composable
private fun Track(
    scale: RiverTimeScale,
    labels: RiverTimeLabels,
    trackHeight: androidx.compose.ui.unit.Dp,
    handleHeight: androidx.compose.ui.unit.Dp,
    handleWidth: androidx.compose.ui.unit.Dp,
    inset: androidx.compose.ui.unit.Dp,
) {
    val muted = MeeshyTheme.tokens.textMuted
    Box(Modifier.fillMaxHeight().width(handleWidth + inset * 2 + TICK_LABEL_ROOM), contentAlignment = Alignment.TopEnd) {
        Box(
            Modifier
                .padding(end = inset + (handleWidth - RiverMetrics.TimeHandle.TRACK_WIDTH.dp) / 2, top = handleHeight / 2)
                .width(RiverMetrics.TimeHandle.TRACK_WIDTH.dp)
                .height(trackHeight)
                .clip(CircleShape)
                .background(muted.copy(alpha = 0.25f)),
        )
        scale.ticks.forEach { tick ->
            Row(
                Modifier
                    .padding(end = inset + handleWidth / 2)
                    .offset(y = handleHeight / 2 + trackHeight * tick.fraction.toFloat() - 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                Text(labels.tick(tick), color = muted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Box(Modifier.width(RiverMetrics.TimeHandle.TICK_LENGTH.dp).height(1.dp).background(muted.copy(alpha = 0.5f)))
            }
        }
    }
}

private val TICK_LABEL_ROOM = 90.dp
