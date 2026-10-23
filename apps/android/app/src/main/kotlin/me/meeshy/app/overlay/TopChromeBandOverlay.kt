package me.meeshy.app.overlay

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.calls.ActiveCallSnapshotHolder
import me.meeshy.app.startup.AppOverlay
import me.meeshy.sdk.model.chrome.TopChromeTint
import me.meeshy.ui.component.chrome.TopChromeBand

/**
 * Peint la bande de la barre d'etat de la couleur de la barre active : appel > audio > banniere.
 * L'appel est branche sur [ActiveCallSnapshotHolder] ; le lecteur audio et la banniere du joueur
 * n'ont pas encore de signal global : ils restent derriere cette couture inerte ([audioIsActive], [bannerArgb]).
 */
class TopChromeBandOverlay @Inject constructor(
    private val callHolder: ActiveCallSnapshotHolder,
) : AppOverlay {
    override val order: Int = 100

    @Composable
    override fun Content(navController: NavHostController) {
        val call by callHolder.snapshot.collectAsState()
        val tint = TopChromeTint.resolve(callIsActive = call != null, audioIsActive = audioIsActive, bannerArgb = bannerArgb)
        TopChromeBand(tint = tint, modifier = Modifier)
    }

    private val audioIsActive: Boolean = false
    private val bannerArgb: Long? = null
}

@Module
@InstallIn(SingletonComponent::class)
internal interface TopChromeBandOverlayModule {
    @Binds
    @IntoSet
    fun bind(overlay: TopChromeBandOverlay): AppOverlay
}
