package me.meeshy.ui.component.game

import android.content.Context
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import me.meeshy.sdk.model.game.GameReduceMotionLaw

/**
 * « Réduire les animations » : Android n'a pas de réglage Meeshy, il dérive de l'échelle d'animation système
 * (`ANIMATOR_DURATION_SCALE == 0`). Faux par défaut, hors d'un [ProvideGameReduceMotion].
 */
public val LocalReduceMotion = staticCompositionLocalOf { false }

public fun readReduceMotion(context: Context): Boolean = runCatching {
    GameReduceMotionLaw.fromAnimatorScale(
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f),
    )
}.getOrDefault(false)

/** Fournit [LocalReduceMotion] et le tient à jour quand l'utilisateur change le réglage système. */
@Composable
public fun ProvideGameReduceMotion(content: @Composable () -> Unit) {
    val context = LocalContext.current
    var reduce by remember { mutableStateOf(readReduceMotion(context)) }
    DisposableEffect(context) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                reduce = readReduceMotion(context)
            }
        }
        val uri = Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE)
        runCatching { context.contentResolver.registerContentObserver(uri, false, observer) }
        onDispose { runCatching { context.contentResolver.unregisterContentObserver(observer) } }
    }
    CompositionLocalProvider(LocalReduceMotion provides reduce, content = content)
}
