package me.meeshy.sdk.game

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
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.model.GameRealtimeDecision
import me.meeshy.sdk.model.GameRealtimeRule
import me.meeshy.sdk.model.game.GameRevisionState
import me.meeshy.sdk.model.game.GameUpdatedEvent
import me.meeshy.sdk.socket.EngagementChannel
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

/**
 * Applique `game:updated` à l'état du jeu tenu (miroir d'iOS `ProgressionViewModel.receive`) : un état STRICTEMENT plus
 * ancien que le dernier appliqué est ignoré ; un bloc que ce client ne sait pas lire n'est jamais une erreur, il fait
 * relire la progression ([refetch]) ; un état lisible et plus récent est tenu et annoncé sur [applied] aux écrans de
 * flamme, de ligues et de profil quand ils existent. Hors de ces écrans l'événement ne fait aucun bruit. La relecture
 * qui échoue garde ce qui est peint.
 */
@Singleton
class GameRealtimeApplier(private val refetch: suspend () -> Unit) {

    @Inject
    constructor(progress: EngagementProgressRepository) : this({ progress.refresh() })

    @Volatile private var held: GameRevisionState? = null

    private val _applied = MutableSharedFlow<GameRevisionState>(extraBufferCapacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    /** Les états de jeu lisibles et récents, dans l'ordre où ils sont appliqués. */
    val applied: SharedFlow<GameRevisionState> = _applied.asSharedFlow()

    suspend fun onEvent(event: GameUpdatedEvent): GameRealtimeDecision {
        val decision = GameRealtimeRule.decide(held, event)
        when (decision) {
            GameRealtimeDecision.Ignore -> Unit
            is GameRealtimeDecision.Apply -> {
                held = decision.state
                _applied.tryEmit(decision.state)
            }
            GameRealtimeDecision.Refetch -> relire()
        }
        return decision
    }

    /** Oublie l'état tenu (déconnexion, changement de compte). */
    fun reset() {
        held = null
    }

    private suspend fun relire() {
        try {
            refetch()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w(failure, "Relecture de la progression en échec")
        }
    }
}

/** Branche `game:updated` du [EngagementChannel] sur l'applicateur pour toute la durée de la session. */
@Singleton
class GameRealtimeBinding @Inject constructor(
    private val channel: EngagementChannel,
    private val applier: GameRealtimeApplier,
    @IoDispatcher private val io: CoroutineDispatcher,
) : RealtimeBinding {

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        live.launch {
            try {
                channel.gameUpdated.collect { event ->
                    try {
                        applier.onEvent(event)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        Timber.e(e, "Progression de jeu temps réel en échec")
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Timber.e(e, "Progression de jeu temps réel en échec")
            }
        }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
        applier.reset()
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class GameRealtimeModule {
    @Binds
    @IntoSet
    abstract fun bindRealtime(binding: GameRealtimeBinding): RealtimeBinding
}
