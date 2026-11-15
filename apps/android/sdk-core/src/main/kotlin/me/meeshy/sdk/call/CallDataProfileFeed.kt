package me.meeshy.sdk.call

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.call.CallDataProfile
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le relais du profil de données courant, de l'orchestrateur de l'appel vers la feuille de qualité et le journal réseau
 * (iOS `CallQualityStatsFeed.profile` et `CallNetworkJournalRecorder.lastProfile`). `null` hors appel : aucune pastille
 * fantôme. Ne dépend ni du moteur ni de la pile WebRTC.
 */
@Singleton
public class CallDataProfileFeed @Inject constructor() {
    private val latest = MutableStateFlow<CallDataProfile?>(null)

    public val profile: StateFlow<CallDataProfile?> = latest.asStateFlow()

    public fun publish(profile: CallDataProfile?) {
        latest.value = profile
    }
}
