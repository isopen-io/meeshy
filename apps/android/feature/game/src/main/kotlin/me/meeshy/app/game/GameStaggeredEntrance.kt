package me.meeshy.app.game

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.game.GameStaggeredEntranceLaw
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * L'ENTRÉE EN SCÈNE d'une carte de la première page (iOS `GameStaggeredEntrance`) : elle monte de 14 dp et passe de
 * 0,35 à 1 d'opacité, l'une après l'autre (0,04 s par rang, plafonné à 0,4 s — [GameStaggeredEntranceLaw]).
 *
 * UNE fois : l'hôte garde [entered] tant que la page vit (`rememberSaveable`), donc une carte composée alors que
 * [entered] est déjà vrai est posée d'emblée et rien ne rejoue au retour d'une fiche. Sous « réduire les animations »,
 * la carte est simplement là.
 */
@Composable
public fun Modifier.gameStaggeredEntrance(index: Int, entered: Boolean): Modifier {
    val reduce = LocalReduceMotion.current
    val resting = GameStaggeredEntranceLaw.isResting(entered, reduce)
    val progress by animateFloatAsState(
        targetValue = if (resting) 1f else 0f,
        animationSpec = if (reduce) {
            snap()
        } else {
            tween(durationMillis = ENTRANCE_MILLIS, delayMillis = GameStaggeredEntranceLaw.delayMillis(index), easing = FastOutSlowInEasing)
        },
        label = "gameStaggeredEntrance",
    )
    return graphicsLayer {
        alpha = GameStaggeredEntranceLaw.START_OPACITY + (1f - GameStaggeredEntranceLaw.START_OPACITY) * progress
        translationY = (1f - progress) * GameStaggeredEntranceLaw.RISE_DP * density
    }
}

private const val ENTRANCE_MILLIS = 350
