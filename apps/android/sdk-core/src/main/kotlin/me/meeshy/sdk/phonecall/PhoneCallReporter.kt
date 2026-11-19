package me.meeshy.sdk.phonecall

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.phonecall.PhoneCallAckWire
import me.meeshy.sdk.model.phonecall.PhoneCallReportBody
import me.meeshy.sdk.model.phonecall.PhoneCallReportPolicy
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PhoneCallApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.session.SessionRepository

/** Mon téléphone est-il en appel ? L'app le lit sur le mode audio, SANS permission ; `null` quand il ne dit rien. */
fun interface DeviceCallReader {
    fun isInCall(): Boolean?
}

/** Rapporte « en appel » / « plus en appel » au changement ; la passerelle seule décide qui le voit. */
fun interface PhoneCallReporting {
    /** Rend `true` si un rapport est parti et que la passerelle l'a pris. */
    suspend fun report(): Boolean
}

/** Les branchements du rapporteur — isolés pour que les tests les pilotent à la main. */
internal class PhoneCallReporterPorts(
    val reader: DeviceCallReader,
    val send: suspend (PhoneCallReportBody) -> NetworkResult<PhoneCallAckWire>,
    val signedIn: () -> Boolean,
    val sharingEnabled: () -> Boolean?,
)

/**
 * MES RAPPORTS « EN APPEL » (#18753) : `POST /me/device/call { active }` quand la valeur CHANGE par rapport au dernier
 * rapport accepté ([PhoneCallReportPolicy.shouldReport]) — et le premier de la session toujours, pour clore un appel que
 * l'app n'a pas vu finir. Un rapport refusé n'est pas retenu : le suivant repart. Partage coupé : rien ne part, et le
 * dernier rapport est oublié, pour que rouvrir le partage rapporte l'état courant. Jamais d'interlocuteur.
 */
@Singleton
class PhoneCallReporter internal constructor(
    private val ports: PhoneCallReporterPorts,
) : PhoneCallReporting, PerAccountCache {

    @Inject
    constructor(
        api: PhoneCallApi,
        reader: DeviceCallReader,
        sessionRepository: SessionRepository,
        settings: PhoneCallSettingsGateway,
    ) : this(
        PhoneCallReporterPorts(
            reader = reader,
            send = { body -> apiCall { api.report(body) } },
            signedIn = { sessionRepository.currentUserId != null },
            sharingEnabled = { settings.sharingEnabled.value },
        ),
    )

    private val mutex = Mutex()
    private var lastAccepted: Boolean? = null

    override suspend fun report(): Boolean = mutex.withLock {
        val sharing = ports.sharingEnabled()
        if (sharing == false) lastAccepted = null
        val current = ports.reader.isInCall() ?: return@withLock false
        if (!PhoneCallReportPolicy.shouldReport(lastAccepted, current, ports.signedIn(), sharing)) return@withLock false
        val accepted = ports.send(PhoneCallReportBody(active = current)) is NetworkResult.Success
        if (accepted) lastAccepted = current
        accepted
    }

    override suspend fun clear() {
        mutex.withLock { lastAccepted = null }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PhoneCallReporterModule {
    @Binds
    fun bindReporting(reporter: PhoneCallReporter): PhoneCallReporting

    @Binds
    @IntoSet
    fun bindAccountCache(reporter: PhoneCallReporter): PerAccountCache
}
