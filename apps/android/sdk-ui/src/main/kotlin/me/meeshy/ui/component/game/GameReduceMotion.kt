package me.meeshy.ui.component.game

import androidx.compose.runtime.Composable
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.ProvideReduceMotion

/** Fournit « Reduire les animations » au jeu depuis le seul reglage systeme (l'override applicatif vient de :app). */
@Composable
public fun ProvideGameReduceMotion(content: @Composable () -> Unit) {
    ProvideReduceMotion(userForced = LocalReduceMotion.current, content = content)
}
