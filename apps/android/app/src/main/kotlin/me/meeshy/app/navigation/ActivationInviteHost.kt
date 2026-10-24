package me.meeshy.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavHostController
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.startup.AppOverlay
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.UserActivationRules
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.component.ActivationInviteBanner
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Le bandeau discret « Validez votre compte » (phase `invite`, #8239) pose au-dessus du `NavHost` :
 * jamais une fenetre bloquante. Il suit [SessionRepository.currentUser], donc il se rafraichit a
 * chaque `/auth/me` et des qu'un canal est prouve (la phase quitte `invite` ou `missing` se vide).
 */
class ActivationInviteHost @Inject constructor(
    private val sessionRepository: SessionRepository,
) : AppOverlay {
    override val order: Int = 50

    @Composable
    override fun Content(navController: NavHostController) {
        val user by sessionRepository.currentUser.collectAsState()
        var dismissed by rememberSaveable { mutableStateOf(false) }
        val activation = user?.activation
        val invite = remember(activation) {
            UserActivationRules.invite(activation, System.currentTimeMillis())
        }
        if (dismissed || invite == null) return
        Box(modifier = Modifier.fillMaxSize()) {
            ActivationInviteBanner(
                invite = invite,
                title = stringResource(R.string.activation_invite_banner_title),
                message = invite.daysLeft?.let { stringResource(R.string.activation_invite_banner_days, it) }
                    ?: stringResource(R.string.activation_invite_banner_no_days),
                dismissLabel = stringResource(R.string.activation_invite_banner_later),
                onOpen = { navController.navigate(Routes.SECURITY) },
                onDismiss = { dismissed = true },
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            )
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ActivationInviteHostModule {
    @Binds
    @IntoSet
    fun bind(overlay: ActivationInviteHost): AppOverlay
}
