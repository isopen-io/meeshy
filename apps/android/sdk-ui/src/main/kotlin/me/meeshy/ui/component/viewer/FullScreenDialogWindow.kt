package me.meeshy.ui.component.viewer

import android.os.Build
import android.view.ViewGroup
import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat

/**
 * **Un plein écran monté dans un `Dialog` couvre l'écran ENTIER** (#14200). La fenêtre d'un dialogue est FLOTTANTE : bornée
 * sous la barre d'état et assombrie derrière, elle laisse voir l'écran du dessous là où elle ne s'étend pas — les boutons du
 * fil transparaissaient derrière ⋯ et ✕. Appelée dans le contenu du dialogue, elle étend sa fenêtre sous les barres système et
 * l'encoche, retire l'assombrissement et passe les glyphes des barres en clair, pour une scène noire. Au contenu de poser ses
 * contrôles sous la barre d'état (`statusBarsPadding`).
 */
@Composable
fun FullScreenDialogWindow() {
    val view = LocalView.current
    val window = (view.parent as? DialogWindowProvider)?.window ?: return
    DisposableEffect(window) {
        window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        window.addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN)
        window.setDimAmount(0f)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        onDispose { }
    }
}
