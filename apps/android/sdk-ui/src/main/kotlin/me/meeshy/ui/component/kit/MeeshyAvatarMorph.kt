package me.meeshy.ui.component.kit

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.unit.dp
import kotlin.math.hypot
import me.meeshy.ui.accessibility.LocalReduceMotion

private const val ARC_BULGE = 0.18f

@OptIn(ExperimentalSharedTransitionApi::class)
private fun boundsFor(path: MeeshyAvatarMorphPath, totalMillis: Int): BoundsTransform = BoundsTransform { initial, target ->
    if (path != MeeshyAvatarMorphPath.Arc) {
        tween(totalMillis, easing = FastOutSlowInEasing)
    } else {
        val dx = target.center.x - initial.center.x
        val dy = target.center.y - initial.center.y
        val distance = hypot(dx, dy)
        val normal = if (distance == 0f) Offset.Zero else Offset(-dy / distance, dx / distance) * (distance * ARC_BULGE)
        val half = Rect(
            left = (initial.left + target.left) / 2f + normal.x,
            top = (initial.top + target.top) / 2f + normal.y,
            right = (initial.right + target.right) / 2f + normal.x,
            bottom = (initial.bottom + target.bottom) / 2f + normal.y,
        )
        keyframes {
            durationMillis = totalMillis
            half at (totalMillis / 2) using FastOutSlowInEasing
        }
    }
}

/**
 * **L'avatar qui voyage** (K29) : un avatar passe d'un écran à l'autre (liste, fiche, épingle de carte) au lieu de
 * réapparaître. Le composant transporte, il ne dessine rien : l'avatar, ses initiales, sa photo et son anneau sont ceux de
 * l'hôte, posés dans [avatar]. Il relie deux emplacements qui portent la même [identity] dans la même portée ([visibility] du
 * `SharedTransitionLayout` de l'hôte) : un seul avatar, jamais deux, en 560 ms, en ligne droite ou en arc selon l'écart.
 *
 * Sans [visibility] (pas de portée) ou sous mouvement réduit : l'avatar reste en place et la transition de l'hôte fait le
 * fondu. La [badge] (présence) reste sur l'avatar : elle ne voyage que si l'hôte la pose dans [avatar] ; sinon elle s'efface
 * 80 ms avant le départ et revient 120 ms après l'arrivée. [fromDp] et [toDp] sont les deux tailles du voyage (36, 44, 56,
 * 112 dans l'app). Jumeau iOS : `MeeshyAvatarMorph`.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
@Suppress("LongParameterList")
public fun SharedTransitionScope.MeeshyAvatarMorph(
    identity: String,
    sizeDp: Int,
    fromDp: Int,
    toDp: Int,
    visibility: AnimatedVisibilityScope?,
    modifier: Modifier = Modifier,
    path: MeeshyAvatarMorphPath = MeeshyAvatarMorphPath.Auto,
    badgeTravels: Boolean = false,
    badge: (@Composable () -> Unit)? = null,
    avatar: @Composable () -> Unit,
) {
    val reduce = LocalReduceMotion.current
    val values = MeeshyAvatarMorphRecipe.resolve(
        from = fromDp,
        to = toDp,
        hasScope = visibility != null,
        canTravel = true,
        requestedPath = path,
        reduceMotion = reduce,
        badgeTravels = badgeTravels,
    )
    val travelling = values.mode != MeeshyAvatarMorphMode.Crossfade && visibility != null
    val shared = if (travelling && visibility != null) {
        Modifier.sharedElement(
            rememberSharedContentState(key = "avatar-$identity"),
            animatedVisibilityScope = visibility,
            boundsTransform = boundsFor(values.path, values.durationMillis),
        )
    } else {
        Modifier
    }
    Box(modifier.size(sizeDp.dp).then(shared), contentAlignment = Alignment.Center) {
        avatar()
        if (badge != null) {
            val fade = if (visibility != null && !values.badgeInFlight && !reduce) {
                with(visibility) {
                    Modifier.animateEnterExit(
                        enter = fadeIn(tween(values.badgeReturnMillis, delayMillis = values.durationMillis)),
                        exit = fadeOut(tween(values.badgeLeadMillis)),
                    )
                }
            } else {
                Modifier
            }
            val jewels = MeeshyAvatarMorphRecipe.jewels(sizeDp.toFloat())
            Box(Modifier.align(Alignment.BottomEnd).size(jewels.badgeDp.dp).then(fade), contentAlignment = Alignment.Center) { badge() }
        }
    }
}
