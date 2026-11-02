package me.meeshy.app.navigation

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/**
 * Le portier de la destination `profile/{userId}` : une notification, un lien profond
 * `meeshy://profile/{monId}` ou `/u/{monPseudo}` y arrivent avec un id quelconque, et
 * c'est ICI, par la regle unique [ProfileRoutes.profileFor], que « c'est moi » bascule
 * sur ma page editable au lieu de la page d'un tiers.
 */
@HiltViewModel
class ProfileRouteGateViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
) : ViewModel() {

    fun resolvesToSelf(userId: String): Boolean = ProfileRoutes.profileFor(
        userId = userId,
        selfId = sessionRepository.currentUserId,
        selfUsername = sessionRepository.currentUser.value?.username,
    ) == ProfileRoutes.OWN
}
