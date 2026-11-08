package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Ce qu'une ligne peint à la place d'un texte flouté (#16957) : une icône et des barres floutées,
 * sans aucun caractère. Le texte n'est jamais dessiné, donc rien ne se lit, même sous l'API 31 où
 * `Modifier.blur` ne fait rien. Décoratif : l'hôte dit « flouté » au lecteur d'écran.
 */
@Composable
public fun VeiledTextBars(tint: Color, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = MeeshyIcons.EyeOffFilled,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(12.dp),
        )
        Spacer(Modifier.width(MeeshySpacing.xs))
        Row(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier.blur(3.dp, BlurredEdgeTreatment.Unbounded),
        ) {
            BAR_WIDTHS.forEach { width ->
                Box(
                    Modifier
                        .width(width.dp)
                        .height(10.dp)
                        .background(tint.copy(alpha = 0.35f), RoundedCornerShape(5.dp)),
                )
            }
        }
    }
}

private val BAR_WIDTHS = listOf(64, 40, 52)
