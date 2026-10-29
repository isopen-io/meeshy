package me.meeshy.ui.component.chrome

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * Un écran au fond sombre en plein cadre (les réels) pose des icônes de barre d'état CLAIRES — heure, batterie et
 * réseau lisibles sur le noir comme sur iOS — et rend à la fenêtre l'apparence qu'elle avait en le quittant.
 * Sans cela, le thème clair de l'application laisse des icônes sombres sur le fond noir.
 */
@Composable
public fun StatusBarIconsOverDark() {
    val view = LocalView.current
    val window = view.context.findActivity()?.window ?: return
    DisposableEffect(window) {
        val controller = WindowCompat.getInsetsController(window, view)
        val previous = controller.isAppearanceLightStatusBars
        controller.isAppearanceLightStatusBars = false
        onDispose { controller.isAppearanceLightStatusBars = previous }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
