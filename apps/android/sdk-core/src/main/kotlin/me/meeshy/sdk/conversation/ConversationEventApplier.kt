package me.meeshy.sdk.conversation

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.ConversationMergeRules
import me.meeshy.sdk.model.ConversationRestoredSocketEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le point d'entrée des événements de CONVERSATION vers le cache Room (la liste l'observe) : chaque
 * événement se plie EN PLACE par [me.meeshy.sdk.model.ConversationMergeRules], la règle unique que
 * partagent le patch de la liste et la repeinture du cache, sans relire `GET /conversations`.
 * Miroir de l'applicateur d'événements du `ConversationStore` (iOS). La logique ne vit ni dans le
 * dépôt ni dans le ViewModel.
 */
@Singleton
class ConversationEventApplier @Inject constructor(
    private val patcher: ConversationLivePatcher,
) {
    /** `conversation:updated` : remontée en tête, titre, avatar, métadonnées, aperçu et compteur en place. */
    suspend fun applyUpdated(event: ConversationUpdatedSocketEvent): Boolean = patcher.applyUpdated(event)

    /**
     * `conversation:restored` : la conversation revient par UNE lecture bornée par
     * [ConversationMergeRules.RESTORED_READ_TIMEOUT_MILLIS] ; au-delà, le prochain rattrapage la rend.
     */
    suspend fun applyRestored(event: ConversationRestoredSocketEvent) {
        try {
            withTimeoutOrNull(ConversationMergeRules.RESTORED_READ_TIMEOUT_MILLIS) { patcher.discover(event.conversationId) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        }
    }
}
