package me.meeshy.app.push

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.EndToEndRegimeKeeper
import me.meeshy.sdk.net.TokenStore
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * #13794 — un push qui porte `conversationEncryptionMode = e2ee` (#14669) apprend le bout en bout à sa conversation, au
 * même titre que la mémoire locale : réveillée à froid, l'application connaît le régime avant que l'utilisateur ne
 * touche « Répondre ». Le mode servi ne peut qu'AJOUTER le bout en bout au registre, jamais l'en retirer (#12949) ; la
 * réponse rapide relit en plus le mode au serveur hors d'un registre scellé (`PushNotificationActionHandler`).
 */
@Singleton
class EndToEndRegimePushObserver @Inject constructor(
    private val keeper: EndToEndRegimeKeeper,
    private val tokenStore: TokenStore,
) : PushObserver {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Avant la pré-persistance du message et les autres observateurs : le régime d'abord. */
    override val order: Int get() = -10

    override fun onPush(push: IncomingPush) {
        if (!tokenStore.isAuthenticated || tokenStore.userId == null) return
        val conversationId = push.payload.teachesEndToEndTo ?: return
        scope.launch {
            try {
                keeper.learn(conversationId)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "Régime e2ee du push non retenu")
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface EndToEndRegimePushModule {
    @Binds
    @IntoSet
    fun bindPushObserver(observer: EndToEndRegimePushObserver): PushObserver
}
