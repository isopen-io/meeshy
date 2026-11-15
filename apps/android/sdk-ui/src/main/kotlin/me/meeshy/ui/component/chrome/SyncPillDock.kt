package me.meeshy.ui.component.chrome

import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import me.meeshy.sdk.model.syncpill.SyncPillDockClaims
import me.meeshy.sdk.model.syncpill.SyncPillPlacement

/**
 * Le registre des réclamations d'amarrage (miroir d'iOS `SyncPillDockClaims`, #10840) : l'écran qui porte une barre
 * basse (composeur, barre de navigation) déclare sa hauteur, la pastille se pose juste au-dessus. La loi du dernier
 * déclarant vit dans [SyncPillDockClaims] ; ce registre n'est que son porteur observable.
 */
public class SyncPillDockRegistry {
    private val claims = MutableStateFlow(SyncPillDockClaims())

    /** La hauteur (dp) du chrome sur lequel la pastille se pose ; 0 sans déclaration. */
    public fun observeHeight(): Flow<Float> = claims.map { it.height }.distinctUntilChanged()

    public fun claim(id: String, heightDp: Float) {
        claims.value = claims.value.claim(id, heightDp)
    }

    public fun release(id: String) {
        claims.value = claims.value.release(id)
    }

    public fun currentHeightDp(): Float = claims.value.height
}

/** Fourni par l'application à la racine ; `null` hors de l'application (aperçus, tests). */
public val LocalSyncPillDock = staticCompositionLocalOf<SyncPillDockRegistry?> { null }

/** Déclare la hauteur de ce chrome comme amarrage de la pastille, et la retire quand il quitte l'écran. */
public fun Modifier.syncPillDock(id: String, liftAboveEdgeDp: Float = 0f): Modifier = composed {
    val registry = LocalSyncPillDock.current
    val density = LocalDensity.current
    DisposableEffect(registry, id) { onDispose { registry?.release(id) } }
    onGloballyPositioned { coordinates ->
        val measured = with(density) { coordinates.size.height.toDp().value }
        registry?.claim(id, SyncPillPlacement.dockedHeight(measured, liftAboveEdgeDp))
    }
}
