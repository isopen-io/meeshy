package me.meeshy.ui.accessibility

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
import me.meeshy.sdk.model.accessibility.ReduceMotionLaw

/**
 * Valeur RESOLUE de « Reduire les animations » : reglage systeme (echelle d'animation a zero) OU override
 * applicatif. Faux par defaut, hors d'un [ProvideReduceMotion].
 */
public val LocalReduceMotion = staticCompositionLocalOf { false }

public fun readSystemReduceMotion(context: Context): Boolean = runCatching {
    ReduceMotionLaw.systemReduces(
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f),
    )
}.getOrDefault(false)

/** Fournit [LocalReduceMotion] et le tient a jour quand l'utilisateur change l'echelle d'animation systeme. */
@Composable
public fun ProvideReduceMotion(userForced: Boolean, content: @Composable () -> Unit) {
    val context = LocalContext.current
    var system by remember { mutableStateOf(readSystemReduceMotion(context)) }
    DisposableEffect(context) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                system = readSystemReduceMotion(context)
            }
        }
        val uri = Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE)
        runCatching { context.contentResolver.registerContentObserver(uri, false, observer) }
        onDispose { runCatching { context.contentResolver.unregisterContentObserver(observer) } }
    }
    CompositionLocalProvider(
        LocalReduceMotion provides ReduceMotionLaw.shouldReduce(system = system, userForced = userForced),
        content = content,
    )
}
