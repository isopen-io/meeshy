package me.meeshy.ui.component.auth

import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.animation.core.animateFloat
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * Le tic léger des atomes d'authentification — l'équivalent du `HapticFeedback.light()` d'iOS.
 * Un seul site : quand le moteur d'haptiques partagé arrivera, c'est ici qu'on le branche.
 */
internal fun HapticFeedback.lightTap() {
    performHapticFeedback(HapticFeedbackType.TextHandleMove)
}

/**
 * Vrai tant que « Réduire les animations » est actif : le réglage de l'app OU l'échelle système à zéro, résolus
 * une fois par [LocalReduceMotion]. Suit le réglage en direct : un décor qui pulse s'arrête dès que l'utilisateur
 * coupe les animations, sans attendre que l'écran soit recréé.
 */
@Composable
internal fun rememberAnimationsReduced(): Boolean = LocalReduceMotion.current

/**
 * Une phase 0..1 qui va et vient sans fin — le souffle d'un décor. Désactivée, elle ne
 * CRÉE PAS de transition infinie : elle reste à 0, immobile, et ne coûte aucune image. C'est
 * ce qui tient la promesse « coupé sous animations réduites » : une animation qu'on arrête
 * encore de dessiner continue de réveiller le thread de rendu ; une animation jamais créée,
 * non.
 */
@Composable
internal fun rememberPulsePhase(
    enabled: Boolean,
    durationMillis: Int,
    easing: Easing = EaseInOut,
): State<Float> =
    if (enabled) {
        rememberInfiniteTransition(label = "authPulse").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = durationMillis, easing = easing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "authPulsePhase",
        )
    } else {
        remember { mutableStateOf(0f) }
    }
