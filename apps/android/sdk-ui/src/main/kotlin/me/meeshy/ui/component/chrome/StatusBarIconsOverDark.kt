package me.meeshy.ui.component.chrome

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.Window
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import java.util.WeakHashMap

/**
 * Un écran au fond sombre en plein cadre (les réels) pose des icônes de barre d'état CLAIRES — heure, batterie et
 * réseau lisibles sur le noir comme sur iOS — et rend à la fenêtre l'apparence qu'elle avait en le quittant.
 * Sans cela, le thème clair de l'application laisse des icônes sombres sur le fond noir.
 *
 * Deux écrans sombres peuvent se relayer (un réel ouvert depuis une notification pendant qu'on regarde les réels) :
 * le nouveau naît avant que l'ancien ne parte. L'apparence d'origine n'est donc rendue qu'au départ du DERNIER.
 */
@Composable
public fun StatusBarIconsOverDark() {
    val view = LocalView.current
    val window = view.context.findActivity()?.window ?: return
    DisposableEffect(window) {
        val controller = WindowCompat.getInsetsController(window, view)
        val claim = OverDarkClaims.acquire(window, lightIconsBefore = controller.isAppearanceLightStatusBars)
        controller.isAppearanceLightStatusBars = false
        onDispose {
            OverDarkClaims.release(window, claim)?.let { controller.isAppearanceLightStatusBars = it }
        }
    }
}

/** Les écrans sombres présents dans chaque fenêtre, et l'apparence que la fenêtre avait avant le premier. Fil principal. */
private object OverDarkClaims {
    private class Holders(val lightIconsBefore: Boolean, val claims: MutableSet<Any> = mutableSetOf())

    private val byWindow = WeakHashMap<Window, Holders>()

    fun acquire(window: Window, lightIconsBefore: Boolean): Any {
        val claim = Any()
        byWindow.getOrPut(window) { Holders(lightIconsBefore) }.claims += claim
        return claim
    }

    /** L'apparence à rendre quand [claim] était le dernier écran sombre de [window] ; `null` sinon. */
    fun release(window: Window, claim: Any): Boolean? {
        val holders = byWindow[window] ?: return null
        holders.claims -= claim
        if (holders.claims.isNotEmpty()) return null
        byWindow.remove(window)
        return holders.lightIconsBefore
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
