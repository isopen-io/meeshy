package me.meeshy.ui.component.swipe

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.chrome.SwipeRowLaw
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette

/** Une action revelee par le glissement d'une rangee (iOS `SwipeAction`). */
@Immutable
public data class SwipeAction(
    val icon: ImageVector,
    val label: String,
    val color: Color,
    val onClick: () -> Unit,
)

/** Cellule d'action tapable : echelle 0,4 -> 1 et opacite au fil de la revelation. */
@Composable
internal fun SwipeActionCell(
    action: SwipeAction,
    progress: Float,
    onTriggered: () -> Unit,
) {
    val scale = SwipeRowLaw.cellScale(progress)
    val opacity = SwipeRowLaw.cellOpacity(progress)
    Box(
        modifier = Modifier
            .width(SwipeRowLaw.ACTION_WIDTH_DP.dp)
            .fillMaxHeight()
            .graphicsLayer { alpha = opacity }
            .background(action.color)
            .clickable(role = Role.Button) {
                action.onClick()
                onTriggered()
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.graphicsLayer {
                scaleX = scale
                scaleY = scale
            },
        ) {
            Icon(
                imageVector = action.icon,
                contentDescription = null,
                tint = MeeshyPalette.White,
                modifier = Modifier.size(22.dp),
            )
            Text(
                text = action.label,
                color = MeeshyPalette.White,
                fontSize = MeeshyFontSize.caption,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
    }
}
