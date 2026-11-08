package me.meeshy.ui.component.surface

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.sdk.model.navigation.PresentedSurfaceKind
import me.meeshy.sdk.model.navigation.PresentedSurfaceToken
import me.meeshy.sdk.model.navigation.PresentedSurfaceYield

/** Le guichet où une surface présentée se déclare ; le routeur de `:app` en est l'unique implémentation. */
public interface PresentedSurfaceDeclarations {
    public fun declare(
        kind: PresentedSurfaceKind,
        answer: () -> PresentedSurfaceYield,
        close: () -> Unit,
    ): PresentedSurfaceToken

    public fun retire(token: PresentedSurfaceToken)
}

/** Fourni par `:app` ; `null` hors de l'application (aperçu, test) : la surface ne se déclare pas, rien ne casse. */
public val LocalPresentedSurfaces: ProvidableCompositionLocal<PresentedSurfaceDeclarations?> =
    staticCompositionLocalOf { null }

/**
 * Déclare la surface tant que ce composable est dans la composition : une conversation qui s'ouvre la referme par
 * [onClose], ou la laisse en place quand [retains] répond vrai (un travail qu'une fermeture perdrait). [retains] est
 * relu à chaque demande.
 */
@Composable
public fun DeclarePresentedSurface(
    kind: PresentedSurfaceKind,
    retains: () -> Boolean = { false },
    onClose: () -> Unit,
) {
    val declarations = LocalPresentedSurfaces.current ?: return
    val retainsNow = rememberUpdatedState(retains)
    val closeNow = rememberUpdatedState(onClose)
    DisposableEffect(declarations, kind) {
        val token = declarations.declare(
            kind = kind,
            answer = { if (retainsNow.value()) PresentedSurfaceYield.RETAINS else PresentedSurfaceYield.CLOSES },
            close = { closeNow.value() },
        )
        onDispose { declarations.retire(token) }
    }
}
