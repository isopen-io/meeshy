package me.meeshy.app.chat.conversationcard

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.SubcomposeLayout
import androidx.compose.ui.unit.Constraints

/**
 * Une variante de mise en page : [content] est ce qui se dessine si la variante est élue ; sa
 * largeur NATURELLE (intrinsèque) décide de son élection, sans qu'une copie « sonde » ne soit composée.
 */
internal class FitCandidate(
    val content: @Composable () -> Unit,
)

private class Election(var maxWidth: Int = -1, var index: Int = 0)

/**
 * Le `ViewThatFits(in: .horizontal)` d'iOS : la PREMIÈRE variante dont la largeur naturelle tient
 * dans la largeur offerte est dessinée ; aucune ne tient ⇒ la dernière (la plus compacte).
 *
 * Les variantes écartées sont composées le temps de la mesure seulement : l'élection est mémorisée
 * pour la largeur offerte, et la passe de mesure suivante (déclenchée ici) ne recompose que l'élue,
 * si bien qu'aucune copie fantôme n'est lue par TalkBack ni trouvée dans l'arbre de sémantique.
 */
@Composable
internal fun FitsHorizontally(candidates: List<FitCandidate>, modifier: Modifier = Modifier) {
    val election = remember(candidates) { Election() }
    val settle = remember { mutableIntStateOf(0) }
    SubcomposeLayout(modifier) { constraints ->
        val observed = settle.intValue
        if (election.maxWidth != constraints.maxWidth) {
            val elected = candidates.indices.firstOrNull { index ->
                subcompose(index) { candidates[index].content() }
                    .maxOfOrNull { it.maxIntrinsicWidth(Constraints.Infinity) }
                    ?.let { it <= constraints.maxWidth } ?: true
            } ?: candidates.lastIndex
            election.maxWidth = constraints.maxWidth
            election.index = elected
            settle.intValue = observed + 1
        }
        val elected = election.index
        val placeables = subcompose(elected) { candidates[elected].content() }
            .map { it.measure(constraints) }
        val width = placeables.maxOfOrNull { it.width } ?: constraints.minWidth
        val height = placeables.maxOfOrNull { it.height } ?: constraints.minHeight
        layout(width.coerceIn(constraints.minWidth, constraints.maxWidth), height) {
            placeables.forEach { it.place(0, 0) }
        }
    }
}
