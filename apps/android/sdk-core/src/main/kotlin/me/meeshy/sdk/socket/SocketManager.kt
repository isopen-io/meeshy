package me.meeshy.sdk.socket

import me.meeshy.sdk.model.socket.SocketEventNames
import io.socket.client.Socket
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.socket.SocketAuthPayload
import me.meeshy.sdk.model.socket.SocketConnectDecision
import me.meeshy.sdk.model.socket.SocketConnectOutcome
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.Renewal
import me.meeshy.sdk.net.SessionRefresher
import me.meeshy.sdk.net.TokenStore
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** Observable connection lifecycle of the realtime socket. */
enum class SocketConnectionState {
    /** No socket, or torn down by an explicit [SocketManager.disconnect]. */
    DISCONNECTED,

    /** Connecting or auto-reconnecting (socket.io retries forever). */
    CONNECTING,

    CONNECTED,
}

/**
 * Manages the Socket.IO connection lifecycle (ARCHITECTURE.md §3).
 * All feature socket managers register their listeners through [on].
 *
 * Le cycle de connexion est IDEMPOTENT (miroir de `MessageSocketManager.establishTransport`, iOS) :
 * - [connect] ne crée jamais une seconde socket tant qu'une existe (la reconnexion est celle de
 *   Socket.IO) ; [disconnect] ferme, retire les écouteurs et oublie le registre ;
 * - un JWT échu (`exp` moins 30 s) n'ouvre PAS de socket : le renouvellement part en SON nom, puis la
 *   connexion repart avec le jeton frais ;
 * - les écouteurs posés par [on] avant l'ouverture sont gardés et rejoués sur la socket, de sorte
 *   qu'un « connect puis attach » reste valable même quand la connexion attend son renouvellement.
 */
