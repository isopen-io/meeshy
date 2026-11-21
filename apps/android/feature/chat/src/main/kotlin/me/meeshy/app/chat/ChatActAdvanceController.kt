package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.game.GameDevicePrefsStore
import me.meeshy.sdk.game.GameMissionsUpdatedBinding
import me.meeshy.sdk.game.GameRealtimeApplier
import me.meeshy.sdk.model.game.GameActAdvance
import me.meeshy.sdk.model.game.GameActAdvanceWatch
import me.meeshy.sdk.model.game.GameMissions

/**
 * L'ACTE DU RÊVE QUI AVANCE, vu à l'envoi (#17367, tranche Android #19717) — miroir d'iOS
 * `ConversationActAdvanceWatch` et du web `watchActAdvance`. Un envoi du lecteur (même détection que la Flamme qui
 * rejoue, [OwnSendDetection]) ARME le guet quinze secondes, le bloc en cache servant d'« avant » ; pendant ce temps,
 * chaque nouvelle lecture du bloc `game` se compare à la précédente par la loi de `:core:model` ([GameActAdvanceWatch]) :
 * `game:updated` porte le bloc, `game:missions-updated` le fait relire UNE fois, le guet armé seulement. [shown] tient
 * l'acte avancé [GameActAdvanceWatch.SHOWN_MILLIS], puis s'efface.
 *
 * Rien hors du guet, rien sous « Jeu masqué », rien pour un invité de lien, et aucune notification n'en découle
 * (#17368). Le serveur décide de la progression : rien n'est recalculé ici.
 */
class ChatActAdvanceController internal constructor(
    private val cached: suspend () -> GameMissions?,
    private val refresh: suspend () -> Unit,
    private val served: Flow<GameMissions?>,
    private val missionsUpdated: Flow<Unit>,
    private val hidden: () -> Boolean,
    private val clock: () -> Long,
) : ChatController {

    @Inject
    constructor(
        progress: EngagementProgressRepository,
        applier: GameRealtimeApplier,
        missions: GameMissionsUpdatedBinding,
        prefs: GameDevicePrefsStore,
    ) : this(
        cached = { progress.cachedProgress()?.game?.missions },
        refresh = { progress.refresh() },
        served = applier.applied.map { it.block.missions },
        missionsUpdated = missions.updated.map { },
        hidden = { prefs.current().hidden },
        clock = System::currentTimeMillis,
    )

    private val _shown = MutableStateFlow<GameActAdvance?>(null)

    /** L'acte qui vient d'avancer, le temps de se lire ; `null` le reste du temps. */
    val shown: StateFlow<GameActAdvance?> = _shown.asStateFlow()

    private var watch = GameActAdvanceWatch()
    private var fetching = false
    private var fading: Job? = null

    override fun attach(host: ChatControllerHost) {
        host.scope.launch {
            var previous: OwnSendDetection.Tail? = null
            host.uiState
                .map { state -> state.messages.lastOrNull()?.let { OwnSendDetection.Tail(it.clientMessageId ?: it.messageId, it.isOutgoing) } }
                .distinctUntilChanged()
                .collect { tail ->
                    val guest = host.uiState.value.composerPermissions != null
                    if (!guest && OwnSendDetection.isNewOwnSend(previous, tail)) arm()
                    previous = tail
                }
        }
        host.scope.launch { served.collect { receive(host, it) } }
        host.scope.launch { missionsUpdated.collect { reread(host) } }
    }

    private suspend fun arm() {
        if (hidden()) return
        val before = readCache()
        watch = watch.armed(clock(), before, hidden = false)
    }

    private fun receive(host: ChatControllerHost, missions: GameMissions?) {
        val reading = watch.received(clock(), missions, hidden())
        watch = reading.watch
        reading.advance?.let { show(host, it) }
    }

    /** `game:missions-updated` ne porte pas l'état : il se relit, le guet armé seulement, une relecture à la fois. */
    private suspend fun reread(host: ChatControllerHost) {
        if (!watch.isArmed(clock()) || fetching) return
        fetching = true
        try {
            refresh()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            fetching = false
            return
        }
        fetching = false
        receive(host, readCache())
    }

    private suspend fun readCache(): GameMissions? = try {
        cached()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }

    private fun show(host: ChatControllerHost, advance: GameActAdvance) {
        _shown.value = advance
        fading?.cancel()
        fading = host.scope.launch {
            delay(GameActAdvanceWatch.SHOWN_MILLIS)
            _shown.value = null
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ChatActAdvanceModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: ChatActAdvanceController): ChatController
}

/** Aucun acte (tests, aperçus, contrôleur absent). */
internal val NO_ACT_ADVANCE: StateFlow<GameActAdvance?> = MutableStateFlow(null)
