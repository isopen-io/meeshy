package me.meeshy.ui.component.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.skeleton.skeletonPlaceholderColor
import me.meeshy.ui.component.skeleton.skeletonShimmer

/**
 * **L'atome squelette** (K38) : la silhouette grise d'un composant attendu — ligne, pilule, billet, cercle ou carte —, jamais
 * un texte ni une icône. Il ne se pose que sur un cache VIDE ([MeeshySkeletonLaw.shows]) : un cache, même périmé, se peint
 * tout de suite. Le reflet n'apparaît qu'après 150 ms (une réponse rapide ne clignote pas) et s'arrête sous « Réduire les
 * animations » : l'aplat reste fixe. Décoratif pour TalkBack : l'hôte annonce le chargement une fois, pas chaque forme.
 *
 * La silhouette prend sa largeur dans l'espace offert ([MeeshySkeletonRecipe.size]). Jumeau iOS : `MeeshySkeleton`.
 */
@Composable
public fun MeeshySkeleton(shape: MeeshySkeletonShape, modifier: Modifier = Modifier) {
    val reduce = LocalReduceMotion.current
    var hasWaited by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(MeeshySkeletonRecipe.SHEEN_DELAY_MILLIS.toLong())
        hasWaited = true
    }
    val fill = skeletonPlaceholderColor()
    BoxWithConstraints(modifier = modifier.clearAndSetSemantics {}) {
        val size = MeeshySkeletonRecipe.size(shape, maxWidth.value)
        val sheen = if (MeeshySkeletonRecipe.sheenAnimates(reduce, hasWaited)) Modifier.skeletonShimmer() else Modifier
        Box(
            Modifier
                .width(size.widthDp.dp)
                .height(size.heightDp.dp)
                .clip(RoundedCornerShape(size.cornerRadiusDp.dp))
                .background(fill)
                .then(sheen),
        )
    }
}
