package me.meeshy.ui.component.focal

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.model.reading.focal.FocalQuotedReplyPresentation

/** La largeur du filet de citation (2,5) et son écart au contenu cité (8), iOS `FocalMetrics.Quote` / `FocalQuoteRail.spacing`. */
public object FocalQuoteRailMetrics {
    public val width: Dp = FocalMetrics.Quote.RAIL_WIDTH.toFloat().dp
    public val spacing: Dp = FocalQuotedReplyPresentation.RAIL_SPACING.toFloat().dp
}

/**
 * **LE filet de citation de la rangée plate** (iOS `FocalQuoteRail`), partagé par la citation de
 * message et par la carte d'une story citée : un trait arrondi de 2,5 qui prend la hauteur de son
 * voisin (le parent doit mesurer `IntrinsicSize.Min`, sans quoi le filet s'étirerait).
 */
@Composable
public fun FocalQuoteRail(color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .width(FocalQuoteRailMetrics.width)
            .fillMaxHeight()
            .clip(RoundedCornerShape(FocalQuoteRailMetrics.width / 2))
            .background(color),
    )
}
