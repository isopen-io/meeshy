package me.meeshy.app.startup

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.SendBootReconciler
import timber.log.Timber

/**
 * Au démarrage, une bulle d'envoi orpheline (processus tué entre l'insertion et l'enfilage) est remise d'accord
 * avec la file : `SENDING` sans ligne vivante vers `FAILED` (renvoyable), `FAILED` dont la ligne repart vers `SENDING`.
 * Sur IO, jamais sur le chemin du démarrage.
 */
class SendBootReconcileInitializer @Inject constructor(
    private val reconciler: SendBootReconciler,
) : AppInitializer {
    override fun initialize() {
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                reconciler.reconcile()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "Send boot reconciliation failed")
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface SendBootReconcileModule {
    @Binds
    @IntoSet
    fun sendBootReconcileInitializer(impl: SendBootReconcileInitializer): AppInitializer
}
