package me.meeshy.app.chat.conversationcard

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.SubcomposeLayout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Constraints

/**
 * Une variante de mise en page : [probe] est mesurée à sa largeur NATURELLE (jamais affichée, jamais
 * lue par TalkBack) ; [content] est ce qui se dessine si la variante est élue.
 */
internal class FitCandidate(
    val probe: @Composable () -> Unit,
    val content: @Composable () -> Unit = probe,
)

/**
 * Le `ViewThatFits(in: .horizontal)` d'iOS : la PREMIÈRE variante dont la largeur naturelle tient
 * dans la largeur offerte est dessinée ; aucune ne tient ⇒ la dernière (la plus compacte).
 */
@Composable
internal fun FitsHorizontally(candidates: List<FitCandidate>, modifier: Modifier = Modifier) {
    SubcomposeLayout(modifier) { constraints ->
        val natural = Constraints()
        val elected = candidates.indices.firstOrNull { index ->
            val probes = subcompose(ProbeSlot(index)) {
                Box(Modifier.clearAndSetSemantics {}) { candidates[index].probe() }
            }
            probes.maxOfOrNull { it.measure(natural).width }?.let { it <= constraints.maxWidth } ?: true
        } ?: candidates.lastIndex
        val placeables = subcompose(ContentSlot(elected)) { candidates[elected].content() }
            .map { it.measure(constraints) }
        val width = placeables.maxOfOrNull { it.width } ?: constraints.minWidth
        val height = placeables.maxOfOrNull { it.height } ?: constraints.minHeight
        layout(width.coerceIn(constraints.minWidth, constraints.maxWidth), height) {
            placeables.forEach { it.place(0, 0) }
        }
    }
}

private data class ProbeSlot(val index: Int)
private data class ContentSlot(val index: Int)
