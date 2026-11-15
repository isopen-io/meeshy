package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.app.auth.EmailVerificationGateSheet
import me.meeshy.app.startup.AppOverlay
import me.meeshy.sdk.auth.EmailVerificationGateController
import javax.inject.Inject

/**
 * L'hôte de la validation de l'e-mail (#8365) : pose le gardien dans le registre que lit le client HTTP (la
 * construction du contrôleur le fait) et présente la feuille PAR-DESSUS tout — y compris la feuille du composeur,
 * du lien ou de l'invitation qui attend sa réponse — dès qu'une action gardée attend une adresse prouvée.
 * Rien ne s'affiche tant qu'aucune demande n'est en cours.
 */
class EmailVerificationGateHost @Inject constructor(
    private val controller: EmailVerificationGateController,
) : AppOverlay {
    override val order: Int = 60

    @Composable
    override fun Content(navController: NavHostController) {
        val request by controller.request.collectAsStateWithLifecycle()
        request?.let { EmailVerificationGateSheet(request = it) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface EmailVerificationGateHostModule {
    @Binds
    @IntoSet
    fun bind(overlay: EmailVerificationGateHost): AppOverlay
}
