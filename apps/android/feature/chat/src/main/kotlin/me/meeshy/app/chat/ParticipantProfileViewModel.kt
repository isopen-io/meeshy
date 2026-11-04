package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.filter
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.ParticipantProfileCache
import me.meeshy.sdk.conversation.ParticipantProfileKey
import me.meeshy.sdk.model.ApiParticipantProfile
import me.meeshy.sdk.model.EntryLinkSettings
import me.meeshy.sdk.model.ParticipantCapability
import me.meeshy.sdk.model.ParticipantCardPresenter
import me.meeshy.sdk.model.ParticipantInfoRow
import me.meeshy.sdk.model.ParticipantProfileLive
import me.meeshy.sdk.model.ParticipantRightsUpdatedEvent
import me.meeshy.sdk.model.with
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import me.meeshy.sdk.socket.MessageSocketManager
import javax.inject.Inject

enum class ProfileLoadStatus {
    Idle,
    Loading,
    Loaded,

    /** « Fiche indisponible » : la synchro a échoué et aucune copie n'existe. */
    Error,

    /** 404 : « Cette personne a quitté la conversation ». */
    Left,
}

/**
 * Tout ce que la fiche d'un participant a besoin de savoir pour se peindre.
 *
 * Les quatre états que le critère de fin de #3943 exige — posé, retiré, en vol,
 * erreur — sont ici, et le Composable n'en dérive aucun : une vue qui recalcule
 * un état finit par en afficher un cinquième que personne n'a prévu.
 */
data class ParticipantProfileUiState(
    val status: ProfileLoadStatus = ProfileLoadStatus.Idle,
    val profile: ApiParticipantProfile? = null,
    val grantWriteInFlight: Boolean = false,
    val grantFailed: Boolean = false,
    val rightsWriteInFlight: Boolean = false,
    val rightsFailed: Boolean = false,
) {
    /** Le serveur a servi `entryLink` : c'est SA réponse à « puis-je écrire ». Jamais déduit d'un rang. */
    val canEditRights: Boolean get() = profile?.let(ParticipantCardPresenter::canEditRights) == true

    /** Les huit interrupteurs (ou moins) : les droits que la charge dit. */
    val editableCapabilities: List<ParticipantCapability>
        get() = profile?.let(ParticipantCardPresenter::editableCapabilities).orEmpty()

    val infoRows: List<ParticipantInfoRow>
        get() = profile?.let(ParticipantCardPresenter::infoRows).orEmpty()

    val linkSettings: EntryLinkSettings?
        get() = profile?.entryLink?.let(ParticipantCardPresenter::linkSettings)

    fun isGranted(capability: ParticipantCapability): Boolean =
        profile?.entryCapabilities?.isAllowed(capability) == true

    /**
     * **Le SIGNAL du serveur, jamais une déduction.**
     *
     * Le rang ne suffit pas à répondre : un modérateur LIT l'octroi sans
     * pouvoir l'écrire, et `historyVisibleFrom: null` ne distingue pas « pas
     * hôte » de « hôte, aucun octroi posé ». Déduire le droit d'un rang
     * afficherait un contrôle qui échouerait en 403.
     */
    val canGrantHistory: Boolean get() = profile?.canGrantHistory == true

    /** L'octroi affiché — `null` quand il n'y en a pas, ou que le lecteur n'est pas hôte. */
    val historyVisibleFrom: String? get() = profile?.historyVisibleFrom

    /**
     * Ce que ce visiteur ne peut PAS faire, dans l'ordre d'affichage. La règle
     * vit dans `ParticipantEntryCapabilities.denied` (`core:model`), partagée
     * avec le SDK Swift et le web : trois clients qui la réécrivent chacun de
     * leur côté finissent par dire trois choses différentes.
     */
    val deniedCapabilities: List<ParticipantCapability>
        get() = profile?.entryCapabilities?.denied.orEmpty()
}

/**
 * La fiche d'un participant (#3943) — troisième client du geste « voit
 * l'historique depuis le \<date\> » que iOS et web rendent depuis #3877.
 *
 * Aucune décision d'autorisation ici : le gateway sert ce que le lecteur a le
 * droit de voir (`email`, `entryLink`, `historyVisibleFrom` reviennent `null` à
 * un non-hôte) et dit s'il a le droit d'écrire (`canGrantHistory`). Ce
 * ViewModel transporte, il n'arbitre pas.
 *
 * Architecture : UDF (`ARCHITECTURE.md` §3, ADR-008) — un `UiState` unique en
 * `StateFlow`, le Composable en simple rendu.
 */
