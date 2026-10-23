package me.meeshy.sdk.socket

import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.model.net.ClientIdentity
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.SessionRefresher
import org.json.JSONObject
import java.util.Base64

internal const val NOW = 2_000_000.0

internal fun jwtExpiringAt(exp: Double): String {
    val payload = Base64.getUrlEncoder().withoutPadding().encodeToString("""{"exp":$exp}""".toByteArray())
    return "h.$payload.s"
}

internal val validJwt: String = jwtExpiringAt(NOW + 3_600)
internal val expiredJwt: String = jwtExpiringAt(NOW + 29)

internal class FakeRealtimeSocket(val auth: Map<String, Any>) : RealtimeSocket {
    val listeners = mutableListOf<Pair<String, (Array<Any>) -> Unit>>()
    var connectCalls = 0
    var disconnectCalls = 0
    var removedAll = false
    var live = false
    val emitted = mutableListOf<String>()

    override val isConnected: Boolean get() = live
    override fun on(event: String, listener: (Array<Any>) -> Unit) {
        listeners += event to listener
    }
    override fun removeAllListeners() {
        removedAll = true
        listeners.clear()
    }
    override fun connect() {
        connectCalls++
    }
    override fun disconnect() {
        disconnectCalls++
        live = false
    }
    override fun emit(event: String, data: JSONObject) {
        emitted += event
    }
    override fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) {
        emitted += event
    }

    fun fire(event: String, vararg args: Any) = listeners.filter { it.first == event }.forEach { it.second(arrayOf<Any>(*args)) }
    fun count(event: String) = listeners.count { it.first == event }
}

internal class FakeSocketFactory : SocketFactory {
    val created = mutableListOf<FakeRealtimeSocket>()
    override fun create(url: String, auth: Map<String, Any>): RealtimeSocket =
        FakeRealtimeSocket(auth).also { created += it }
}

internal val testIdentity = ClientIdentity(
    appVersion = "2.4.0", appBuild = "240", deviceName = "Pixel", osVersion = "Android 15",
    timezone = "Europe/Paris", localeTag = "fr-FR", country = "FR",
)

internal class SocketRig(
    jwt: String? = validJwt,
    session: String? = "sess",
    val renewTo: String? = validJwt,
) {
    val store = InMemoryTokenStore(jwt = jwt, sessionToken = session)
    val factory = FakeSocketFactory()
    val refreshCalls = mutableListOf<String>()
    private val refresher = SessionRefresher(store, nowEpochSeconds = { NOW }) { sessionToken ->
        refreshCalls += sessionToken
        renewTo
    }
    val manager = SocketManager(
        config = MeeshyConfig(apiBaseUrl = "http://x", socketUrl = "http://x"),
        tokenStore = store,
        factory = factory,
        clientIdentity = { testIdentity },
        refresher = refresher,
        ioDispatcher = Dispatchers.Unconfined,
        nowEpochSeconds = { NOW },
    )
}
