package me.meeshy.app.notifications

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.game.EngagementRevealCoordinator
import me.meeshy.sdk.model.ApiNotification

/**
 * La première porte de la célébration d'un palier : toucher la notification d'un succès, d'un badge, d'une série ou d'un
 * niveau. La révélation COUVRE l'écran du jeu que le toucher ouvre ; la fermer y laisse arriver.
 */
@HiltViewModel
class EngagementRevealTapViewModel @Inject constructor(
    private val coordinator: EngagementRevealCoordinator,
) : ViewModel() {
    fun onOpened(notification: ApiNotification) = coordinator.onTapped(notification)
}
