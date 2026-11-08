package me.meeshy.sdk.relation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.relation.BringAvailability
import me.meeshy.sdk.model.relation.BringBlockBody
import me.meeshy.sdk.model.relation.RelationReceptionSetting
import me.meeshy.sdk.model.relation.TalkieBlockBody
import me.meeshy.sdk.model.relation.BringSent
import me.meeshy.sdk.model.relation.BringStoppedEvent
import me.meeshy.sdk.model.relation.RelationPersonSettings
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.BringApi
import me.meeshy.sdk.net.api.RelationsApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.socket.RelationSocketEventsManager

/**
 * Ce que l'envoi d'un Bring a donné, rangé par ce que l'écran en DIT (iso `BringSendOutcome` du SDK iOS). Le client ne
 * distingue pas un blocage d'un lien trop bas : [Gone] fait disparaître le bouton, sans raison.
 */
sealed interface BringSendOutcome {
    data class Sent(val sent: BringSent) : BringSendOutcome

    /** 403 — sous Ami, blocage, service coupé : la ligne disparaît. */
    data object Gone : BringSendOutcome

    /** 429 — « Plus de Bring aujourd'hui vers X ». */
    data object Quota : BringSendOutcome

    /** Pas de réseau. */
    data object Offline : BringSendOutcome

    /** Tout le reste (503, panne, réponse illisible) : réessayer. */
    data object Failed : BringSendOutcome

    companion object {
        fun of(error: ApiError): BringSendOutcome = when {
            error.httpStatus == 403 -> Gone
            error.httpStatus == 429 -> Quota
            error.code == "NETWORK" -> Offline
            else -> Failed
        }
    }
}

/**
 * Le Bring de l'EXPÉDITEUR (#16617) — miroir de `BringProviding` + `BringCenter.outgoing` d'iOS.
 *
 * [outgoing] tient, par destinataire, le Bring qui sonne chez lui : il naît d'un envoi réussi et meurt à `bring:stopped`
 * (arrêté par l'un ou l'autre, sur n'importe quel appareil), à son échéance (le serveur n'émet rien à l'expiration), ou à
 * l'annulation, optimiste.
 */
interface BringGateway {
    val outgoing: StateFlow<Map<String, BringSent>>

    /** `null` en panne : la ligne reste absente, rien n'est inventé. */
    suspend fun availability(userId: String): BringAvailability?

    suspend fun send(userId: String): BringSendOutcome

    /** « Annuler » : « Ça sonne » disparaît tout de suite, puis `DELETE /bring/:bringId` arrête la sonnerie chez l'autre. */
    fun cancel(toUserId: String)

    suspend fun personSettings(userId: String): RelationPersonSettings?

    /**
     * Bloque (ou rouvre) une préférence de réception pour cette personne : une source pour le Bring et le talkie. Rend les
     * réglages servis après l'écriture, ou `null` sur un refus : l'appelant rend l'état d'avant.
     */
    suspend fun setReceptionBlocked(userId: String, setting: RelationReceptionSetting, blocked: Boolean): RelationPersonSettings?
}

@Singleton
class BringRepository internal constructor(
    private val api: BringApi,
    private val relations: RelationsApi,
    stopped: Flow<BringStoppedEvent>,
    private val scope: CoroutineScope,
    private val now: () -> Long,
) : BringGateway {

    @Inject
    constructor(api: BringApi, relations: RelationsApi, sockets: RelationSocketEventsManager) : this(
        api = api,
        relations = relations,
        stopped = sockets.bringStopped,
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
        now = System::currentTimeMillis,
    )

    private val _outgoing = MutableStateFlow<Map<String, BringSent>>(emptyMap())
    override val outgoing: StateFlow<Map<String, BringSent>> = _outgoing.asStateFlow()

    init {
        scope.launch { stopped.collect { event -> forget(event.bringId) } }
    }

    override suspend fun availability(userId: String): BringAvailability? =
        (apiCall { api.availability(userId) } as? NetworkResult.Success)?.data
            ?.takeIf { it.userId.equals(userId, ignoreCase = true) }

    override suspend fun send(userId: String): BringSendOutcome = when (val served = apiCall { api.send(userId) }) {
        is NetworkResult.Success -> BringSendOutcome.Sent(served.data).also { track(userId, served.data) }
        is NetworkResult.Failure -> BringSendOutcome.of(served.error)
    }

    override fun cancel(toUserId: String) {
        val ringing = _outgoing.value[toUserId] ?: return
        forget(ringing.bringId)
        scope.launch { apiCall { api.stop(ringing.bringId) } }
    }

    override suspend fun personSettings(userId: String): RelationPersonSettings? =
        (apiCall { relations.settings(userId) } as? NetworkResult.Success)?.data

    override suspend fun setReceptionBlocked(
        userId: String,
        setting: RelationReceptionSetting,
        blocked: Boolean,
    ): RelationPersonSettings? = (
        apiCall {
            when (setting) {
                RelationReceptionSetting.BRING -> relations.setBringBlocked(userId, BringBlockBody(blocked))
                RelationReceptionSetting.TALKIE -> relations.setTalkieBlocked(userId, TalkieBlockBody(blocked))
            }
        } as? NetworkResult.Success
        )?.data

    private fun track(userId: String, sent: BringSent) {
        _outgoing.update { it + (userId to sent) }
        val wait = sent.deadlineMillis(now()) - now()
        scope.launch {
            delay(wait.coerceAtLeast(0L))
            forget(sent.bringId)
        }
    }

    private fun forget(bringId: String) {
        _outgoing.update { current -> current.filterValues { it.bringId != bringId } }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface BringGatewayModule {
    @Binds
    fun bindBringGateway(repository: BringRepository): BringGateway
}
