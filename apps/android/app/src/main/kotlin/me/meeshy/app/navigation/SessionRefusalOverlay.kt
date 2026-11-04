package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.auth.AgeRefusalScreen
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.SessionClosedScreen
import me.meeshy.app.auth.SessionRefusalScreen
import me.meeshy.app.auth.SessionRefusalViewModel
import me.meeshy.app.startup.AppOverlay

/**
 * Les deux refus de session qui couvrent l'app (iOS `ageGateOverlay` + retrait d'un compte supprimé) : « session fermée »
 * quand le compte a été supprimé ailleurs, « Meeshy est réservé aux 13 ans et plus » pour un mineur. Pleine page, un seul
 * bouton, aucun retour vers l'écran refusé. Hors ligne ou sur un 401 ordinaire, aucun des deux ne se lève : le réseau ne
 * signale que les refus nommés.
 */
class SessionRefusalOverlay @Inject constructor() : AppOverlay {
    override val order: Int = 9_000

    @Composable
    override fun Content(navController: NavHostController) {
        val refusals: SessionRefusalViewModel = hiltViewModel()
        val auth: AuthViewModel = hiltViewModel()
        val screen by refusals.screen.collectAsStateWithLifecycle()
        // L'appareil est déjà purgé : la racine retombe sur la connexion.
        LaunchedEffect(screen) {
            if (screen == SessionRefusalScreen.SESSION_CLOSED) auth.onExternalSessionOpened()
        }
        when (screen) {
            SessionRefusalScreen.SESSION_CLOSED -> SessionClosedScreen(onContinue = { refusals.acknowledgeClosed() })
            SessionRefusalScreen.AGE_BELOW_MINIMUM -> AgeRefusalScreen(onAcknowledge = {
                if (refusals.acknowledgeAge()) auth.logout()
            })
            null -> Unit
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SessionRefusalOverlayModule {
    @Binds
    @IntoSet
    fun bind(overlay: SessionRefusalOverlay): AppOverlay
}
