package me.meeshy.sdk.phonecall

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
import me.meeshy.sdk.model.phonecall.PhoneCallEmitterSettingsBody
import me.meeshy.sdk.model.phonecall.PhoneCallEmitterSettingsWire
import me.meeshy.sdk.model.phonecall.PhoneCallPersonSettingsBody
import me.meeshy.sdk.model.phonecall.PhoneCallPersonSettingsWire
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PhoneCallApi
import me.meeshy.sdk.net.api.RelationsApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache

/** Ce que je partage à une personne, avec le niveau qui décide de ce qu'on peut régler. */
data class PhoneCallPersonSettings(
    val level: RelationLevel,
    val shared: Boolean,
)

/** Les réglages d'« en appel » — côté émetteur (mon profil, la fiche et le profil d'une personne). */
interface PhoneCallSettingsGateway {
    /** « Montrer à mes Sangs que je suis en appel », pour tous : `null` tant qu'il n'est pas connu. */
    val sharingEnabled: StateFlow<Boolean?>

    suspend fun loadSharing(): Boolean?

    /** Optimiste : pose la valeur, revient en arrière sur un refus. Rend `true` si la passerelle l'a prise. */
    suspend fun setSharing(enabled: Boolean): Boolean

    suspend fun personSettings(userId: String): PhoneCallPersonSettings?

    suspend fun setShared(userId: String, shared: Boolean): Boolean
}

/** Les appels REST — isolés pour que les tests les pilotent à la main. */
internal class PhoneCallSettingsCalls(
    val emitter: suspend () -> NetworkResult<PhoneCallEmitterSettingsWire>,
    val setEmitter: suspend (PhoneCallEmitterSettingsBody) -> NetworkResult<PhoneCallEmitterSettingsWire>,
    val person: suspend (String) -> NetworkResult<PhoneCallPersonSettingsWire>,
    val setPerson: suspend (String, PhoneCallPersonSettingsBody) -> NetworkResult<PhoneCallPersonSettingsWire>,
    val level: suspend (String) -> String?,
)

@Singleton
class PhoneCallSettingsRepository internal constructor(
    private val calls: PhoneCallSettingsCalls,
) : PhoneCallSettingsGateway, PerAccountCache {

    @Inject
    constructor(api: PhoneCallApi, relations: RelationsApi) : this(
        PhoneCallSettingsCalls(
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
        val served = calls.setEmitter(PhoneCallEmitterSettingsBody(enabled)).getOrNull()
        _sharingEnabled.value = served?.sharingEnabled ?: before
        return served != null
    }

    override suspend fun personSettings(userId: String): PhoneCallPersonSettings? {
        val wire = calls.person(userId).getOrNull() ?: return null
        val level = RelationLevel.of(calls.level(userId))
        return PhoneCallPersonSettings(level, wire.shared)
    }

    override suspend fun setShared(userId: String, shared: Boolean): Boolean =
        calls.setPerson(userId, PhoneCallPersonSettingsBody(shared = shared)).isSuccess

    override suspend fun clear() {
        _sharingEnabled.value = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PhoneCallSettingsModule {
    @Binds
    fun bindGateway(repository: PhoneCallSettingsRepository): PhoneCallSettingsGateway

    @Binds
    @IntoSet
    fun bindAccountCache(repository: PhoneCallSettingsRepository): PerAccountCache
}
