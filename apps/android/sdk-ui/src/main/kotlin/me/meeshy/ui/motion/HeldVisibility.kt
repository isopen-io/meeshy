package me.meeshy.ui.motion

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * Une présence montée sur une valeur : [value] est la valeur COURANTE si elle existe, sinon la dernière valeur non
 * nulle affichée — celle que la sortie doit peindre jusqu'au bout. [visibleState] pilote la transition ; sa cible suit
 * l'existence de la valeur, et `visibleState.isIdle` dit que la sortie est finie.
 */
@Stable
public class HeldPresence<T : Any> internal constructor(
    public val value: T?,
    public val visibleState: MutableTransitionState<Boolean>,
) {
    /** Vrai tant que la valeur a disparu mais que sa sortie n'est pas finie. */
    public val isLeaving: Boolean get() = !visibleState.targetState && visibleState.currentState

    /** Vrai quand la valeur a disparu ET que sa sortie est finie : il n'y a plus rien à peindre. */
    public val isGone: Boolean get() = !visibleState.targetState && !visibleState.currentState && visibleState.isIdle
}

/**
 * Tient la dernière valeur non nulle de [value] pour qu'une sortie animée la peigne au lieu d'un contenu vide. Une
 * valeur présente dès la première composition s'affiche sans entrée, comme `AnimatedVisibility(visible = true)`, sauf
 * si [animateFirstAppearance] demande l'entrée (une fenêtre qui s'ouvre avec sa valeur).
 */
@Composable
public fun <T : Any> rememberHeldPresence(value: T?, animateFirstAppearance: Boolean = false): HeldPresence<T> {
    val state = remember { MutableTransitionState(value != null && !animateFirstAppearance) }
    val last = remember { HeldValue<T>(value) }
    SideEffect { if (value != null) last.value = value }
    state.targetState = value != null
    return HeldPresence(value ?: last.value, state)
}

/**
 * `AnimatedVisibility(visible = value != null)` qui peint la DERNIÈRE valeur pendant sa sortie, et qui prend le fondu
 * court de 150 ms ([meeshyReducedFadeIn] / [meeshyReducedFadeOut]) sous « Réduire les animations » : la réduction vaut
 * par construction, quelles que soient [enter] et [exit].
 */
@Composable
public fun <T : Any> MeeshyAnimatedVisibility(
    value: T?,
    modifier: Modifier = Modifier,
    enter: EnterTransition = fadeIn(),
    exit: ExitTransition = fadeOut(),
    label: String = "MeeshyAnimatedVisibility",
    content: @Composable AnimatedVisibilityScope.(T) -> Unit,
) {
    val presence = rememberHeldPresence(value)
    val reduce = LocalReduceMotion.current
    val shown = presence.value
    AnimatedVisibility(
        visibleState = presence.visibleState,
        modifier = modifier,
        enter = meeshyEnter(reduce, enter),
        exit = meeshyExit(reduce, exit),
        label = label,
    ) {
        if (shown != null) content(shown)
    }
}

private class HeldValue<T : Any>(var value: T?)
