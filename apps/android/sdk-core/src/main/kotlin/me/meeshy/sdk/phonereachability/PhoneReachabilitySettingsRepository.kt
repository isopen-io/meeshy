package me.meeshy.sdk.phonereachability

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.phonereachability.PhoneAliveResultWire
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityEmitterSettings
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityEmitterSettingsBody
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPersonSettingsBody
import me.meeshy.sdk.model.phonereachability.PhoneReachabilityPersonSettingsWire
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PhoneReachabilityApi
import me.meeshy.sdk.net.api.RelationsApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache

/** Ce que je partage à une personne, avec le niveau qui décide de ce qu'on peut m'offrir. */
data class PhoneReachabilityPersonSettings(
    val level: RelationLevel,
    val shared: Boolean,
)

/** Les réglages du téléphone injoignable — côté émetteur (mon profil, la fiche et le profil d'une personne). */
interface PhoneReachabilitySettingsGateway {
    /** « Prévenir mes Proches si mon téléphone est injoignable », pour tous : `null` tant qu'il n'est pas connu. */
    val sharingEnabled: StateFlow<Boolean?>

    suspend fun loadSharing(): Boolean?

    /** Optimiste : pose la valeur, revient en arrière sur un refus. Rend `true` si la passerelle l'a prise. */
    suspend fun setSharing(enabled: Boolean): Boolean

    suspend fun personSettings(userId: String): PhoneReachabilityPersonSettings?

    suspend fun setShared(userId: String, shared: Boolean): Boolean
}

/** Les appels REST — isolés pour que les tests les pilotent à la main. */
internal class PhoneReachabilitySettingsCalls(
    val emitter: suspend () -> NetworkResult<PhoneReachabilityEmitterSettings>,
    val setEmitter: suspend (PhoneReachabilityEmitterSettingsBody) -> NetworkResult<PhoneReachabilityEmitterSettings>,
    val person: suspend (String) -> NetworkResult<PhoneReachabilityPersonSettingsWire>,
    val setPerson: suspend (String, PhoneReachabilityPersonSettingsBody) -> NetworkResult<PhoneReachabilityPersonSettingsWire>,
    val level: suspend (String) -> String?,
)

@Singleton
class PhoneReachabilitySettingsRepository internal constructor(
    private val calls: PhoneReachabilitySettingsCalls,
) : PhoneReachabilitySettingsGateway, PerAccountCache {

    @Inject
    constructor(api: PhoneReachabilityApi, relations: RelationsApi) : this(
        PhoneReachabilitySettingsCalls(
            emitter = { apiCall { api.emitterSettings() } },
            setEmitter = { body -> apiCall { api.setEmitterSettings(body) } },
            person = { userId -> apiCall { api.personSettings(userId) } },
            setPerson = { userId, body -> apiCall { api.setPersonSettings(userId, body) } },
            level = { userId ->
                (apiCall { relations.byUserId(userId) } as? NetworkResult.Success)?.data?.let { it.accessLevel ?: it.effectiveLevel }
            },
        ),
    )

    private val _sharingEnabled = MutableStateFlow<Boolean?>(null)
    override val sharingEnabled: StateFlow<Boolean?> = _sharingEnabled.asStateFlow()

    override suspend fun loadSharing(): Boolean? {
        val served = calls.emitter().getOrNull()?.sharingEnabled ?: return _sharingEnabled.value
        _sharingEnabled.value = served
        return served
    }

    override suspend fun setSharing(enabled: Boolean): Boolean {
        val before = _sharingEnabled.value
        _sharingEnabled.value = enabled
        val served = calls.setEmitter(PhoneReachabilityEmitterSettingsBody(enabled)).getOrNull()
        _sharingEnabled.value = served?.sharingEnabled ?: before
        return served != null
    }

    override suspend fun personSettings(userId: String): PhoneReachabilityPersonSettings? {
        val wire = calls.person(userId).getOrNull() ?: return null
        val level = RelationLevel.of(calls.level(userId))
        return PhoneReachabilityPersonSettings(level, wire.shared)
    }

    override suspend fun setShared(userId: String, shared: Boolean): Boolean =
        calls.setPerson(userId, PhoneReachabilityPersonSettingsBody(shared = shared)).isSuccess

    override suspend fun clear() {
        _sharingEnabled.value = null
    }
}

/** La réponse du téléphone à une sonde silencieuse (`device_probe`) : `POST /me/device/alive`. */
fun interface PhoneAliveReporting {
    /** Rend `true` quand la passerelle a reçu le signe de vie ; une panne ne lève rien. */
    suspend fun reportAlive(): Boolean
}

class PhoneAliveReporter internal constructor(
    private val call: suspend () -> NetworkResult<PhoneAliveResultWire>,
) : PhoneAliveReporting {
    @Inject
    constructor(api: PhoneReachabilityApi) : this({ apiCall { api.alive() } })

    override suspend fun reportAlive(): Boolean = runCatching { call().isSuccess }.getOrDefault(false)
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PhoneReachabilitySettingsModule {
    @Binds
    fun bindGateway(repository: PhoneReachabilitySettingsRepository): PhoneReachabilitySettingsGateway

    @Binds
    @IntoSet
    fun bindAccountCache(repository: PhoneReachabilitySettingsRepository): PerAccountCache

    @Binds
    fun bindAlive(reporter: PhoneAliveReporter): PhoneAliveReporting
}
