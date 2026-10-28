package me.meeshy.ui.component.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.ComposerRailGeometry
import me.meeshy.sdk.model.composer.PullDownDismiss
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.PlateauTint

/**
 * True under the unified composer host: the sheets it mounts (post, mood) then draw themselves ON the plateau — rails in
 * the corridors, card in the middle — instead of floating as a modal sheet. Elsewhere (feed shortcut, republish) the
 * sheets keep their own presentation.
 */
public val LocalOnComposerPlateau: ProvidableCompositionLocal<Boolean> = compositionLocalOf { false }

/**
 * The PLATEAU of the one composer (iOS `ComposerPlateau` + the rails of `MeeshyComposerHost`): a permanent dark tint,
 * a top corridor (close, format), a LEADING rail for what the author PLACES on the scene, a TRAILING rail for what
 * structures the PUBLICATION, and a bottom socle. Rails live in the corridors on either side of the [content] card —
 * never on it (a control over the scene would make the preview lie, and steal the touches of the band it covers).
 *
 * A pull down that the content does not absorb, or a drag on the top corridor, calls [onDismiss] like the cross does:
 * the drafts autosave, so leaving never loses the words.
 */
@Composable
public fun ComposerPlateau(
    onDismiss: () -> Unit,
    topCorridor: @Composable RowScope.() -> Unit,
    modifier: Modifier = Modifier,
    tint: PlateauTint = PlateauTint.DEFAULT,
    leadingRail: (@Composable ColumnScope.() -> Unit)? = null,
    trailingRail: (@Composable ColumnScope.() -> Unit)? = null,
    socle: (@Composable () -> Unit)? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val density = LocalDensity.current.density
    val dismiss = rememberUpdatedState(onDismiss)
    val pull = remember { PullDismissTracker(density) { dismiss.value() } }
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tint.color)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .nestedScroll(pull.connection),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = ComposerPlateauDimens.CORRIDOR_HEIGHT)
                .draggable(
                    orientation = Orientation.Vertical,
                    state = rememberDraggableState { deltaPx -> pull.onDrag(deltaPx) },
                    onDragStopped = { velocityPx -> pull.onRelease(velocityPx) },
                )
                .padding(horizontal = ComposerPlateauDimens.EDGE),
            verticalAlignment = Alignment.CenterVertically,
            content = topCorridor,
        )
        Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
            Rail(leadingRail, Alignment.Top)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(ComposerPlateauDimens.CARD_RADIUS))
                    .background(MeeshyTheme.tokens.backgroundPrimary),
                content = content,
            )
            Rail(trailingRail, Alignment.Top)
        }
        socle?.let {
            Box(Modifier.fillMaxWidth().padding(horizontal = ComposerPlateauDimens.EDGE, vertical = ComposerPlateauDimens.GUTTER)) { it() }
        }
    }
}

@Composable
private fun Rail(rail: (@Composable ColumnScope.() -> Unit)?, top: Alignment.Vertical) {
    val width = if (rail == null) ComposerPlateauDimens.EDGE else ComposerPlateauDimens.LANE
    Column(
        modifier = Modifier.width(width).fillMaxHeight().padding(vertical = ComposerPlateauDimens.GUTTER),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(ComposerPlateauDimens.ENTRY_SPACING, top),
    ) { rail?.invoke(this) }
}

/** Geometry of the plateau in dp, read from [ComposerRailGeometry] — the 44 dp hit target is a floor, never a setting. */
internal object ComposerPlateauDimens {
    val EDGE = ComposerRailGeometry.OUTER_MARGIN.dp
    val GUTTER = ComposerRailGeometry.GUTTER.dp
    val LANE = (ComposerRailGeometry.RAIL_WIDTH + ComposerRailGeometry.GUTTER + ComposerRailGeometry.OUTER_MARGIN).dp
    val ENTRY_SPACING = ComposerRailGeometry.FLOATING_ENTRY_SPACING.dp
    val CORRIDOR_HEIGHT = ComposerRailGeometry.RAIL_WIDTH.dp
    val CARD_RADIUS = 24.dp
}

/** Feeds [PullDownDismiss] from the leftover scroll of the content and from the corridor drag; allocation-free per frame. */
private class PullDismissTracker(private val density: Float, private val onDismiss: () -> Unit) {
    private var pull = PullDownDismiss()

    val connection = object : NestedScrollConnection {
        override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
            if (source == NestedScrollSource.UserInput) onDrag(available.y)
            return Offset.Zero
        }

        override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
            onRelease(available.y)
            return Velocity.Zero
        }
    }

    fun onDrag(deltaPx: Float) {
        pull = pull.pulled(deltaPx / density)
    }

    fun onRelease(velocityPx: Float) {
        val dismiss = pull.shouldDismiss || pull.shouldDismissOnFling(velocityPx / density)
        pull = pull.released()
        if (dismiss) onDismiss()
    }
}
