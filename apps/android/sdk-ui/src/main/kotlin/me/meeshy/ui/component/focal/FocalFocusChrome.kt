package me.meeshy.ui.component.focal

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.max
import kotlin.math.roundToInt
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.model.reading.focal.FocalScrollPerspective

/** Les cotes de l'élu (iOS `FocalMetrics.FocusStrip`, `FocalScrollPerspective`), en dp. */
internal object ElectedMetrics {
    val cardMargin = FocalScrollPerspective.ELECTED_CARD_MARGIN.toFloat().dp
    val cardRadius = FocalScrollPerspective.FOCUS_CARD_CORNER_RADIUS.toFloat().dp
    val chipHeight = FocalMetrics.FocusStrip.CHIP_HEIGHT.toFloat().dp
    val chipMinWidth = FocalMetrics.FocusStrip.CHIP_MIN_WIDTH.toFloat().dp
    val chipInset = FocalMetrics.FocusStrip.CHIP_INSET.toFloat().dp
    val identityHeight = FocalMetrics.FocusStrip.IDENTITY_CHIP_HEIGHT.toFloat().dp
    val identityAvatar = FocalMetrics.FocusStrip.IDENTITY_AVATAR_SIZE.toFloat().dp
    val identityNameSp = FocalMetrics.FocusStrip.IDENTITY_NAME_SIZE.toFloat().sp
    val stripGap = (FocalMetrics.FocusStrip.STRIP_GAP + FocalScrollPerspective.ELECTED_CONTENT_BREATHING).toFloat().dp

    /** Ce dont la rangée élue descend en rendu (`electedContentLift`). */
    fun lift(isFirstInGroup: Boolean): Dp = FocalScrollPerspective.electedContentLift(isFirstInGroup).toFloat().dp
}

/**
 * Le cadre de l'élu autour de la colonne du message (iOS `electedCardBackground`,
 * `focusIdentityChip`, `electedStrip`) : la colonne garde sa taille — aucun relayout à l'élection —,
 * le cadre de verre, la chip d'identité et la bande basse se posent AUTOUR d'elle, hors de ses
 * bornes, sur la mesure réelle du contenu grossi ([contentRect], repère de la colonne, avant loupe).
 */
@Composable
internal fun FocalElectedFrame(
    contentScale: Float,
    lift: Dp,
    contentRect: () -> Rect?,
    card: @Composable () -> Unit,
    identityChip: @Composable () -> Unit,
    strip: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    column: @Composable () -> Unit,
) {
    Layout(contents = listOf(column, card, identityChip, strip), modifier = modifier) { measurables, constraints ->
        val (columnM, cardM, identityM, stripM) = measurables
        val columnP = columnM.first().measure(constraints)
        val width = columnP.width
        val height = columnP.height
        val rect = contentRect() ?: Rect(0f, 0f, width.toFloat(), height.toFloat())
        val extra = max(0f, contentScale * rect.width - width)
        val stripTop = max(height.toFloat(), rect.top + contentScale * rect.height) + ElectedMetrics.stripGap.toPx()
        val margin = ElectedMetrics.cardMargin.toPx()
        val liftPx = lift.toPx()
        val chip = ElectedMetrics.chipHeight.toPx()
        val cardTop = -(liftPx + margin)
        val cardBottom = stripTop + chip + margin
        val cardP = cardM.firstOrNull()?.measure(
            Constraints.fixed((width + 2 * margin + extra).roundToInt(), (cardBottom - cardTop).roundToInt()),
        )
        val identityP = identityM.firstOrNull()?.measure(Constraints(maxWidth = width))
        val stripP = stripM.firstOrNull()?.measure(Constraints.fixed((width + extra).roundToInt(), chip.roundToInt()))
        layout(width, height) {
            cardP?.place(-margin.roundToInt(), cardTop.roundToInt())
            columnP.place(0, 0)
            identityP?.place(0, -liftPx.roundToInt())
            stripP?.place(0, stripTop.roundToInt())
        }
    }
}
