package me.meeshy.sdk.packs

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.collectArrived
import timber.log.Timber

/**
 * Branche `game:updated` sur mon compte : le solde de Meeshes d'un achat ou d'un gain fait sur un autre appareil se voit
 * aussitôt dans la boutique. Chaque événement s'écrit sous le compte auquel il est ARRIVÉ ([collectArrived]), jamais sous
 * celui qui est courant quand on le traite : l'événement de A qui attend encore son collecteur quand B se connecte ne
 * touche pas le solde de B.
 */
@Singleton
class GameBalanceSocketBinding @Inject constructor(
    private val messages: MessageSocketManager,
    private val repository: PackShopRepository,
    @IoDispatcher private val io: CoroutineDispatcher,
) : RealtimeBinding {

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        live.launch {
            try {
                messages.gameUpdated.collectArrived { event ->
                    try {
                        repository.onGameUpdated(event, repository.installationTicket())
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Timber.e(e, "Solde de Meeshes temps réel en échec")
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Timber.e(e, "Solde de Meeshes temps réel en échec")
            }
        }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class GameBalanceRealtimeModule {
    @Binds
    @IntoSet
    abstract fun bindRealtime(binding: GameBalanceSocketBinding): RealtimeBinding
}
