package me.meeshy.sdk.fall

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.fall.FallPersonSettingsBody
import me.meeshy.sdk.model.fall.FallPersonSettingsWire
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.FallApi
import me.meeshy.sdk.net.api.RelationsApi
import me.meeshy.sdk.net.apiCall

/** Ce que je partage à une personne, avec le niveau qui décide de ce qu'on peut régler. */
data class FallPersonSettings(val level: RelationLevel, val shared: Boolean)

/**
 * Le réglage par personne de la chute détectée (#18748) : « Prévenir si ma montre détecte une chute ». Android ne
 * recueille AUCUN accord (l'accord se donne dans l'app iPhone, qui seule lit l'Apple Watch) ; il règle seulement à qui
 * la chute serait servie.
 */
interface FallSettingsGateway {
    suspend fun personSettings(userId: String): FallPersonSettings?

    /** Rend `true` si la passerelle l'a pris ; l'écran revient en arrière sinon. */
    suspend fun setShared(userId: String, shared: Boolean): Boolean
}

internal class FallSettingsCalls(
    val person: suspend (String) -> NetworkResult<FallPersonSettingsWire>,
    val setPerson: suspend (String, FallPersonSettingsBody) -> NetworkResult<FallPersonSettingsWire>,
    val level: suspend (String) -> String?,
)

@Singleton
class FallSettingsRepository internal constructor(private val calls: FallSettingsCalls) : FallSettingsGateway {

    @Inject
    constructor(api: FallApi, relations: RelationsApi) : this(
        FallSettingsCalls(
            person = { userId -> apiCall { api.personSettings(userId) } },
            setPerson = { userId, body -> apiCall { api.setPersonSettings(userId, body) } },
            level = { userId ->
                (apiCall { relations.byUserId(userId) } as? NetworkResult.Success)?.data?.let { it.accessLevel ?: it.effectiveLevel }
            },
        ),
    )

    override suspend fun personSettings(userId: String): FallPersonSettings? {
        val wire = calls.person(userId).getOrNull() ?: return null
        return FallPersonSettings(RelationLevel.of(calls.level(userId)), wire.shared)
    }

    override suspend fun setShared(userId: String, shared: Boolean): Boolean =
        calls.setPerson(userId, FallPersonSettingsBody(shared = shared)).isSuccess
}

@Module
@InstallIn(SingletonComponent::class)
internal interface FallSettingsModule {
    @Binds
    fun bindGateway(repository: FallSettingsRepository): FallSettingsGateway
}
