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
 * Un écran au fond sombre en plein cadre (les réels, le compositeur) pose des icônes de barre d'état CLAIRES — heure,
 * batterie et réseau lisibles sur le noir comme sur iOS — et rend à la fenêtre l'apparence qu'elle avait en le quittant.
 * Sans cela, le thème clair de l'application laisse des icônes sombres sur le fond noir.
 *
 * Deux écrans sombres peuvent se relayer (un réel ouvert depuis une notification pendant qu'on regarde les réels) :
 * le nouveau naît avant que l'ancien ne parte. L'apparence d'origine n'est donc rendue qu'au départ du DERNIER.
 */
@Composable
public fun StatusBarIconsOverDark() {
    StatusBarIconsOver(darkBehind = true, layer = StatusBarLayer.SCREEN)
}

/** Ce qui se tient sous la barre d'état : l'écran, ou une bande opaque posée par-dessus lui, qui l'emporte tant qu'elle est là. */
internal enum class StatusBarLayer { SCREEN, BAND }

/**
 * Les icônes de la barre d'état suivent ce qui est DESSOUS : claires sur du sombre, sombres sur du clair. La couche la plus
 * haute présente décide (une bande l'emporte sur l'écran qu'elle recouvre), la plus récente à couche égale ; au départ de
 * la dernière, la fenêtre retrouve l'apparence qu'elle avait avant la première.
 */
@Composable
internal fun StatusBarIconsOver(darkBehind: Boolean, layer: StatusBarLayer) {
    val view = LocalView.current
    val window = view.context.findActivity()?.window ?: return
    DisposableEffect(window, darkBehind, layer) {
        val controller = WindowCompat.getInsetsController(window, view)
        val claim = StatusBarClaims.acquire(window, controller.isAppearanceLightStatusBars, layer, darkBehind)
        controller.isAppearanceLightStatusBars = StatusBarClaims.appearance(window)
        onDispose {
            StatusBarClaims.release(window, claim)?.let { controller.isAppearanceLightStatusBars = it }
        }
    }
}

/** Ce que chaque fenêtre a sous sa barre d'état, et l'apparence qu'elle avait avant la première demande. Fil principal. */
private object StatusBarClaims {
    private class Claim(val layer: StatusBarLayer, val darkBehind: Boolean, val order: Long)

    private class Holders(val lightIconsBefore: Boolean, val claims: MutableList<Claim> = mutableListOf())

    private val byWindow = WeakHashMap<Window, Holders>()
    private var nextOrder = 0L

    fun acquire(window: Window, lightIconsBefore: Boolean, layer: StatusBarLayer, darkBehind: Boolean): Any {
        val claim = Claim(layer, darkBehind, nextOrder++)
        byWindow.getOrPut(window) { Holders(lightIconsBefore) }.claims += claim
        return claim
    }

    /** `true` : des icônes sombres. Ce que demande la couche la plus haute, ou l'apparence d'origine quand il n'en reste aucune. */
    fun appearance(window: Window): Boolean {
        val holders = byWindow[window] ?: return false
        val top = holders.claims.maxWithOrNull(compareBy<Claim>({ it.layer.ordinal }, { it.order })) ?: return holders.lightIconsBefore
        return !top.darkBehind
    }

    fun release(window: Window, claim: Any): Boolean? {
        val holders = byWindow[window] ?: return null
        holders.claims.remove(claim)
        if (holders.claims.isNotEmpty()) return appearance(window)
        byWindow.remove(window)
        return holders.lightIconsBefore
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
