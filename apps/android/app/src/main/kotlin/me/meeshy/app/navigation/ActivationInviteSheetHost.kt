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
import me.meeshy.app.auth.ActivationInviteEffect
import me.meeshy.app.auth.ActivationInviteSheet
import me.meeshy.app.auth.ActivationInviteViewModel as InviteSheetViewModel
import me.meeshy.app.startup.AppOverlay

/**
 * L'hote de « Validez votre compte » (iOS `ActivationInviteHost`, #8239) : la feuille vit a la racine, par-dessus
 * la navigation et les feuilles deja ouvertes. L'utilisateur courant et la presence de l'onboarding arrivent au
 * modele, qui decide (une fois par jour civil local, jamais sous l'onboarding). Rien ne se dessine tant que le
 * modele ne l'a pas ouverte.
 */
class ActivationInviteSheetHost @Inject constructor() : AppOverlay {
    override val order: Int = 55

    @Composable
    override fun Content(navController: NavHostController) {
        val viewModel = hiltViewModel<InviteSheetViewModel>()
        val state by viewModel.state.collectAsStateWithLifecycle()
        LaunchedEffect(viewModel) {
            viewModel.effects.collect { effect ->
                when (effect) {
                    ActivationInviteEffect.OpenPhoneSettings -> navController.navigate(Routes.SECURITY) { launchSingleTop = true }
                }
            }
        }
        if (state.isPresented) ActivationInviteSheet(state = state, onEvent = viewModel::onEvent)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ActivationInviteSheetHostModule {
    @Binds
    @IntoSet
    fun bind(overlay: ActivationInviteSheetHost): AppOverlay
}
