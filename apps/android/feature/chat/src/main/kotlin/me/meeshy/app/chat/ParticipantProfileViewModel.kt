package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiParticipantProfile
import me.meeshy.sdk.model.ParticipantCapability
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

enum class ProfileLoadStatus { Idle, Loading, Loaded, Error }

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
) {
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
) : ViewModel() {

    private val _state = MutableStateFlow(ParticipantProfileUiState())
    val state: StateFlow<ParticipantProfileUiState> = _state.asStateFlow()

    private var conversationId: String? = null
    private var participantId: String? = null

    /**
     * [participantId] est un `Participant.id`, **jamais** un `User.id` : le
     * sujet de cette fiche est souvent un visiteur venu par un lien partagé,
     * qui n'a aucune ligne `User`. Les gestes voisins de l'écran des membres
     * (promouvoir, retirer, bannir) prennent l'autre colonne — la ressemblance
     * des deux chemins est un piège, pas une symétrie.
     */
    fun load(conversationId: String, participantId: String) {
        this.conversationId = conversationId
        this.participantId = participantId
        _state.update { it.copy(status = ProfileLoadStatus.Loading) }
        viewModelScope.launch {
            when (val result = conversationRepository.participantProfile(conversationId, participantId)) {
                is NetworkResult.Success ->
                    _state.update {
                        it.copy(status = ProfileLoadStatus.Loaded, profile = result.data)
                    }
                is NetworkResult.Failure ->
                    // Une fiche vide se lirait « ce participant n'a rien à dire ».
                    // L'état d'erreur dit la vérité : on n'a pas pu demander.
                    _state.update { it.copy(status = ProfileLoadStatus.Error, profile = null) }
            }
        }
    }

    fun retry() {
        val conversation = conversationId ?: return
        val participant = participantId ?: return
        load(conversation, participant)
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
                is NetworkResult.Success ->
                    _state.update { it.copy(grantWriteInFlight = false) }
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
