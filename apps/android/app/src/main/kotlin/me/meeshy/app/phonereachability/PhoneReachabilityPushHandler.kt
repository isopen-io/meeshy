package me.meeshy.app.phonereachability

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.app.battery.ForegroundProbe
import me.meeshy.app.push.IncomingPush
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityContract
import me.meeshy.sdk.phonereachability.PhoneAliveReporting
import me.meeshy.sdk.phonereachability.PhoneReachabilityForegroundNotice
import me.meeshy.sdk.phonereachability.PhoneReachabilityForegroundNotices

/** La réponse à une sonde silencieuse, dans le temps que FCM accorde. */
fun interface PhoneProbeResponder {
    fun respond()
}

/**
 * Les deux pushes du téléphone injoignable (#18737), avant le chemin des messages qui en ferait une bannière ordinaire :
 * - `device_probe` (silencieux) : le serveur sonde CE téléphone ; il répond par `POST /me/device/alive`, jamais une
 *   bannière ;
 * - `device_unreachable` app OUVERTE : la SyncPill défile l'annonce À LA PLACE de la bannière, jamais les deux. App
 *   fermée, ou aucune pastille montée, la bannière part comme tout push (son toucher ouvre le profil de l'émetteur).
 */
@Singleton
class PhoneReachabilityPushHandler @Inject constructor(
    private val notices: PhoneReachabilityForegroundNotices,
    private val foreground: ForegroundProbe,
    private val responder: PhoneProbeResponder,
) {
    /** `true` quand le push est traité ici ; `false` laisse passer le chemin suivant. */
    fun handle(push: IncomingPush): Boolean = when (push.payload.type ?: push.data["type"]) {
        PhoneReachabilityContract.PROBE_PUSH_TYPE -> {
            responder.respond()
            true
        }
        PhoneReachabilityContract.NOTIFICATION_TYPE -> foreground.isForeground() && announce(push)
        else -> false
    }

    private fun announce(push: IncomingPush): Boolean {
        val label = listOfNotNull(push.payload.title ?: push.notificationTitle, push.payload.body ?: push.notificationBody)
            .map(String::trim)
            .filter(String::isNotEmpty)
            .joinToString(" · ")
        if (label.isEmpty()) return false
        val id = "phone:push:${push.payload.notificationId ?: label}"
        return notices.offer(PhoneReachabilityForegroundNotice(id, label))
    }
}

class AliveProbeResponder @Inject constructor(private val reporter: PhoneAliveReporting) : PhoneProbeResponder {
    override fun respond() {
        runCatching { runBlocking { withTimeoutOrNull(ALIVE_BUDGET_MS) { reporter.reportAlive() } } }
    }

    private companion object {
        const val ALIVE_BUDGET_MS = 8_000L
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PhoneReachabilityPushModule {
    @Binds
    fun bindResponder(responder: AliveProbeResponder): PhoneProbeResponder
}
