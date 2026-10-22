package me.meeshy.ui.component.game

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.runtime.getValue
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import me.meeshy.sdk.model.game.GameBounceSpec
import me.meeshy.sdk.model.game.GameTimeline
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * Le rebond unique du jeu : l'élément S'ENFONCE à 0,94 au contact, DÉPASSE au relâché, puis se pose — un
 * ressort, jamais une simple opacité. Sous mouvement réduit, il devient un fondu d'opacité à 0,6.
 *
 * Il lit l'ÉTAT PRESSÉ tenu par le système ([interactionSource]) et ne pose aucun `pointerInput` de drag : il
 * ne vole donc pas le geste au défilement, et se relâche quand la liste part sous le doigt.
 */
public fun Modifier.gameBounce(interactionSource: InteractionSource): Modifier = composed {
    val pressed = interactionSource.collectIsPressedAsState().value
    val reduceMotion = LocalReduceMotion.current
    val springSpec = if (pressed) {
        spring<Float>(GameBounceSpec.PRESS_DAMPING, GameBounceSpec.pressStiffness)
    } else {
        spring<Float>(GameBounceSpec.RELEASE_DAMPING, GameBounceSpec.releaseStiffness)
    }
    val fade = tween<Float>((GameTimeline.REDUCED_DURATION * 1000).toInt())
    val scale by animateFloatAsState(
        targetValue = GameBounceSpec.scale(pressed, reduceMotion),
        animationSpec = if (reduceMotion) fade else springSpec,
        label = "gameBounceScale",
    )
    val opacity by animateFloatAsState(
        targetValue = GameBounceSpec.opacity(pressed, reduceMotion),
        animationSpec = fade,
        label = "gameBounceOpacity",
    )
    graphicsLayer {
        scaleX = scale
        scaleY = scale
        alpha = opacity
    }
}

/**
 * UN ÉLÉMENT QUI SE TOUCHE : il rebondit, donne un retour haptique léger, puis fait ce qu'on lui demande. Un
 * vrai bouton (rôle, clavier, TalkBack), dont aucun geste séquencé ne peut voler le toucher.
 */
@Composable
public fun GameBounceButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    val source = remember { MutableInteractionSource() }
    Box(
        modifier
            .gameBounce(source)
            .clickable(interactionSource = source, indication = null, role = Role.Button) {
                haptics.light()
                onClick()
            },
    ) { content() }
}
