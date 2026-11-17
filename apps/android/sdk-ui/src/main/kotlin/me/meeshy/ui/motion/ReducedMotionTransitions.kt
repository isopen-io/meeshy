package me.meeshy.ui.motion

import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import me.meeshy.sdk.model.accessibility.MotionSpecs

/** Le fondu court (iOS `MeeshyMotion.reducedFade`, 150 ms) qui remplace glissement, depliage et echelle sous reduction. */
public fun meeshyReducedFadeIn(): EnterTransition = fadeIn(tween(MotionSpecs.REDUCED_FADE_MILLIS))

/** Sortie symetrique de [meeshyReducedFadeIn]. */
public fun meeshyReducedFadeOut(): ExitTransition = fadeOut(tween(MotionSpecs.REDUCED_FADE_MILLIS))

/** L'entree [full] de l'appelant, ou le fondu court sous reduction : aucun deplacement quand on reduit les animations. */
public fun meeshyEnter(reduce: Boolean, full: EnterTransition): EnterTransition =
    if (reduce) meeshyReducedFadeIn() else full

/** La sortie [full] de l'appelant, ou le fondu court sous reduction. */
public fun meeshyExit(reduce: Boolean, full: ExitTransition): ExitTransition =
    if (reduce) meeshyReducedFadeOut() else full

/** La permutation d'un `AnimatedContent` : [full], ou un fondu enchaine court sous reduction. */
public fun meeshyContentTransform(reduce: Boolean, full: ContentTransform): ContentTransform =
    if (reduce) meeshyReducedFadeIn() togetherWith meeshyReducedFadeOut() else full

/** La spec [full] (ressort, tween), remplacee par `snap()` sous reduction : l'etat final est immediat. */
public fun <T> meeshySpec(reduce: Boolean, full: FiniteAnimationSpec<T>): FiniteAnimationSpec<T> =
    if (reduce) snap() else full
