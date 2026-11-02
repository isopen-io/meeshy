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
import me.meeshy.sdk.conversation.MinimalMessageIngest
import me.meeshy.sdk.model.MinimalMessageSeed
import me.meeshy.sdk.net.TokenStore
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pré-persistance d'un message poussé par FCM (miroir du pré-enregistrement de la
 * `NotificationServiceExtension`, iOS) : la graine minimale ([MinimalMessageSeed]) est écrite en
 * Room si le message est absent, pour qu'il soit là à l'ouverture du fil, avant même le REST.
 * Jamais d'écrasement d'un payload riche ([MinimalMessageIngest]) ; rien sans session enregistrée.
 *
 * Branché comme [PushObserver] : [MeeshyFcmService] n'est pas modifié. L'écriture saute sur sa
 * propre portée (FCM n'accorde que quelques secondes au fil d'appel).
 */
@Singleton
class MessagePrePersistObserver @Inject constructor(
    private val ingest: MinimalMessageIngest,
    private val tokenStore: TokenStore,
) : PushObserver {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onPush(push: IncomingPush) {
        // Le miroir PERSISTÉ de l'identité : un processus réveillé à froid par FCM n'a pas encore
        // restauré la session en mémoire, et c'est précisément le cas que la pré-persistance sert.
        if (!tokenStore.isAuthenticated || tokenStore.userId == null) return
        val seed = MinimalMessageSeed.fromPush(push.payload) ?: return
        scope.launch {
            try {
                ingest.ingest(seed)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "Pré-persistance du message poussé en échec")
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface MessagePrePersistModule {
    @Binds
    @IntoSet
    fun bindPushObserver(observer: MessagePrePersistObserver): PushObserver
}
