package me.meeshy.app.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import me.meeshy.app.onboarding.rememberOnboardingReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val ERROR_ENTER_MS = 220
private const val ERROR_EXIT_MS = 160

/**
 * L'erreur d'un écran d'accès (iOS : le message rouge qui entre sous le formulaire).
 *
 * Elle ENTRE — fondu et dépliage vertical, fondu seul sous « Réduire les animations » — au lieu
 * de surgir en poussant le bouton d'un coup, et elle SORT de même. Le premier affichage d'un
 * texte (ou son changement) déclenche la secousse d'erreur (`HapticFeedback.error()` d'iOS) ;
 * une recomposition qui rend le même texte ne la rejoue pas. Zone vivante : TalkBack l'annonce.
 *
 * Le dernier texte non nul est gardé le temps de la sortie, pour que le fondu n'anime pas une
 * boîte vide.
 */
@Composable
internal fun AuthErrorMessage(text: String?, modifier: Modifier = Modifier, boxed: Boolean = false) {
    val haptics = rememberMeeshyHaptics()
    val reduceMotion = rememberOnboardingReduceMotion()
    var lastShown by remember { mutableStateOf(text) }
    if (text != null && text != lastShown) lastShown = text
    LaunchedEffect(text) {
        if (text != null) haptics.error()
    }
    AnimatedVisibility(
        visible = text != null,
        enter = if (reduceMotion) {
            fadeIn(tween(ERROR_ENTER_MS))
        } else {
            fadeIn(tween(ERROR_ENTER_MS)) + expandVertically(tween(ERROR_ENTER_MS))
        },
        exit = if (reduceMotion) {
            fadeOut(tween(ERROR_EXIT_MS))
        } else {
            fadeOut(tween(ERROR_EXIT_MS)) + shrinkVertically(tween(ERROR_EXIT_MS))
        },
        modifier = modifier,
    ) {
        Text(
            text = text ?: lastShown.orEmpty(),
            color = MeeshyTheme.tokens.error,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (boxed) {
                        Modifier
                            .clip(RoundedCornerShape(MeeshyRadius.sm))
                            .background(MeeshyTheme.tokens.error.copy(alpha = 0.10f))
                            .padding(MeeshySpacing.sm)
                    } else {
                        Modifier
                    },
                )
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}