@Singleton
class SocketManager internal constructor(
    private val config: MeeshyConfig,
    private val tokenStore: TokenStore,
    private val factory: SocketFactory,
    private val clientIdentity: SocketClientIdentity,
    private val refresher: SessionRefresher,
    ioDispatcher: CoroutineDispatcher,
    private val nowEpochSeconds: () -> Double,
) {
    @Inject
    constructor(
        config: MeeshyConfig,
        tokenStore: TokenStore,
        factory: SocketFactory,
        clientIdentity: SocketClientIdentity,
        refresher: SessionRefresher,
        @IoDispatcher ioDispatcher: CoroutineDispatcher,
    ) : this(
        config, tokenStore, factory, clientIdentity, refresher, ioDispatcher,
        { System.currentTimeMillis() / 1000.0 },
    )

    private val scope = CoroutineScope(SupervisorJob() + ioDispatcher)
    private val lock = Any()

    private var _socket: RealtimeSocket? = null
    private var refreshJob: Job? = null
    private val registered = mutableListOf<Pair<String, (Array<Any>) -> Unit>>()

    /** Le jeton de compte présenté au handshake du socket courant (`null` pour un invité). */
    @Volatile
    var presentedToken: String? = null
        private set

    private val _connected = MutableSharedFlow<Unit>(replay = 0, extraBufferCapacity = 1)
    private val _disconnected = MutableSharedFlow<Unit>(replay = 0, extraBufferCapacity = 1)
    private val _sessionRevoked = MutableSharedFlow<String?>(replay = 0, extraBufferCapacity = 1)
    private val _socketErrors = MutableSharedFlow<String>(replay = 0, extraBufferCapacity = 8)

    val connected: SharedFlow<Unit> = _connected.asSharedFlow()
    val disconnected: SharedFlow<Unit> = _disconnected.asSharedFlow()

    /** `auth:session-revoked` : la passerelle a fermé CETTE session (motif éventuel). */
    val sessionRevoked: SharedFlow<String?> = _sessionRevoked.asSharedFlow()

    /** Événement `error` du serveur : exposé, jamais cause de déconnexion. */
    val socketErrors: SharedFlow<String> = _socketErrors.asSharedFlow()

    private val _connectionState = MutableStateFlow(SocketConnectionState.DISCONNECTED)
    val connectionState: StateFlow<SocketConnectionState> = _connectionState.asStateFlow()

    val isConnected: Boolean get() = _socket?.isConnected == true

    /** Ouvre la connexion UNE fois ; un second appel ne crée ni socket ni écouteurs. */
    fun connect(): SocketConnectOutcome = synchronized(lock) {
        if (_socket != null) return SocketConnectOutcome.ARMED
        val decision = SocketConnectDecision.decide(tokenStore.jwt, tokenStore.sessionToken, nowEpochSeconds())
        when (decision) {
            SocketConnectDecision.NoCredentials -> SocketConnectOutcome.NOT_ARMED
            is SocketConnectDecision.RefreshFirst -> {
                Timber.w("Socket: JWT expire, renouvellement avant de se connecter")
                refreshThenConnect(decision.presentedJwt)
                SocketConnectOutcome.NOT_ARMED
            }
            else -> open(decision)
        }
    }

    private fun open(decision: SocketConnectDecision): SocketConnectOutcome {
        val auth = SocketAuthPayload.of(decision, clientIdentity.identity()) ?: return SocketConnectOutcome.NOT_ARMED
        _connectionState.value = SocketConnectionState.CONNECTING
        val socket = factory.create(config.socketUrl, auth)
        val presented = (decision as? SocketConnectDecision.ConnectRegistered)?.jwt
        presentedToken = presented
        _socket = socket
        installLifecycleListeners(socket, presented)
        registered.forEach { (event, callback) -> socket.on(event, callback) }
        socket.connect()
        return SocketConnectOutcome.ARMED
    }

    private fun refreshThenConnect(presentedJwt: String) {
        if (refreshJob?.isActive == true) return
        refreshJob = scope.launch {
            val renewal = try {
                refresher.renew(presentedJwt, sentUnderGeneration = null)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.e(failure, "Socket: renouvellement en echec")
                return@launch
            }
            if (renewal is Renewal.Renewed) connect()
        }
    }

    private fun installLifecycleListeners(socket: RealtimeSocket, presented: String?) {
        socket.on(Socket.EVENT_CONNECT) {
            Timber.d("Socket connected")
            _connectionState.value = SocketConnectionState.CONNECTED
            _connected.tryEmit(Unit)
        }
        socket.on(Socket.EVENT_DISCONNECT) { args ->
            Timber.d("Socket disconnected: %s", args.firstOrNull()?.toString() ?: "unknown")
            if (_socket === socket) _connectionState.value = SocketConnectionState.CONNECTING
            _disconnected.tryEmit(Unit)
        }
        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            Timber.e("Socket connect error: %s", args.firstOrNull())
            if (_socket === socket) _connectionState.value = SocketConnectionState.CONNECTING
        }
        socket.on(EVENT_TOKEN_EXPIRED) { onTokenExpired(presented) }
        socket.on(EVENT_SESSION_REVOKED) { args ->
            Timber.w("Socket: session revoked")
            _sessionRevoked.tryEmit(reasonOf(args))
        }
        socket.on(EVENT_ERROR) { args ->
            Timber.w("Socket error event: %s", args.firstOrNull())
            _socketErrors.tryEmit(args.firstOrNull()?.toString().orEmpty())
        }
    }

    /** Rafraichit AU NOM du jeton présenté à ce handshake, jamais de « le compte du moment ». */
    internal fun onTokenExpired(presented: String?) {
        val jwt = presented ?: return
        scope.launch {
            try {
                refresher.renew(jwt, sentUnderGeneration = null)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (@Suppress("TooGenericExceptionCaught") failure: Exception) {
                Timber.e(failure, "Socket: renouvellement sur auth:token-expired en echec")
            }
        }
    }

    private fun reasonOf(args: Array<Any>): String? =
        (args.firstOrNull() as? JSONObject)?.optString("reason")?.takeIf { it.isNotBlank() }

    /** Ferme la socket, retire ses écouteurs et OUBLIE le registre : la session est finie. */
    fun disconnect() = synchronized(lock) {
        closeTransport()
        registered.clear()
    }

    /** Referme puis rouvre avec le jeton courant, en gardant les écouteurs enregistrés. */
    fun reconnectWithToken(): SocketConnectOutcome = synchronized(lock) {
        closeTransport()
        connect()
    }

    private fun closeTransport() {
        refreshJob?.cancel()
        refreshJob = null
        _socket?.let { socket ->
            socket.removeAllListeners()
            socket.disconnect()
        }
        _socket = null
        presentedToken = null
        _connectionState.value = SocketConnectionState.DISCONNECTED
    }

    fun on(event: String, callback: (Array<Any>) -> Unit) {
        synchronized(lock) {
            registered += event to callback
            _socket?.on(event, callback)
        }
    }

    fun emit(event: String, data: JSONObject) {
        _socket?.emit(event, data)
    }

    fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) {
        _socket?.emit(event, data, ack)
    }

    fun joinRoom(room: String) {
        Timber.d("Socket joining room: $room")
    }

    private companion object {
        const val EVENT_TOKEN_EXPIRED = SocketEventNames.AUTH_TOKEN_EXPIRED
        const val EVENT_SESSION_REVOKED = SocketEventNames.AUTH_SESSION_REVOKED
        const val EVENT_ERROR = "error"
    }
}
