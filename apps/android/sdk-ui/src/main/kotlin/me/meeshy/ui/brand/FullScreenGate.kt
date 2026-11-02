package me.meeshy.ui.brand

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.semantics.clearAndSetSemantics

private const val HIDDEN_SCALE = 1.1f

/**
 * Un écran qui recouvre tout et ne quitte l'arbre qu'une fois effacé (iOS `fullScreenGate`) :
 * opacité 1 → 0 et échelle 1 → 1,1, masqué à l'accessibilité (et à TalkBack) dès qu'il n'est plus
 * [isPresented]. Il s'efface par l'opacité au lieu d'être retiré pendant qu'il recouvre : une
 * disparition interrompue ne laisse plus un fantôme qui avale les gestes.
 *
 * Compose ne sait pas rendre un sous-arbre intouchable par un modificateur : l'hôte garde donc
 * l'écran dans l'arbre le temps du fondu, puis le retire SANS transition (phase GONE, voir
 * `SplashOverlay`), ce qui ferme la classe du fantôme.
 *
 * [progress] (0..1, 1 = présent) permet d'animer l'opacité et l'échelle ; sans lui, l'état est binaire.
 */
public fun Modifier.fullScreenGate(
    isPresented: Boolean,
    progress: Float = if (isPresented) 1f else 0f,
): Modifier {
    val shown = progress.coerceIn(0f, 1f)
    val gated = this
        .alpha(shown)
        .scale(HIDDEN_SCALE - (HIDDEN_SCALE - 1f) * shown)
    return if (isPresented) gated else gated.clearAndSetSemantics { }
}
