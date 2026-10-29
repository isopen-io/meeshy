package me.meeshy.sdk.reaction

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Ce qu'une réaction défaite rend au lecteur (#13803) : sur [messageId], [emoji] est de nouveau [stillMine] — faux quand
 * l'ajout est épuisé, vrai quand c'est le retrait.
 */
data class OwnReactionWithdrawal(val messageId: String, val emoji: String, val stillMine: Boolean)

/**
 * **Une réaction que l'outbox abandonne** (refusée en clair vers une conversation chiffrée de bout en bout, #13790, ou essais
 * épuisés) défait sa puce dans le résumé en cache ET la marque « mienne » de l'écran ouvert (#13803) : le résumé seul laissait
 * la puce allumée pour le lecteur. L'outbox l'annonce ici, l'écran de conversation l'écoute.
 */
@Singleton
class OwnReactionWithdrawals @Inject constructor() {
    private val announced = MutableSharedFlow<OwnReactionWithdrawal>(extraBufferCapacity = BUFFER)

    val withdrawals: SharedFlow<OwnReactionWithdrawal> = announced.asSharedFlow()

    fun announce(withdrawal: OwnReactionWithdrawal) {
        announced.tryEmit(withdrawal)
    }

    private companion object {
        const val BUFFER = 32
    }
}
