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
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.SessionClosedNoticeSheet
import me.meeshy.app.auth.SessionRevocationViewModel
import me.meeshy.app.startup.AppOverlay

/**
 * La session a été fermée par le serveur (révoquée, expirée, mot de passe changé...) : le SDK l'a DÉJÀ fermée
 * (`SessionRevocationCenter`), la racine aligne son état sur la fermeture appliquée et une feuille dit POURQUOI avant de
 * redemander la connexion (iOS `SessionClosedNoticeView`). Un compte supprimé n'affiche rien ici : [SessionRefusalOverlay]
 * le traite.
 */
class SessionRevocationOverlay @Inject constructor() : AppOverlay {
    override val order: Int = 8_900

    @Composable
    override fun Content(navController: NavHostController) {
        val revocations: SessionRevocationViewModel = hiltViewModel()
        val auth: AuthViewModel = hiltViewModel()
        val notice by revocations.notice.collectAsStateWithLifecycle()
        val closed by revocations.closed.collectAsStateWithLifecycle()
        LaunchedEffect(closed) {
            if (closed != null) auth.onSessionClosedBySdk()
        }
        notice?.let { current ->
            SessionClosedNoticeSheet(reason = current.reason, onContinue = { revocations.acknowledge(current.id) })
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SessionRevocationOverlayModule {
    @Binds
    @IntoSet
    fun bind(overlay: SessionRevocationOverlay): AppOverlay
}
