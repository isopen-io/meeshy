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
import me.meeshy.sdk.notification.PushPrefetchRepository
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le préchargement d'un push (miroir de `NSEDataSync`, iOS) : message qui arrive, post social, accusé de remise.
 * Branché comme [PushObserver] ; la décision vit dans `PushPrefetchPolicy`, l'écriture dans [PushPrefetchRepository].
 * Le travail saute sur sa propre portée : FCM n'accorde que quelques secondes au fil d'appel.
 */
@Singleton
class PushPrefetchObserver @Inject constructor(
    private val repository: PushPrefetchRepository,
) : PushObserver {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onPush(push: IncomingPush) {
        scope.launch {
            try {
                repository.prefetch(push.payload)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "Préchargement du push en échec")
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PushPrefetchObserverModule {
    @Binds
    @IntoSet
    fun bindPushObserver(observer: PushPrefetchObserver): PushObserver
}
