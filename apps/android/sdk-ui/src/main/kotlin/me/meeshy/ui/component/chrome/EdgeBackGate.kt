package me.meeshy.ui.component.chrome

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue

/**
 * Le verrou du retour interactif depuis le bord. L'hôte de navigation le fournit ; un écran qui porte ses
 * propres glissés horizontaux depuis le bord (cube des stories, carte d'un lieu) le ferme le temps qu'il est
 * affiché avec [DisableEdgeBackWhile]. Un compteur, pas un booléen : deux écrans empilés qui le ferment ne se
 * rouvrent pas l'un l'autre en se retirant.
 */
@Stable
public class EdgeBackGate {
    private var holds by mutableIntStateOf(0)

    public val isOpen: Boolean get() = holds == 0

    internal fun hold() { holds += 1 }

    internal fun release() { holds = (holds - 1).coerceAtLeast(0) }
}

public val LocalEdgeBackGate = compositionLocalOf<EdgeBackGate?> { null }

@Composable
public fun DisableEdgeBackWhile(disabled: Boolean = true) {
    val gate = LocalEdgeBackGate.current
    DisposableEffect(gate, disabled) {
        if (disabled) gate?.hold()
        onDispose { if (disabled) gate?.release() }
    }
}
