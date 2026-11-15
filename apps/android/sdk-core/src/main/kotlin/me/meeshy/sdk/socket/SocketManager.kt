package me.meeshy.sdk.socket

import me.meeshy.sdk.model.socket.SocketEventNames
import io.socket.client.Socket
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
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
import me.meeshy.sdk.model.socket.SocketDisconnectPolicy
import me.meeshy.sdk.model.socket.SocketHeartbeatAck
import me.meeshy.sdk.model.socket.SocketLink
import me.meeshy.sdk.model.socket.SocketLinkState
import me.meeshy.sdk.model.socket.SocketReconnectBackoff
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.Renewal
import me.meeshy.sdk.net.SessionRefresher
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.TokenStore
import org.json.JSONObject
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Observable connection lifecycle of the realtime socket — la projection grossière de [SocketLinkState]
 * ([SocketManager.linkState]) pour les appelants qui n'ont besoin que de trois états.
 */
enum class SocketConnectionState {
    /** No socket, torn down by an explicit [SocketManager.disconnect], or suspended in the background. */
    DISCONNECTED,

    /** Connecting or reconnecting (Socket.IO's own loop or the app's backoff ladder). */
    CONNECTING,

    CONNECTED,
}

internal fun SocketLinkState.toConnectionState(): SocketConnectionState = when (link) {
    SocketLink.Disconnected -> SocketConnectionState.DISCONNECTED
    SocketLink.Connecting, is SocketLink.Reconnecting -> SocketConnectionState.CONNECTING
    SocketLink.Connected -> SocketConnectionState.CONNECTED
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
 *
 * Les reconnexions sont PILOTÉES par l'app (miroir de `MessageSocketManager`, iOS) : une coupure décidée par la
 * passerelle ([SocketDisconnectPolicy]) ou une reconstruction sans transport arme l'échelle
 * [SocketReconnectBackoff] (1 s -> 60 s, jitter 0,8-1,2), remise à zéro à la connexion et au retour du réseau ; un
 * battement toutes les 30 s alimente [connectionRTT] ; l'ancien transport est retiré proprement
 * ([SocketTransportRetirement]) ; [suspendForBackground] / [resumeFromBackground] servent l'arrière-plan.
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
    private val jitter: () -> Double = { SocketReconnectBackoff.jitterOf(Math.random()) },
    retirementGraceMs: Long = SocketTransportRetirement.GRACE_MS,
    heartbeatIntervalMs: Long = SocketHeartbeat.INTERVAL_MS,
    private val nowEpochMs: () -> Long = System::currentTimeMillis,
) : SocketLifecycleTarget {
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
    private val heartbeat = SocketHeartbeat(scope, heartbeatIntervalMs, nowEpochMs)
    private val retirement = SocketTransportRetirement(scope, retirementGraceMs)
    private var backoff = SocketReconnectBackoff()
    private var reconnectJob: Job? = null

    /** La socket est suspendue en arrière-plan : aucune reconstruction automatique avant le retour. */
    @Volatile
    private var suspended = false

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
    private val _didReconnect = MutableSharedFlow<Unit>(replay = 0, extraBufferCapacity = 1)
    private val _connectionRTT = MutableStateFlow<Double?>(null)
    private val _socketErrors = MutableSharedFlow<String>(replay = 0, extraBufferCapacity = 8)
    private val _serverErrors = MutableSharedFlow<SocketServerError>(replay = 0, extraBufferCapacity = 8)
    private val _sessionRevocations = MutableSharedFlow<SocketSessionRevocation>(replay = 0, extraBufferCapacity = 8)

    val connected: SharedFlow<Unit> = _connected.asSharedFlow()
    val disconnected: SharedFlow<Unit> = _disconnected.asSharedFlow()

    /** Une connexion qui SUIT une précédente (coupure, retour d'arrière-plan, rotation) : rattraper les manqués. */
    val didReconnect: SharedFlow<Unit> = _didReconnect.asSharedFlow()

    /** Dernier aller-retour mesuré par le battement (ms), `null` tant qu'aucun accusé n'est arrivé. */
    val connectionRTT: StateFlow<Double?> = _connectionRTT.asStateFlow()

    /** `auth:session-revoked` : la passerelle a fermé CETTE session (motif éventuel). */
    val sessionRevoked: SharedFlow<String?> = _sessionRevoked.asSharedFlow()

    /** Événement `error` du serveur : exposé, jamais cause de déconnexion. */
    val socketErrors: SharedFlow<String> = _socketErrors.asSharedFlow()

    /** `auth:session-revoked` avec sa charge brute et le JWT présenté au handshake : `deletedAccountId` y nomme un compte purgé. */
    val sessionRevocations: SharedFlow<SocketSessionRevocation> = _sessionRevocations.asSharedFlow()

    /** Le même événement `error`, marqué du jeton d'invité présenté au handshake de LA socket qui l'a reçu. */
    val serverErrors: SharedFlow<SocketServerError> = _serverErrors.asSharedFlow()

    private val _linkState = MutableStateFlow(SocketLinkState())
    private val _connectionState = MutableStateFlow(SocketConnectionState.DISCONNECTED)

    /** L'état de lien riche : `reconnecting(attempt)` et `hadPreviousConnection`. */
    val linkState: StateFlow<SocketLinkState> = _linkState.asStateFlow()
    val connectionState: StateFlow<SocketConnectionState> = _connectionState.asStateFlow()

    override val isConnected: Boolean get() = _socket?.isConnected == true

    private fun updateLink(transform: (SocketLinkState) -> SocketLinkState) {
        val next = transform(_linkState.value)
        _linkState.value = next
        _connectionState.value = next.toConnectionState()
    }

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
        updateLink { it.opened() }
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
        socket.on(Socket.EVENT_CONNECT) { onTransportConnected(socket) }
        socket.on(Socket.EVENT_DISCONNECT) { args ->
            val reason = args.firstOrNull() as? String
            Timber.d("Socket disconnected: %s", reason ?: "unknown")
            onTransportDisconnected(socket, reason)
        }
        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            Timber.e("Socket connect error: %s", args.firstOrNull())
            if (_socket === socket) updateLink { it.transportLost() }
        }
        socket.on(EVENT_HEARTBEAT_ACK) { args -> onHeartbeatAck(args) }
        socket.on(EVENT_TOKEN_EXPIRED) { onTokenExpired(presented) }
        socket.on(EVENT_SESSION_REVOKED) { args ->
            // Une socket déjà remplacée ou fermée ne parle plus au nom de la session : sa révocation tardive n'est pas livrée.
            if (_socket !== socket) return@on
            Timber.w("Socket: session revoked")
            _sessionRevoked.tryEmit(reasonOf(args))
            _sessionRevocations.tryEmit(SocketSessionRevocation(args.firstOrNull()?.toString().orEmpty(), presented))
        }
        socket.on(EVENT_ERROR) { args ->
            Timber.w("Socket error event: %s", args.firstOrNull())
            val payload = args.firstOrNull()?.toString().orEmpty()
            _socketErrors.tryEmit(payload)
            _serverErrors.tryEmit(SocketServerError(payload, presentedGuestToken, presented))
        }
    }

    private fun onTransportConnected(socket: RealtimeSocket) {
        if (_socket !== socket) return
        var wasReconnect = false
        synchronized(lock) {
            reconnectJob?.cancel()
            reconnectJob = null
            backoff = backoff.reset()
            updateLink { link ->
                link.connected().also { wasReconnect = it.wasReconnect }.state
            }
        }
        startHeartbeat(socket)
        _connected.tryEmit(Unit)
        if (wasReconnect) _didReconnect.tryEmit(Unit)
    }

    private fun onTransportDisconnected(socket: RealtimeSocket, reason: String?) {
        if (_socket === socket) {
            heartbeat.stop()
            updateLink { it.transportLost() }
        }
        _disconnected.tryEmit(Unit)
        if (_socket === socket && SocketDisconnectPolicy.retries(reason)) scheduleReconnect()
    }

    private fun startHeartbeat(socket: RealtimeSocket) {
        heartbeat.start { clientTimeMs ->
            if (_socket === socket && socket.isConnected) {
                socket.emit(EVENT_HEARTBEAT, JSONObject().put("clientTime", clientTimeMs))
            }
        }
    }

    private fun onHeartbeatAck(args: Array<Any>) {
        val payload = args.firstOrNull() as? JSONObject ?: return
        val hint = if (payload.has("latencyHintMs")) payload.optDouble("latencyHintMs").takeUnless { it.isNaN() } else null
        SocketHeartbeatAck.rttMs(hint, payload.optString("serverTime").takeIf { it.isNotBlank() }, nowEpochMs())
            ?.let { _connectionRTT.value = it }
    }

    /**
     * Arme UNE tentative de l'échelle : après le délai du barreau, l'ancien transport est retiré et un nouveau est
     * construit. Sans effet pour une déconnexion demandée ou une socket suspendue. [resetBackoff] repart du plancher
     * (bonne nouvelle : réseau revenu).
     */
    internal fun scheduleReconnect(resetBackoff: Boolean = false) {
        synchronized(lock) {
            if (disconnectRequested || suspended) return
            if (resetBackoff) backoff = backoff.reset()
            reconnectJob?.cancel()
            val step = backoff.next(jitter())
            backoff = step.backoff
            updateLink { it.reconnecting(step.backoff.attempt) }
            reconnectJob = scope.launch {
                delay(step.delayMs)
                rebuildTransport()
            }
        }
    }

    private fun rebuildTransport() {
        val outcome = synchronized(lock) {
            if (disconnectRequested || suspended) return
            if (_socket?.isConnected == true) return
            reconnectJob = null
            retireCurrentTransport()
            connect()
        }
        if (outcome == SocketConnectOutcome.NOT_ARMED && hasCredentials()) scheduleReconnect()
    }

    private fun hasCredentials(): Boolean = !tokenStore.jwt.isNullOrBlank() || !tokenStore.sessionToken.isNullOrBlank()

    /** Retire le transport courant sans fermer les accusés en vol : plus d'écouteur, plus de boucle, fermeture différée. */
    private fun retireCurrentTransport() {
        heartbeat.stop()
        refreshJob?.cancel()
        refreshJob = null
        _socket?.let { socket ->
            socket.removeAllListeners()
            retirement.retire(socket)
        }
        _socket = null
        presentedToken = null
    }

    override fun suspendForBackground() {
        synchronized(lock) {
            suspended = true
            reconnectJob?.cancel()
            reconnectJob = null
            retireCurrentTransport()
            updateLink { it.suspended() }
        }
    }

    override fun resumeFromBackground() {
        val outcome = synchronized(lock) {
            suspended = false
            reconnectJob?.cancel()
            reconnectJob = null
            backoff = backoff.reset()
            if (disconnectRequested || _socket?.isConnected == true) return
            if (_socket != null) retireCurrentTransport()
            connect()
        }
        if (outcome == SocketConnectOutcome.NOT_ARMED && hasCredentials()) scheduleReconnect()
    }

    override fun reconnectAfterNetworkRestored() {
        synchronized(lock) {
            if (disconnectRequested || suspended || _socket?.isConnected == true) return
            backoff = backoff.reset()
            reconnectJob?.cancel()
            reconnectJob = null
        }
        if (callGate.isActive) {
            scheduleReconnect(resetBackoff = true)
        } else {
            rebuildTransport()
        }
    }

    override fun replanReconnect() {
        synchronized(lock) { suspended = false }
        scheduleReconnect()
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
        suspended = false
        closeTransport(keepHistory = false)
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
        closeTransport(keepHistory = true)
        connect()
    }

    private fun closeTransport(keepHistory: Boolean) {
        heartbeat.stop()
        reconnectJob?.cancel()
        reconnectJob = null
        backoff = backoff.reset()
        refreshJob?.cancel()
        refreshJob = null
        _socket?.let { socket ->
            socket.removeAllListeners()
            socket.disconnect()
        }
        _socket = null
        presentedToken = null
        updateLink { if (keepHistory) it.suspended() else it.closed() }
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
        private const val EVENT_HEARTBEAT = "heartbeat"
        private const val EVENT_HEARTBEAT_ACK = SocketEventNames.HEARTBEAT_ACK

        /** L'erreur d'un accusé refusé parce que la session de l'émission est finie (#13566). */
        const val SESSION_ENDED: String = "SESSION_ENDED"
    }
}

/**
 * Un événement `error` du serveur et le jeton d'invité présenté au handshake de la socket qui l'a reçu (`null` pour une
 * socket de compte). Pendant un appel, la coupure d'une socket est différée : son refus doit viser SA session, jamais
 * celle ouverte depuis sur l'appareil.
 */
data class SocketServerError(val payload: String, val guestSessionToken: String?, val accountJwt: String? = null)

/** `auth:session-revoked` : la charge brute et le JWT de compte présenté au handshake de la socket qui l'a reçu (`null` pour un invité). */
data class SocketSessionRevocation(val payload: String, val accountJwt: String?)
