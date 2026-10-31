package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserActivationRules
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.component.ActivationInviteBand

/** L'utilisateur courant, seule entree du bandeau : il suit chaque `/auth/me` et chaque canal prouve. */
@HiltViewModel
class ActivationInviteViewModel @Inject constructor(
    sessionRepository: SessionRepository,
) : ViewModel() {
    val currentUser: StateFlow<MeeshyUser?> = sessionRepository.currentUser
}

/**
 * Le bandeau discret « Validez votre compte » (phase `invite`, #8239) : jamais une fenetre bloquante. Il n'est plus
 * peint PAR-DESSUS la navigation (#13854 : translucide, il se melait au ✕ du compositeur) — il se range au-dessus
 * d'elle, opaque, et la destination commence dessous ([ActivationInviteBand]). « Plus tard » le retire pour la
 * session, et la destination reprend toute la hauteur.
 */
@Composable
internal fun ActivationInviteBandHost(
    navController: NavHostController,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val user by hiltViewModel<ActivationInviteViewModel>().currentUser.collectAsStateWithLifecycle()
    var dismissed by rememberSaveable { mutableStateOf(false) }
    val activation = user?.activation
    val invite = remember(activation) {
        UserActivationRules.invite(activation, System.currentTimeMillis())
    }?.takeUnless { dismissed }
    ActivationInviteBand(
        invite = invite,
        title = stringResource(R.string.activation_invite_banner_title),
        message = invite?.daysLeft?.let { stringResource(R.string.activation_invite_banner_days, it) }
            ?: stringResource(R.string.activation_invite_banner_no_days),
        dismissLabel = stringResource(R.string.activation_invite_banner_later),
        onOpen = { navController.navigate(Routes.SECURITY) },
        onDismiss = { dismissed = true },
        modifier = modifier,
        content = content,
    )
}
