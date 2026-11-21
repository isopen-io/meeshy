package me.meeshy.sdk.inactivity

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.inactivity.InactivityDelayChoice
import me.meeshy.sdk.model.inactivity.InactivityPersonSettingsBody
import me.meeshy.sdk.model.inactivity.InactivityPersonSettingsWire
import me.meeshy.sdk.model.inactivity.WellnessOkResultWire
import me.meeshy.sdk.model.inactivity.WellnessSettingsBody
import me.meeshy.sdk.model.inactivity.WellnessSettingsWire
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.InactivityApi
import me.meeshy.sdk.net.api.RelationsApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache

/** Ce que je partage à une personne, avec le niveau qui décide de ce qu'on peut régler. */
data class InactivityPersonSettings(
    val level: RelationLevel,
    val shared: Boolean,
)

/** Les réglages de la vérification d'inactivité — côté émetteur (mon profil, la fiche et le profil d'une personne). */
interface InactivitySettingsGateway {
    /** Le délai choisi (ou la coupure) : `null` tant qu'il n'est pas connu. */
    val delay: StateFlow<InactivityDelayChoice?>

    suspend fun loadDelay(): InactivityDelayChoice?

    /** Optimiste : pose la valeur, revient en arrière sur un refus. Rend `true` si la passerelle l'a prise. */
    suspend fun setDelay(choice: InactivityDelayChoice): Boolean

    suspend fun personSettings(userId: String): InactivityPersonSettings?

    suspend fun setShared(userId: String, shared: Boolean): Boolean
}

/** Les appels REST — isolés pour que les tests les pilotent à la main. */
internal class InactivitySettingsCalls(
    val delay: suspend () -> NetworkResult<WellnessSettingsWire>,
    val setDelay: suspend (InactivityDelayChoice) -> NetworkResult<WellnessSettingsWire>,
    val person: suspend (String) -> NetworkResult<InactivityPersonSettingsWire>,
    val setPerson: suspend (String, InactivityPersonSettingsBody) -> NetworkResult<InactivityPersonSettingsWire>,
    val level: suspend (String) -> String?,
)

@Singleton
class InactivitySettingsRepository internal constructor(
    private val calls: InactivitySettingsCalls,
) : InactivitySettingsGateway, PerAccountCache {

    @Inject
    constructor(api: InactivityApi, relations: RelationsApi) : this(
        InactivitySettingsCalls(
            delay = { apiCall { api.wellnessSettings() } },
            setDelay = { choice -> apiCall { api.setWellnessSettings(WellnessSettingsBody.of(choice)) } },
            person = { userId -> apiCall { api.personSettings(userId) } },
            setPerson = { userId, body -> apiCall { api.setPersonSettings(userId, body) } },
            level = { userId ->
                (apiCall { relations.byUserId(userId) } as? NetworkResult.Success)?.data?.let { it.accessLevel ?: it.effectiveLevel }
            },
        ),
    )

    private val _delay = MutableStateFlow<InactivityDelayChoice?>(null)
    override val delay: StateFlow<InactivityDelayChoice?> = _delay.asStateFlow()

    override suspend fun loadDelay(): InactivityDelayChoice? {
        val served = calls.delay().getOrNull()?.choice() ?: return _delay.value
        _delay.value = served
        return served
    }

    override suspend fun setDelay(choice: InactivityDelayChoice): Boolean {
        val before = _delay.value
        _delay.value = choice
        val served = calls.setDelay(choice).getOrNull()
        _delay.value = served?.choice() ?: before
        return served != null
    }

    override suspend fun personSettings(userId: String): InactivityPersonSettings? {
        val wire = calls.person(userId).getOrNull() ?: return null
        val level = RelationLevel.of(calls.level(userId))
        return InactivityPersonSettings(level, wire.shared)
    }

    override suspend fun setShared(userId: String, shared: Boolean): Boolean =
        calls.setPerson(userId, InactivityPersonSettingsBody(shared = shared)).isSuccess

    override suspend fun clear() {
        _delay.value = null
    }
}

/** « Je vais bien » : `POST /me/wellness/ok`, la réponse à « Tout va bien ? ». */
fun interface WellnessReporting {
    /** Rend `true` quand la passerelle a reçu la réponse ; une panne ne lève rien. */
    suspend fun reportOk(): Boolean
}

class WellnessReporter internal constructor(
    private val call: suspend () -> NetworkResult<WellnessOkResultWire>,
) : WellnessReporting {
    @Inject
    constructor(api: InactivityApi) : this({ apiCall { api.wellnessOk() } })

    override suspend fun reportOk(): Boolean = runCatching { call().isSuccess }.getOrDefault(false)
}

/**
 * Les annonces d'un push `inactivity_alert` reçu app ouverte : la SyncPill les rend À LA PLACE de la bannière, sans
 * doublon. [id] est celui de la notification, pour qu'un même push ne défile qu'une fois ; [personKey] est la
 * personne restée inactive, la MÊME clé que l'annonce du socket : la pastille n'affiche qu'une ligne par personne.
 */
data class InactivityForegroundNotice(val id: String, val label: String, val personKey: String = id)

@Singleton
class InactivityForegroundNotices @Inject constructor() {
    private val _notices = MutableSharedFlow<InactivityForegroundNotice>(extraBufferCapacity = 16)
    val notices: SharedFlow<InactivityForegroundNotice> = _notices.asSharedFlow()

    /** Rend `false` quand personne n'écoute (aucune pastille montée) : la bannière doit alors partir. */
    fun offer(notice: InactivityForegroundNotice): Boolean =
        _notices.subscriptionCount.value > 0 && _notices.tryEmit(notice)
}

@Module
@InstallIn(SingletonComponent::class)
internal interface InactivitySettingsModule {
    @Binds
    fun bindGateway(repository: InactivitySettingsRepository): InactivitySettingsGateway

    @Binds
    @IntoSet
    fun bindAccountCache(repository: InactivitySettingsRepository): PerAccountCache

    @Binds
    fun bindWellness(reporter: WellnessReporter): WellnessReporting
}