@HiltViewModel
class ParticipantProfileViewModel @Inject constructor(
    private val conversationRepository: ConversationRepository,
    private val cache: ParticipantProfileCache,
    private val conversationEvents: ConversationSocketEventsManager,
    private val messageSocket: MessageSocketManager,
    private val session: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ParticipantProfileUiState())
    val state: StateFlow<ParticipantProfileUiState> = _state.asStateFlow()

    /**
     * La fiche que l'écran montre — conversation, participant et rôle du lecteur. Chaque coroutine capture la
     * sienne et ne pose rien si elle n'est plus la courante : sans cette garde, la réponse tardive de A se peignait
     * et se mettait en cache sous B, et l'interrupteur écrivait sur B les droits de A (audit #15733).
     */
    private data class Target(val conversationId: String, val participantId: String, val readerRole: String?)

    private var target: Target? = null
    private var loadJob: Job? = null
    private var liveJob: Job? = null

    /**
     * [participantId] est un `Participant.id`, **jamais** un `User.id` : le
     * sujet de cette fiche est souvent un visiteur venu par un lien partagé,
     * qui n'a aucune ligne `User`. Les gestes voisins de l'écran des membres
     * (promouvoir, retirer, bannir) prennent l'autre colonne — la ressemblance
     * des deux chemins est un piège, pas une symétrie.
     *
     * Sans [readerRole], la copie n'est ni lue ni écrite : la garde de rôle du cache (ADR-032) ne peut pas jouer,
     * et les champs réservés aux hôtes attendent la synchro.
     */
    fun load(conversationId: String, participantId: String, readerRole: String? = null) {
        val next = Target(conversationId, participantId, readerRole)
        val sameTarget = next == target
        target = next
        loadJob?.cancel()
        val cached = cacheKey(next)?.let { cache.get(it, readerRole) }
        // Cache-first : une fiche en cache est peinte tout de suite ; le chargement n'apparaît que sur cache vide.
        _state.update {
            val base = if (sameTarget) it else ParticipantProfileUiState()
            if (cached != null) base.copy(status = ProfileLoadStatus.Loaded, profile = cached)
            else base.copy(status = ProfileLoadStatus.Loading)
        }
        observeLive(next)
        loadJob = viewModelScope.launch {
            val result = conversationRepository.participantProfile(conversationId, participantId)
            if (target != next) return@launch
            when (result) {
                is NetworkResult.Success -> {
                    remember(next, result.data)
                    _state.update { it.copy(status = ProfileLoadStatus.Loaded, profile = result.data) }
                }
                is NetworkResult.Failure -> onSyncFailure(next, result.error.httpStatus)
            }
        }
    }

    /**
     * 404 : la personne a quitté la conversation. 401/403 : ce lecteur n'a plus le droit de la voir — la copie et
     * ses champs réservés aux hôtes partent. Seule une panne de transport ou un 5xx garde la fiche peinte.
     */
    /** La fiche se ferme : ses écouteurs de la room et sa requête s'arrêtent ; la réouverture les relance. */
    fun close() {
        liveJob?.cancel()
        liveJob = null
        loadJob?.cancel()
        loadJob = null
    }

    private fun onSyncFailure(of: Target, httpStatus: Int?) {
        if (httpStatus == 404 || httpStatus == 401 || httpStatus == 403) {
            cacheKey(of)?.let(cache::evict)
            val status = if (httpStatus == 404) ProfileLoadStatus.Left else ProfileLoadStatus.Error
            _state.update { it.copy(status = status, profile = null) }
            return
        }
        _state.update {
            if (it.profile != null) it else it.copy(status = ProfileLoadStatus.Error)
        }
    }

    private fun cacheKey(of: Target): ParticipantProfileKey? {
        if (of.readerRole == null) return null
        val reader = session.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        return ParticipantProfileKey(reader, of.conversationId, of.participantId)
    }

    private fun remember(of: Target, profile: ApiParticipantProfile) {
        cacheKey(of)?.let { cache.put(it, of.readerRole, profile) }
    }

    /** Une écriture lancée sur une autre fiche que la courante : sa copie est périmée, la prochaine ouverture relit. */
    private fun forgetStale(of: Target) {
        cacheKey(of)?.let(cache::evict)
    }

    private fun observeLive(of: Target) {
        liveJob?.cancel()
        liveJob = viewModelScope.launch {
            launch {
                conversationEvents.events
                    .filterIsInstance<ParticipantRightsUpdatedEvent>()
                    .filter { it.conversationId == of.conversationId && it.participantId == of.participantId }
                    .collect { event -> mutateProfile(of) { ParticipantProfileLive.applying(event, it) } }
            }
            launch {
                messageSocket.userUpdated.collect { event ->
                    mutateProfile(of) { ParticipantProfileLive.repainted(it, event) ?: it }
                }
            }
        }
    }

    private fun mutateProfile(of: Target, transform: (ApiParticipantProfile) -> ApiParticipantProfile) {
        if (target != of) return
        val current = _state.value.profile ?: return
        val next = transform(current)
        if (next == current) return
        _state.update { it.copy(profile = next) }
        remember(of, next)
    }

    /**
     * Écrit UN droit : un seul interrupteur à la fois, optimiste, la réponse résolue du serveur posée telle quelle,
     * et le droit d'avant rendu si le serveur refuse.
     */
    fun toggleRight(capability: ParticipantCapability) {
        val of = target ?: return
        val current = _state.value
        if (!current.canEditRights || current.rightsWriteInFlight) return
        val before = current.profile?.entryCapabilities ?: return
        if (capability !in before.disclosed) return
        val value = !current.isGranted(capability)
        _state.update {
            it.copy(
                rightsWriteInFlight = true,
                rightsFailed = false,
                profile = it.profile?.let { p -> ParticipantProfileLive.withRights(p, before.with(capability, value)) },
            )
        }
        viewModelScope.launch {
            val result = conversationRepository.updateParticipantRight(
                of.conversationId, of.participantId, capability, value,
            )
            if (target != of) {
                forgetStale(of)
                return@launch
            }
            when (result) {
                is NetworkResult.Success -> {
                    mutateProfile(of) { p -> result.data.rights?.let { ParticipantProfileLive.withRights(p, it) } ?: p }
                    _state.update { it.copy(rightsWriteInFlight = false) }
                }
                is NetworkResult.Failure -> {
                    _state.update {
                        it.copy(
                            rightsWriteInFlight = false,
                            rightsFailed = true,
                            profile = it.profile?.let { p -> ParticipantProfileLive.withRights(p, before) },
                        )
                    }
                }
            }
        }
    }

    fun dismissRightsError() = _state.update { it.copy(rightsFailed = false) }

    fun retry() {
        val of = target ?: return
        load(of.conversationId, of.participantId, of.readerRole)
    }

    /** Pose l'octroi à [isoDate]. */
    fun setHistoryGrant(isoDate: String) = writeHistoryGrant(isoDate)

    /**
     * Retire l'octroi. `null` est une VALEUR — « retire » — pas une absence :
     * le corps encode la clé explicitement pour que le gateway puisse
     * distinguer « retirer » de « ne rien dire ».
     */
    fun clearHistoryGrant() = writeHistoryGrant(null)

    fun dismissGrantError() = _state.update { it.copy(grantFailed = false) }

    private fun writeHistoryGrant(isoDate: String?) {
        val of = target ?: return
        val current = _state.value
        // Le droit d'écrire est celui que le SERVEUR a annoncé. Sans cette
        // garde, la vue pourrait proposer un geste qui n'aboutira jamais.
        if (!current.canGrantHistory) return

        val previous = current.profile?.historyVisibleFrom
        _state.update {
            it.copy(
                grantWriteInFlight = true,
                grantFailed = false,
                profile = it.profile?.copy(historyVisibleFrom = isoDate),
            )
        }

        viewModelScope.launch {
            val result = conversationRepository.updateHistoryGrant(of.conversationId, of.participantId, isoDate)
            if (target != of) {
                forgetStale(of)
                return@launch
            }
            when (result) {
                is NetworkResult.Success -> {
                    _state.update { it.copy(grantWriteInFlight = false) }
                    _state.value.profile?.let { remember(of, it) }
                }
                is NetworkResult.Failure ->
                    // On REND la valeur d'avant : un octroi qui resterait
                    // affiché après un refus ferait croire à un droit qui
                    // n'existe pas.
                    _state.update {
                        it.copy(
                            grantWriteInFlight = false,
                            grantFailed = true,
                            profile = it.profile?.copy(historyVisibleFrom = previous),
                        )
                    }
            }
        }
    }
}
