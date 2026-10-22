package me.meeshy.ui.component.auth

import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.animation.core.animateFloat
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext

/**
 * Le tic léger des atomes d'authentification — l'équivalent du `HapticFeedback.light()` d'iOS.
 * Un seul site : quand le moteur d'haptiques partagé arrivera, c'est ici qu'on le branche.
 */
internal fun HapticFeedback.lightTap() {
    performHapticFeedback(HapticFeedbackType.TextHandleMove)
}

/**
 * « Réduire les animations » côté système : le facteur de durée des animations à zéro.
 * C'est le même signal que celui que Compose lit pour ses propres transitions, et que la
 * case « Supprimer les animations » des options pour les développeurs / de l'accessibilité
 * pose.
 */
internal fun animationsReducedBy(animatorDurationScale: Float): Boolean = animatorDurationScale == 0f

/**
 * Vrai tant que le système demande de réduire les animations. Suit le réglage en direct :
 * un décor qui pulse s'arrête dès que l'utilisateur coupe les animations, sans attendre que
 * l'écran soit recréé.
 */
@Composable
internal fun rememberAnimationsReduced(): Boolean {
    val resolver = LocalContext.current.contentResolver
    var reduced by remember(resolver) { mutableStateOf(readAnimationsReduced(resolver)) }
    DisposableEffect(resolver) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                reduced = readAnimationsReduced(resolver)
            }
        }
        resolver.registerContentObserver(
            Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE),
            false,
            observer,
        )
        onDispose { resolver.unregisterContentObserver(observer) }
    }
    return reduced
}

private fun readAnimationsReduced(resolver: android.content.ContentResolver): Boolean =
    animationsReducedBy(Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f))

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
