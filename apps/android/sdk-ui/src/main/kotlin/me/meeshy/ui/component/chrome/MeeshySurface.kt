package me.meeshy.ui.component.chrome

import android.content.Context
import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * Vrai quand l'utilisateur demande moins de transparence : sur Android, le texte a contraste eleve
 * (reglage « high_text_contrast_enabled »). Surchargeable (tests, apercus) par ce local ; `null`
 * = lire le reglage systeme. Pendant iOS : `accessibilityReduceTransparency`.
 */
public val LocalReduceTransparency = compositionLocalOf<Boolean?> { null }

internal fun isHighContrastEnabled(context: Context): Boolean = try {
    Settings.Secure.getInt(context.contentResolver, "high_text_contrast_enabled", 0) == 1
} catch (_: Exception) {
    false
}

@Composable
public fun rememberReduceTransparency(): Boolean {
    val override = LocalReduceTransparency.current
    val context = LocalContext.current
    return override ?: remember(context) { isHighContrastEnabled(context) }
}
