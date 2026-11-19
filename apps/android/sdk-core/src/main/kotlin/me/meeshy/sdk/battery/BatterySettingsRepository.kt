package me.meeshy.sdk.battery

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
import me.meeshy.sdk.model.battery.BatteryEmitterSettings
import me.meeshy.sdk.model.battery.BatteryEmitterSettingsBody
import me.meeshy.sdk.model.battery.BatteryPersonSettingsBody
import me.meeshy.sdk.model.battery.BatteryPersonSettingsWire
import me.meeshy.sdk.model.battery.BatteryPullResultWire
import me.meeshy.sdk.model.battery.BatteryReceiveMode
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.BatteryApi
import me.meeshy.sdk.net.api.RelationsApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache

/** Ce que je partage à une personne et ce que je reçois d'elle, avec le niveau qui décide de ce qu'on peut m'offrir. */
data class BatteryPersonSettings(
    val level: RelationLevel,
    val shared: Boolean,
    val receive: BatteryReceiveMode,
)

/** L'issue d'un « Demander un relevé » : la passerelle borne la demande, l'interface dit pourquoi. */
sealed interface BatteryPullOutcome {
    /** Demandé ; [episodeOnly] = l'autre n'est pas en épisode, son état ne me sera servi que s'il en ouvre un. */
    data class Requested(val episodeOnly: Boolean) : BatteryPullOutcome
    data object TooSoon : BatteryPullOutcome
    data object Forbidden : BatteryPullOutcome
    data object Unavailable : BatteryPullOutcome
}

/** Les réglages de la batterie des Proches — côté émetteur (profil, fiche) et côté lecteur (réglages de conversation). */
interface BatterySettingsGateway {
    /** « Partager ma batterie », pour tous : `null` tant qu'il n'est pas connu. */
    val sharingEnabled: StateFlow<Boolean?>

    suspend fun loadSharing(): Boolean?

    /** Optimiste : pose la valeur, revient en arrière sur un refus. Rend `true` si la passerelle l'a prise. */
    suspend fun setSharing(enabled: Boolean): Boolean

    suspend fun personSettings(userId: String): BatteryPersonSettings?

    suspend fun setShared(userId: String, shared: Boolean): Boolean

    suspend fun setReceive(userId: String, mode: BatteryReceiveMode): Boolean

    suspend fun pull(userId: String): BatteryPullOutcome
}

/** Les appels REST — isolés pour que les tests les pilotent à la main. */
internal class BatterySettingsCalls(
    val emitter: suspend () -> NetworkResult<BatteryEmitterSettings>,
    val setEmitter: suspend (BatteryEmitterSettingsBody) -> NetworkResult<BatteryEmitterSettings>,
    val person: suspend (String) -> NetworkResult<BatteryPersonSettingsWire>,
    val setPerson: suspend (String, BatteryPersonSettingsBody) -> NetworkResult<BatteryPersonSettingsWire>,
    val pull: suspend (String) -> NetworkResult<BatteryPullResultWire>,
    val level: suspend (String) -> String?,
)

@Singleton
class BatterySettingsRepository internal constructor(
    private val calls: BatterySettingsCalls,
) : BatterySettingsGateway, PerAccountCache {

    @Inject
    constructor(api: BatteryApi, relations: RelationsApi) : this(
        BatterySettingsCalls(
            emitter = { apiCall { api.emitterSettings() } },
            setEmitter = { body -> apiCall { api.setEmitterSettings(body) } },
            person = { userId -> apiCall { api.personSettings(userId) } },
            setPerson = { userId, body -> apiCall { api.setPersonSettings(userId, body) } },
            pull = { userId -> apiCall { api.pull(userId) } },
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
        val served = calls.setEmitter(BatteryEmitterSettingsBody(enabled)).getOrNull()
        _sharingEnabled.value = served?.sharingEnabled ?: before
        return served != null
    }

    override suspend fun personSettings(userId: String): BatteryPersonSettings? {
        val wire = calls.person(userId).getOrNull() ?: return null
        val level = RelationLevel.of(calls.level(userId))
        return BatteryPersonSettings(level, wire.shared, wire.receiveMode)
    }

    override suspend fun setShared(userId: String, shared: Boolean): Boolean =
        calls.setPerson(userId, BatteryPersonSettingsBody(shared = shared)).isSuccess

    override suspend fun setReceive(userId: String, mode: BatteryReceiveMode): Boolean =
        calls.setPerson(userId, BatteryPersonSettingsBody(receive = mode.wire)).isSuccess

    override suspend fun pull(userId: String): BatteryPullOutcome = when (val result = calls.pull(userId)) {
        is NetworkResult.Success -> BatteryPullOutcome.Requested(result.data.episodeOnly)
        is NetworkResult.Failure -> refusal(result.error)
    }

    override suspend fun clear() {
        _sharingEnabled.value = null
    }

    private fun refusal(error: ApiError): BatteryPullOutcome = when (error.code) {
        "BATTERY_PULL_TOO_SOON", "BATTERY_RATE_LIMITED" -> BatteryPullOutcome.TooSoon
        "BATTERY_PULL_FORBIDDEN" -> BatteryPullOutcome.Forbidden
        else -> BatteryPullOutcome.Unavailable
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface BatterySettingsModule {
    @Binds
    fun bindGateway(repository: BatterySettingsRepository): BatterySettingsGateway

    @Binds
    @IntoSet
    fun bindAccountCache(repository: BatterySettingsRepository): PerAccountCache
}
