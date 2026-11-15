package me.meeshy.ui.component.kit

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.unit.Velocity

/**
 * **Ce que la feuille ancrée dit à son hôte** (K15) : la place qu'elle occupe AU REPOS, pour que l'hôte réduise son
 * contenu au-dessus d'elle au lieu de le laisser passer dessous, et le cran sur lequel elle repose.
 *
 * [footprintPx] vaut 0 feuille fermée. Il ne se publie qu'au repos (ouverture, fermeture, cran atteint, hauteur de contenu
 * changée), JAMAIS à chaque image du doigt : l'hôte le lit en phase de mise en page (`graphicsLayer { }`, `offset { }`) et
 * ne se recompose pas. Miroir de `MeeshyAnchoredSheetFootprintKey` (iOS).
 *
 * [nestedScrollConnection] : le reste d'un défilement du contenu tiré vers le bas ferme la feuille (Android seulement,
 * fiche §4). La feuille le pose elle-même sur sa pile ; l'hôte n'en a besoin que pour un défilement hors de la feuille.
 */
@Stable
public class MeeshyAnchoredSheetState internal constructor() {

    /** La hauteur de la feuille au repos, en pixels ; 0 quand elle est fermée. */
    public var footprintPx: Float by mutableFloatStateOf(0f)
        internal set

    /** L'indice, dans la liste ORDONNÉE des crans, du cran sur lequel la feuille repose. */
    public var detentIndex: Int by mutableIntStateOf(0)
        internal set

    private var publisher: Any? = null

    /** Une feuille publie sa place ; la dernière à la publier la tient, une feuille remplacée ne l'efface plus en partant. */
    internal fun publish(owner: Any, px: Float) {
        publisher = owner
        footprintPx = px
    }

    /** Rend la place, si [owner] est encore celle qui la tient. */
    internal fun release(owner: Any) {
        if (publisher !== owner) return
        publisher = null
        footprintPx = 0f
    }

    /** Rend la place sans condition : l'hôte referme sa feuille, la réduction du contenu repart avec elle. */
    internal fun clear() {
        publisher = null
        footprintPx = 0f
    }

    internal var densityPx: Float = 1f
    internal var isPullEnabled: Boolean = true
    internal var onPullDismiss: (() -> Unit)? = null

    public val nestedScrollConnection: NestedScrollConnection = object : NestedScrollConnection {
        private var pulledPx = 0f

        override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
            if (available.y < 0f) pulledPx = 0f
            return Offset.Zero
        }

        override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
            if (source == NestedScrollSource.UserInput && available.y > 0f) pulledPx += available.y
            return Offset.Zero
        }

        override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
            val pulled = pulledPx
            pulledPx = 0f
            val dismiss = onPullDismiss
            if (!isPullEnabled || dismiss == null) return Velocity.Zero
            val closes = MeeshyAnchoredSheetMetrics.pullDismisses(pulled / densityPx, available.y / densityPx)
            if (!closes) return Velocity.Zero
            dismiss()
            return available
        }
    }
}

/** L'état d'une feuille ancrée : à garder chez l'hôte, qui lit [MeeshyAnchoredSheetState.footprintPx]. */
@Composable
public fun rememberMeeshyAnchoredSheetState(): MeeshyAnchoredSheetState = remember { MeeshyAnchoredSheetState() }
