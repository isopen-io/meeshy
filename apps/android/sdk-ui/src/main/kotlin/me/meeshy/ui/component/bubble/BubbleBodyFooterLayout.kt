package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.unit.Constraints
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Corps et pied empilés à 4 dp, port d'iOS `BubbleBodyFooterLayout` : la bulle épouse son contenu
 * (jamais étirée à sa largeur maximale) et le pied prend exactement la largeur retenue — celle du
 * corps, ou la sienne propre si elle est plus large — si bien que l'heure tombe au bord droit.
 */
@Composable
internal fun BubbleBodyFooterLayout(
    body: @Composable () -> Unit,
    footer: @Composable () -> Unit,
) {
    Layout(
        content = {
            Box { body() }
            Box { footer() }
        },
    ) { measurables, constraints ->
        val gap = MeeshySpacing.xs.roundToPx()
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val bodyPlaceable = measurables[0].measure(loose)
        val footerNatural = measurables[1].maxIntrinsicWidth(Constraints.Infinity)
        val width = maxOf(bodyPlaceable.width, footerNatural, constraints.minWidth)
            .coerceAtMost(constraints.maxWidth)
        val footerPlaceable = measurables[1].measure(
            Constraints(minWidth = width, maxWidth = width, minHeight = 0, maxHeight = constraints.maxHeight),
        )
        val bodyGap = if (bodyPlaceable.height > 0) gap else 0
        val height = bodyPlaceable.height + bodyGap + footerPlaceable.height
        layout(width, height) {
            bodyPlaceable.place(0, 0)
            footerPlaceable.place(0, bodyPlaceable.height + bodyGap)
        }
    }
}
