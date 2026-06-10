package me.meeshy.sdk.session

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import me.meeshy.core.common.ApplicationScope
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.sync.ConversationSyncEngine
import timber.log.Timber
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Binds the realtime stack to the session lifecycle (ARCHITECTURE.md §3):
 * a signed-in identity connects the socket, attaches the messaging event
 * listeners and starts the sync engine; a cleared identity tears it down.
 */
@Singleton
class SessionLifecycleOrchestrator @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val socketManager: SocketManager,
    private val messageSocketManager: MessageSocketManager,
    private val syncEngine: ConversationSyncEngine,
    @ApplicationScope private val scope: CoroutineScope,
) {
    private val started = AtomicBoolean(false)

    fun start() {
        if (!started.compareAndSet(false, true)) return

        sessionRepository.currentUser
            .map { it?.id }
            .distinctUntilChanged()
            .onEach { userId ->
                if (userId != null) {
                    Timber.d("Session active ($userId) — connecting realtime stack")
                    socketManager.connect()
                    messageSocketManager.attach()
                    syncEngine.start()
                } else {
                    Timber.d("Session cleared — disconnecting realtime stack")
                    socketManager.disconnect()
                }
            }
            .launchIn(scope)
    }
}
