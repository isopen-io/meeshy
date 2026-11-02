package me.meeshy.ui.modifier

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.PostReactionPaletteState
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * **Le geste qui ouvre la palette de réactions, écrit UNE fois pour toutes les surfaces** — iso
 * `reactionPaletteTrigger` (iOS) : un appui long de 450 ms ouvre la palette d'un haptique moyen, et
 * l'action TalkBack « Plus de réactions » ([label]) en est l'équivalent — un appui long est
 * invisible pour un lecteur d'écran.
 *
 * Le détecteur écoute à la passe INITIAL, sans rien consommer avant l'échéance : un appui bref
 * atteint donc le bouton (le cœur) comme avant. Une fois la palette ouverte, le reste du geste est
 * consommé, si bien que le bouton ne reçoit qu'une annulation — l'appui long ne pose pas de cœur.
 * Un glissement au-delà du seuil de toucher, ou un relâchement avant l'échéance, abandonne.
 */
public fun Modifier.reactionPaletteTrigger(
    onOpen: () -> Unit,
    enabled: Boolean = true,
): Modifier = composed {
    val open by rememberUpdatedState(onOpen)
    val haptics = rememberMeeshyHaptics()
    val slop = LocalViewConfiguration.current.touchSlop
    val moreLabel = stringResource(R.string.reactions_more)
    this
        .pointerInput(enabled, slop) {
            if (!enabled) return@pointerInput
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                val timedOut = withTimeoutOrNull(PostReactionPaletteState.LONG_PRESS_MILLIS) {
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        val change = event.changes.firstOrNull { it.id == down.id }
                        val moved = change != null && (change.position - down.position).getDistance() > slop
                        if (change == null || !change.pressed || moved) break
                    }
                    Unit
                } == null
                if (timedOut) {
                    haptics.medium()
                    open()
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        event.changes.forEach { it.consume() }
                        if (event.changes.none { it.pressed }) break
                    }
                }
            }
        }
        .semantics {
            if (enabled) {
                customActions = listOf(CustomAccessibilityAction(moreLabel) { open(); true })
            }
        }
}
