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

    private var conversationId: String? = null
    private var participantId: String? = null
    private var readerRole: String? = null
    private var liveJob: Job? = null

    /**
     * [participantId] est un `Participant.id`, **jamais** un `User.id` : le
     * sujet de cette fiche est souvent un visiteur venu par un lien partagé,
     * qui n'a aucune ligne `User`. Les gestes voisins de l'écran des membres
     * (promouvoir, retirer, bannir) prennent l'autre colonne — la ressemblance
     * des deux chemins est un piège, pas une symétrie.
     */
    fun load(conversationId: String, participantId: String, readerRole: String? = null) {
        this.conversationId = conversationId
        this.participantId = participantId
        this.readerRole = readerRole
        val cached = cacheKey()?.let { cache.get(it, readerRole) }
        // Cache-first : une fiche en cache est peinte tout de suite ; le chargement n'apparaît que sur cache vide.
        _state.update {
            if (cached != null) it.copy(status = ProfileLoadStatus.Loaded, profile = cached)
            else it.copy(status = ProfileLoadStatus.Loading)
        }
        observeLive(conversationId, participantId)
        viewModelScope.launch {
            when (val result = conversationRepository.participantProfile(conversationId, participantId)) {
                is NetworkResult.Success -> {
                    remember(result.data)
                    _state.update { it.copy(status = ProfileLoadStatus.Loaded, profile = result.data) }
                }
                is NetworkResult.Failure -> onSyncFailure(result.error.httpStatus)
            }
        }
    }

    private fun onSyncFailure(httpStatus: Int?) {
        if (httpStatus == 404) {
            cacheKey()?.let(cache::evict)
            _state.update { it.copy(status = ProfileLoadStatus.Left, profile = null) }
            return
        }
        // Un échec de synchro ne retire pas la fiche déjà peinte.
        _state.update {
            if (it.profile != null) it else it.copy(status = ProfileLoadStatus.Error)
        }
    }

    private fun cacheKey(): ParticipantProfileKey? {
        val reader = session.currentUserId?.takeIf { it.isNotBlank() } ?: return null
        val conversation = conversationId ?: return null
        val participant = participantId ?: return null
        return ParticipantProfileKey(reader, conversation, participant)
    }

    private fun remember(profile: ApiParticipantProfile) {
        cacheKey()?.let { cache.put(it, readerRole, profile) }
    }

    private fun observeLive(conversationId: String, participantId: String) {
        liveJob?.cancel()
        liveJob = viewModelScope.launch {
            launch {
                conversationEvents.events
                    .filterIsInstance<ParticipantRightsUpdatedEvent>()
                    .filter { it.conversationId == conversationId && it.participantId == participantId }
                    .collect { event -> mutateProfile { ParticipantProfileLive.applying(event, it) } }
            }
            launch {
                messageSocket.userUpdated.collect { event ->
                    mutateProfile { ParticipantProfileLive.repainted(it, event) ?: it }
                }
            }
        }
    }

    private fun mutateProfile(transform: (ApiParticipantProfile) -> ApiParticipantProfile) {
        val current = _state.value.profile ?: return
        val next = transform(current)
        if (next == current) return
        _state.update { it.copy(profile = next) }
        remember(next)
    }

    /**
     * Écrit UN droit : un seul interrupteur à la fois, optimiste, la réponse résolue du serveur posée telle quelle,
     * et le droit d'avant rendu si le serveur refuse.
     */
    fun toggleRight(capability: ParticipantCapability) {
        val conversation = conversationId ?: return
        val participant = participantId ?: return
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
            when (val result = conversationRepository.updateParticipantRight(conversation, participant, capability, value)) {
                is NetworkResult.Success -> {
                    mutateProfile { p -> result.data.rights?.let { ParticipantProfileLive.withRights(p, it) } ?: p }
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
        val conversation = conversationId ?: return
        val participant = participantId ?: return
        load(conversation, participant, readerRole)
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
        val conversation = conversationId ?: return
        val participant = participantId ?: return
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
            when (conversationRepository.updateHistoryGrant(conversation, participant, isoDate)) {
                is NetworkResult.Success -> {
                    _state.update { it.copy(grantWriteInFlight = false) }
                    _state.value.profile?.let(::remember)
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
