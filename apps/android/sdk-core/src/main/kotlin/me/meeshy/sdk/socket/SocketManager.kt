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
import me.meeshy.sdk.call.CallActivityGate
import me.meeshy.sdk.model.socket.SocketAuthPayload
import me.meeshy.sdk.model.socket.SocketConnectDecision
import me.meeshy.sdk.model.socket.SocketConnectOutcome
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.Renewal
import me.meeshy.sdk.net.SessionRefresher
import me.meeshy.sdk.net.SessionTransitionFlags
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
    private val callGate: CallActivityGate,
    private val transition: SessionTransitionFlags = SessionTransitionFlags(),
) {
    @Inject
    constructor(
        config: MeeshyConfig,
        tokenStore: TokenStore,
        factory: SocketFactory,
        clientIdentity: SocketClientIdentity,
        refresher: SessionRefresher,
        @IoDispatcher ioDispatcher: CoroutineDispatcher,
        callGate: CallActivityGate,
        transition: SessionTransitionFlags,
    ) : this(
        config, tokenStore, factory, clientIdentity, refresher, ioDispatcher,
        { System.currentTimeMillis() / 1000.0 },
        callGate,
        transition,
    )

    internal constructor(
        config: MeeshyConfig,
        tokenStore: TokenStore,
        factory: SocketFactory,
        clientIdentity: SocketClientIdentity,
        refresher: SessionRefresher,
        ioDispatcher: CoroutineDispatcher,
        nowEpochSeconds: () -> Double,
    ) : this(
        config, tokenStore, factory, clientIdentity, refresher, ioDispatcher, nowEpochSeconds,
        CallActivityGate(),
    )

    private val scope = CoroutineScope(SupervisorJob() + ioDispatcher)
    private val lock = Any()

    private var _socket: RealtimeSocket? = null

    /** The session ([SessionTransitionFlags.generation]) the current socket was opened under (#13558). */
    @Volatile
    private var openedUnder: Long = 0L

    @Volatile
    private var staleReopenScheduled = false

    /** A [disconnect] a call deferred: the session is over, nothing may replace it with a reopen (#13558). */
    @Volatile
    private var disconnectRequested = false

    /** A [connect] the next session asked for while a call deferred the previous one's disconnect (#13566). */
    private var connectAfterDisconnect = false
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
    private val _serverErrors = MutableSharedFlow<SocketServerError>(replay = 0, extraBufferCapacity = 8)

    val connected: SharedFlow<Unit> = _connected.asSharedFlow()
    val disconnected: SharedFlow<Unit> = _disconnected.asSharedFlow()

    /** `auth:session-revoked` : la passerelle a fermé CETTE session (motif éventuel). */
    val sessionRevoked: SharedFlow<String?> = _sessionRevoked.asSharedFlow()

    /** Événement `error` du serveur : exposé, jamais cause de déconnexion. */
    val socketErrors: SharedFlow<String> = _socketErrors.asSharedFlow()

    /** Le même événement `error`, marqué du jeton d'invité présenté au handshake de LA socket qui l'a reçu. */
    val serverErrors: SharedFlow<SocketServerError> = _serverErrors.asSharedFlow()

    private val _connectionState = MutableStateFlow(SocketConnectionState.DISCONNECTED)
    val connectionState: StateFlow<SocketConnectionState> = _connectionState.asStateFlow()

    val isConnected: Boolean get() = _socket?.isConnected == true

    /** Ouvre la connexion UNE fois ; un second appel ne crée ni socket ni écouteurs. */
    fun connect(): SocketConnectOutcome = synchronized(lock) {
        if (disconnectRequested) {
            connectAfterDisconnect = true
            return SocketConnectOutcome.ARMED
        }
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
        openedUnder = transition.generation
        staleReopenScheduled = false
        val presented = (decision as? SocketConnectDecision.ConnectRegistered)?.jwt
        presentedToken = presented
        _socket = socket
        installLifecycleListeners(socket, presented, (decision as? SocketConnectDecision.ConnectGuest)?.sessionToken)
        registered.forEach { (event, callback) -> socket.on(event, boundToSession(socket, callback)) }
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

    private fun installLifecycleListeners(socket: RealtimeSocket, presented: String?, presentedGuestToken: String?) {
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
            val payload = args.firstOrNull()?.toString().orEmpty()
            _socketErrors.tryEmit(payload)
            _serverErrors.tryEmit(SocketServerError(payload, presentedGuestToken))
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

    /**
     * Ferme la socket, retire ses écouteurs et OUBLIE le registre : la session est finie.
     * Pendant un appel actif la coupure est différée à sa fin ([CallActivityGate]) ; le registre, lui, est oublié
     * TOUT DE SUITE : les écouteurs qu'un compte connecté pendant l'appel pose ensuite sont les siens, et la fin de
     * l'appel lui rouvre une socket au lieu de les vider (#13566).
     */
    fun disconnect() {
        synchronized(lock) {
            disconnectRequested = true
            connectAfterDisconnect = false
            registered.clear()
        }
        callGate.runOrDefer { disconnectNow() }
    }

    private fun disconnectNow() = synchronized(lock) {
        disconnectRequested = false
        closeTransport()
        if (connectAfterDisconnect) {
            connectAfterDisconnect = false
            connect()
        }
    }

    /**
     * Referme puis rouvre avec le jeton courant, en gardant les écouteurs enregistrés. Pendant un
     * appel actif la rotation est différée à sa fin et rend l'issue courante (ARMED si ouverte).
     * Une déconnexion demandée garde le dessus : la porte d'appel ne retient qu'UNE action, et une
     * rotation qui la remplacerait garderait le registre de la session finie (#13558).
     */
    fun reconnectWithToken(): SocketConnectOutcome {
        var outcome: SocketConnectOutcome? = null
        val ran = callGate.runOrDefer { outcome = rotateUnlessDisconnecting() }
        if (ran) return outcome ?: SocketConnectOutcome.NOT_ARMED
        return if (_socket != null) SocketConnectOutcome.ARMED else SocketConnectOutcome.NOT_ARMED
    }

    private fun rotateUnlessDisconnecting(): SocketConnectOutcome {
        if (!disconnectRequested) return reconnectNow()
        disconnectNow()
        return SocketConnectOutcome.NOT_ARMED
    }

    private fun reconnectNow(): SocketConnectOutcome = synchronized(lock) {
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
            if (!disconnectRequested) _socket?.let { socket -> socket.on(event, boundToSession(socket, callback)) }
        }
    }

    /**
     * #13558 : a socket opened under a session that has since ended (logout whose disconnect a call deferred, an account
     * adopted over a live one) never hands its events on — they belong to the account that left. The first stale event
     * reopens the transport under the current credentials (deferred to the call's end like any rotation).
     */
    private fun boundToSession(socket: RealtimeSocket, callback: (Array<Any>) -> Unit): (Array<Any>) -> Unit {
        val generation = openedUnder
        return { args ->
            if (transition.generation == generation) {
                callback(args)
            } else {
                reopenStale(socket)
            }
        }
    }

    private fun reopenStale(socket: RealtimeSocket) {
        synchronized(lock) {
            if (_socket !== socket || staleReopenScheduled || disconnectRequested) return
            staleReopenScheduled = true
        }
        Timber.w("Socket: session terminee, evenement jete et socket rouverte")
        scope.launch { rotateStale(socket) }
    }

    /** Rouvre [socket] sous la session courante, une seule fois : une autre socket l'a peut-être déjà remplacée. */
    private fun rotateStale(socket: RealtimeSocket) {
        callGate.runOrDefer {
            synchronized(lock) {
                when {
                    disconnectRequested -> disconnectNow()
                    _socket === socket -> reconnectNow()
                }
            }
        }
    }

    /**
     * #13566 : une émission part au nom de la session COURANTE, donc jamais par une socket ouverte sous une session
     * finie (elle porte le jeton du compte parti). Hors appel, la socket périmée est rouverte sous la session courante
     * et l'émission part par elle ; pendant l'appel qui diffère cette réouverture, l'émission est refusée.
     */
    fun emit(event: String, data: JSONObject) {
        socketOfCurrentSession()?.first?.emit(event, data)
    }

    /**
     * Comme [emit] ; l'appelant reçoit toujours une issue : un refus ([SESSION_ENDED]) quand l'émission ne peut partir,
     * ou quand l'accusé arrive après la fin de la session qui l'a émise — sa charge n'est jamais livrée.
     */
    fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) {
        val (socket, generation) = socketOfCurrentSession() ?: return ack(sessionEndedAck())
        socket.emit(event, data) { args ->
            if (transition.generation == generation) ack(args) else ack(sessionEndedAck())
        }
    }

    private fun socketOfCurrentSession(): Pair<RealtimeSocket, Long>? {
        val stale = synchronized(lock) {
            val socket = _socket ?: return null
            if (openedUnder == transition.generation) return socket to openedUnder
            socket
        }
        Timber.w("Socket: emission sous une session terminee, socket rouverte avant d'emettre")
        rotateStale(stale)
        return synchronized(lock) {
            _socket?.takeIf { openedUnder == transition.generation }?.let { it to openedUnder }
        }
    }

    private fun sessionEndedAck(): Array<Any> =
        arrayOf(JSONObject().put("success", false).put("error", SESSION_ENDED))

    fun joinRoom(room: String) {
        Timber.d("Socket joining room: $room")
    }

    companion object {
        private const val EVENT_TOKEN_EXPIRED = SocketEventNames.AUTH_TOKEN_EXPIRED
        private const val EVENT_SESSION_REVOKED = SocketEventNames.AUTH_SESSION_REVOKED
        private const val EVENT_ERROR = "error"

        /** L'erreur d'un accusé refusé parce que la session de l'émission est finie (#13566). */
        const val SESSION_ENDED: String = "SESSION_ENDED"
    }
}

/**
 * Un événement `error` du serveur et le jeton d'invité présenté au handshake de la socket qui l'a reçu (`null` pour une
 * socket de compte). Pendant un appel, la coupure d'une socket est différée : son refus doit viser SA session, jamais
 * celle ouverte depuis sur l'appareil.
 */
data class SocketServerError(val payload: String, val guestSessionToken: String?)
