package me.meeshy.ui.component.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.ComposerRailGeometry
import me.meeshy.sdk.model.composer.PullDownDismiss
import me.meeshy.sdk.model.composer.PullOutcome
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.PlateauTint

/**
 * True under the unified composer host: the sheets it mounts (post, mood) then draw themselves ON the plateau — rails in
 * the corridors, card in the middle — instead of floating as a modal sheet. Elsewhere (feed shortcut, republish) the
 * sheets keep their own presentation.
 */
public val LocalOnComposerPlateau: ProvidableCompositionLocal<Boolean> = compositionLocalOf { false }

/**
 * The PLATEAU of the one composer (iOS `ComposerPlateau` + the chrome of `MeeshyComposerHost`): a permanent dark tint,
 * a top corridor (close, format), a LEADING column for what the author PLACES on the scene, a TRAILING column for what
 * acts on the objects' dimensions (controllers, history, a new slide), the CANONICAL line under the card for what
 * belongs to the publication or the slide, and the SOCLE (audience, publish). Every zone lives in the corridors around
 * the [content] card — never on it (a control over the scene would make the preview lie, and steal the touches of the
 * band it covers). A surface without a scene simply leaves the columns empty.
 *
 * A pull down that the content does not absorb, or a drag on the top corridor, calls [onDismiss] like the cross does —
 * the drafts autosave, so leaving never loses the words; with the keyboard up the same pull lowers it first.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
public fun ComposerPlateau(
    onDismiss: () -> Unit,
    topCorridor: @Composable RowScope.() -> Unit,
    modifier: Modifier = Modifier,
    tint: PlateauTint = PlateauTint.DEFAULT,
    leadingRail: (@Composable ColumnScope.() -> Unit)? = null,
    trailingRail: (@Composable ColumnScope.() -> Unit)? = null,
    canonicalRow: (@Composable RowScope.() -> Unit)? = null,
    socle: (@Composable RowScope.() -> Unit)? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val density = LocalDensity.current.density
    val dismiss = rememberUpdatedState(onDismiss)
    val keyboardOpen = rememberUpdatedState(WindowInsets.isImeVisible)
    val keyboard = LocalSoftwareKeyboardController.current
    val focus = LocalFocusManager.current
    val pull = remember {
        PullDismissTracker(density, keyboardOpen = { keyboardOpen.value }) { outcome ->
            when (outcome) {
                PullOutcome.DISMISS -> dismiss.value()
                PullOutcome.HIDE_KEYBOARD -> {
                    focus.clearFocus()
                    keyboard?.hide()
                }
                PullOutcome.NONE -> Unit
            }
        }
    }
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
        canonicalRow?.let { row ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = ComposerPlateauDimens.EDGE, vertical = ComposerPlateauDimens.GUTTER),
                horizontalArrangement = Arrangement.spacedBy(ComposerPlateauDimens.ENTRY_SPACING),
                verticalAlignment = Alignment.CenterVertically,
                content = row,
            )
        }
        socle?.let { row ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = ComposerPlateauDimens.EDGE, vertical = ComposerPlateauDimens.GUTTER),
                horizontalArrangement = Arrangement.spacedBy(ComposerPlateauDimens.ENTRY_SPACING),
                verticalAlignment = Alignment.CenterVertically,
                content = row,
            )
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
private class PullDismissTracker(
    private val density: Float,
    private val keyboardOpen: () -> Boolean,
    private val onOutcome: (PullOutcome) -> Unit,
) {
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
        val outcome = pull.outcome(velocityPx / density, keyboardOpen())
        pull = pull.released()
        onOutcome(outcome)
    }
}
