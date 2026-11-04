package me.meeshy.app.auth

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * La secousse d'erreur d'un refus qui PARAÎT sous un champ (iOS `HapticFeedback.error()`).
 * Elle se rejoue quand le texte change, jamais quand une recomposition rend le même.
 */
@Composable
internal fun ErrorHaptic(text: String?) {
    val haptics = rememberMeeshyHaptics()
    LaunchedEffect(text) {
        if (text != null) haptics.error()
    }
}
