package me.meeshy.sdk.battery

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.battery.BatteryReading
import me.meeshy.sdk.model.battery.BatteryReportBody
import me.meeshy.sdk.model.battery.BatteryReportCadence
import me.meeshy.sdk.model.battery.BatteryReportTrigger
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.BatteryApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository

/** La lecture de MA batterie — l'app la branche sur `BatteryManager` ; `null` quand la plateforme ne dit rien. */
interface DeviceBatteryReader {
    fun read(): BatteryReading?

    /** Le nom de l'appareil, tel que les Proches le liront (« Pixel 8 ») ; `null` pour ne rien dire. */
    val deviceLabel: String?
}

/** Envoie mes relevés selon la cadence du contrat ; la passerelle seule décide des paliers. */
interface BatteryReporting {
    /** Rend `true` si un relevé est parti et que la passerelle l'a pris. */
    suspend fun report(trigger: BatteryReportTrigger): Boolean

    /** Le délai avant le prochain battement (critique, débranché), `null` s'il n'y en a pas. */
    fun heartbeatDelayMs(): Long?
}

/** Les branchements du rapporteur — isolés pour que les tests les pilotent à la main. */
internal class BatteryReporterPorts(
    val reader: DeviceBatteryReader,
    val send: suspend (BatteryReportBody) -> Boolean,
    val signedIn: () -> Boolean,
    val sharingEnabled: () -> Boolean?,
    val now: () -> Long,
)

/**
 * MES RELEVÉS (#14147). Au-dessus de 30 % : une tranche de 5 ; à 30 % ou moins : chaque palier ; à 5 % ou moins : chaque
 * point et un battement de 60 s tant que l'app a du temps d'exécution ; et toujours sur une demande (`battery:pull-requested`,
 * push `battery_pull`) ou la tâche périodique. Un relevé refusé n'est pas retenu : le suivant repart. Rien ne part hors
 * session ni quand j'ai coupé le partage.
 */
@Singleton
class BatteryReporter internal constructor(
    private val ports: BatteryReporterPorts,
) : BatteryReporting, PerAccountCache {

    @Inject
    constructor(
        api: BatteryApi,
        reader: DeviceBatteryReader,
        sessionRepository: SessionRepository,
        settings: BatterySettingsGateway,
    ) : this(
        BatteryReporterPorts(
            reader = reader,
            send = { body -> apiCall { api.report(body) } is NetworkResult.Success },
            signedIn = { sessionRepository.currentUserId != null },
            sharingEnabled = { settings.sharingEnabled.value },
            now = System::currentTimeMillis,
        ),
    )

    private val mutex = Mutex()
    private var lastReading: BatteryReading? = null
    private var lastSentAtMs: Long? = null

    override suspend fun report(trigger: BatteryReportTrigger): Boolean = mutex.withLock {
        if (!ports.signedIn() || ports.sharingEnabled() == false) return@withLock false
        val current = ports.reader.read() ?: return@withLock false
        val now = ports.now()
        if (!BatteryReportCadence.shouldReport(lastReading, lastSentAtMs, current, trigger, now)) return@withLock false
        val body = BatteryReportBody(
            level = current.level,
            charging = current.charging,
            lowPower = current.lowPower,
            measuredAt = Instant.ofEpochMilli(now).toString(),
            deviceLabel = ports.reader.deviceLabel,
        )
        val accepted = ports.send(body)
        if (accepted) {
            lastReading = current
            lastSentAtMs = now
        }
        accepted
    }

    override fun heartbeatDelayMs(): Long? {
        val current = ports.reader.read() ?: return null
        return BatteryReportCadence.heartbeatDelayMs(current, lastSentAtMs, ports.now())
    }

    override suspend fun clear() {
        mutex.withLock {
            lastReading = null
            lastSentAtMs = null
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface BatteryReporterModule {
    @Binds
    fun bindReporting(reporter: BatteryReporter): BatteryReporting

    @Binds
    @IntoSet
    fun bindAccountCache(reporter: BatteryReporter): PerAccountCache
}
