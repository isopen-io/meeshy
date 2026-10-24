package me.meeshy.sdk.socket

import dagger.Module
import dagger.BindsOptionalOf
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.presence.ViewingCommand
import me.meeshy.sdk.model.presence.ViewingInput
import me.meeshy.sdk.model.presence.ViewingReporterLaw
import me.meeshy.sdk.model.presence.ViewingReporterState
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject
import java.util.Optional
import javax.inject.Inject
import javax.inject.Singleton

/** « Quelque chose dure sans geste » (lecture d'un media, enregistrement) : soutient le battement. */
fun interface ViewingBusyProbe {
    fun isBusy(): Boolean
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ConversationViewingOptionalsModule {
    @BindsOptionalOf
    fun busyProbe(): ViewingBusyProbe
}

/**
 * « Est dans la conversation » (#8892), côté ÉMISSION : dit au serveur quelle conversation
 * l'utilisateur a à l'écran, au premier plan. Miroir de `ConversationViewingReporter` (iOS).
 *
 * La décision (quand émettre) est la loi pure `ViewingReporterLaw` ; cette classe tient l'état,
 * l'horloge et l'émission. Le serveur oublie tout à la déconnexion : chaque (re)connexion
 * ré-annonce la conversation affichée ([onSocketConnected]). Une perte à l'émission (socket
 * fermée) n'est pas rejouée : la reconnexion s'en charge.
 */
@Singleton
class ConversationViewingReporter @Inject constructor(
    private val socketManager: SocketManager,
    private val clock: CacheClock,
    busyProbe: Optional<@JvmSuppressWildcards ViewingBusyProbe>,
) {
    private val lock = Any()
    private val probe: ViewingBusyProbe? = busyProbe.orElse(null)
    private var state = ViewingReporterState()
    private val _announced = MutableStateFlow<String?>(null)

    /** La conversation que le serveur croit à l'écran ; pilote le battement de l'activité. */
    val announced: StateFlow<String?> = _announced.asStateFlow()

    fun conversationOpened(conversationId: String) { dispatch(ViewingInput.Opened(conversationId)) }

    /** Rend `true` quand c'était le DERNIER écran de cette conversation. */
    fun conversationClosed(conversationId: String): Boolean = dispatch(ViewingInput.Closed(conversationId))

    fun setForeground(isForeground: Boolean) { dispatch(ViewingInput.Foreground(isForeground)) }

    fun screenAppeared(conversationId: String) { dispatch(ViewingInput.ScreenAppeared(conversationId)) }

    fun screenDisappeared(conversationId: String) { dispatch(ViewingInput.ScreenDisappeared(conversationId)) }

    fun coverBegan() { dispatch(ViewingInput.CoverBegan) }

    fun coverEnded() { dispatch(ViewingInput.CoverEnded) }

    fun setCallScreenShown(isShown: Boolean) { dispatch(ViewingInput.CallScreen(isShown)) }

    fun activityOccurred(conversationId: String) { dispatch(ViewingInput.Activity(conversationId)) }

    fun scrollingChanged(isScrolling: Boolean) { dispatch(ViewingInput.Scrolling(isScrolling)) }

    fun touched() { dispatch(ViewingInput.Touched) }

    fun onSocketConnected() { dispatch(ViewingInput.Reconnected) }

    fun heartbeat() { dispatch(ViewingInput.Heartbeat(isBusy = probe?.isBusy() == true)) }

    val isCovered: Boolean get() = synchronized(lock) { state.isCovered }

    private fun dispatch(input: ViewingInput): Boolean = synchronized(lock) {
        val step = ViewingReporterLaw.reduce(state, input, clock.nowMillis())
        state = step.state
        _announced.value = step.state.announced
        step.commands.forEach(::emit)
        step.wasLastScreen
    }

    private fun emit(command: ViewingCommand) {
        if (!socketManager.isConnected) return
        when (command) {
            is ViewingCommand.Start -> socketManager.emit(START, payload(command.conversationId))
            is ViewingCommand.Stop -> socketManager.emit(STOP, payload(command.conversationId))
            is ViewingCommand.Activity -> socketManager.emit(
                ACTIVITY,
                payload(command.conversationId).also { if (command.focus) it.put("focus", true) },
            )
        }
    }

    private fun payload(conversationId: String) = JSONObject().put("conversationId", conversationId)

    internal companion object {
        const val START = SocketEventNames.VIEWING_START
        const val STOP = SocketEventNames.VIEWING_STOP
        const val ACTIVITY = SocketEventNames.VIEWING_ACTIVITY
        const val SNAPSHOT = SocketEventNames.VIEWING_SNAPSHOT
    }
}
