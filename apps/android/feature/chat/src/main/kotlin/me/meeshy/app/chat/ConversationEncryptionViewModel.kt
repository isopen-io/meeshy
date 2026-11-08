package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.e2ee.ConversationEncryptionProviding
import me.meeshy.sdk.e2ee.ConversationEncryptionRepository
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.e2ee.ConversationEncryptionContent
import me.meeshy.sdk.model.e2ee.ConversationEncryptionModeChoice
import me.meeshy.sdk.model.e2ee.ConversationEncryptionStatus
import me.meeshy.sdk.model.e2ee.ConversationEncryptionView
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/** Ce que la feuille dit après un geste ou une lecture qui n'a pas abouti. */
enum class ConversationEncryptionNotice {
    READ_FAILED,
    OFFLINE,
    REGIME_CHANGED,
    IRREVERSIBLE,

    /** 403 sans code : dans un groupe, il faut en être modérateur. */
    FORBIDDEN,

    /** 403 `ENCRYPTION_ACTIVATION_RESTRICTED` : la politique de plateforme réserve le geste à un rôle d'équipe. */
    RESTRICTED,

    /** `ENCRYPTION_ALREADY_ENABLED` : le mode visé est déjà celui que la passerelle tient. */
    ALREADY_ENABLED,

    /** 409 `E2EE_DIRECT_ALREADY_END_TO_END` : la paire a déjà son tête-à-tête chiffré de bout en bout. */
    DIRECT_ALREADY_END_TO_END,

    /** 409 `E2EE_DIRECT_NOT_A_PAIR` : ce tête-à-tête ne réunit pas exactement deux membres inscrits. */
    DIRECT_NOT_A_PAIR,
    FAILED,
}

data class ConversationEncryptionUiState(
    val conversationId: String? = null,
    val isDirect: Boolean = true,
    val status: ConversationEncryptionStatus? = null,
    /** Cet appareil a vu la conversation chiffrée de bout en bout : elle le reste (#12949). */
    val sealed: Boolean = false,
    val isLoading: Boolean = true,
    val isSwitching: Boolean = false,
    val selected: ConversationEncryptionModeChoice = ConversationEncryptionModeChoice.SERVER,
    val notice: ConversationEncryptionNotice? = null,
    /** Le passage au bout en bout attend sa confirmation : on n'en revient jamais (#12949, #16044). */
    val confirmsEndToEnd: Boolean = false,
) {
    /** Ni statut servi ni conversation retenue chiffrée : rien ne permet de dire le régime, la feuille ne devine pas. */
    val readFailed: Boolean get() = !isLoading && status == null && !sealed

    /**
     * Le passage à un autre mode est prêt : le rôle autorisé, un régime AU REPOS, et un mode choisi
     * qui n'est pas celui en place et que ce téléphone sait servir (le bout en bout : en tête-à-tête seulement, #14591).
     */
    val canSwitchMode: Boolean
        get() {
            val shown = view()
            val offered = (shown.content as? ConversationEncryptionContent.Active)?.offersModeChange == true
            return offered && !isSwitching && selected.isOfferedFor(isDirect) &&
                selected in ConversationEncryptionModeChoice.switchTargets(shown.regime)
        }

    /** L'activation d'une conversation sans chiffrement est prête : le droit servi, et aucune bascule en cours. */
    val canActivate: Boolean
        get() = !isSwitching && selected.isOfferedFor(isDirect) &&
            view().let { it.mayToggle && it.content == ConversationEncryptionContent.Activation }

    fun view(): ConversationEncryptionView = ConversationEncryptionView.resolve(
        status = status,
        sealed = sealed,
        isDirect = isDirect,
        loading = isLoading,
    )
}

/**
 * La fiche Chiffrement d'une conversation (#12880, #13463). La passerelle fait foi ; l'écran ne
 * promet que ce qu'elle a dit. Une bascule concurrente (409 `E2EE_REGIME_CHANGED`) ou un refus
 * `E2EE_IRREVERSIBLE` relit l'état au lieu d'échouer en silence ; le bout en bout, une fois vu,
 * ne se quitte jamais et ne s'active pas depuis ce téléphone (#13015). Le chiffrement au repos ne
 * se désactive plus (décision du 2026-11-01) : Serveur et Hybride passent à un autre mode.
 */
@HiltViewModel
class ConversationEncryptionViewModel @Inject constructor(
    private val encryption: ConversationEncryptionProviding,
    private val ledger: EndToEndRegimeLedger,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationEncryptionUiState())
    val state: StateFlow<ConversationEncryptionUiState> = _state.asStateFlow()

    /**
     * Chaque ouverture relit le régime : le ViewModel vit avec l'écran de conversation, et une
     * conversation devenue chiffrée de bout en bout entre deux ouvertures ne doit jamais rouvrir
     * sur un changement de mode périmé. Le registre est relu AVANT le réseau ; la lecture se fait sans
     * revenir au chargement quand un régime est déjà connu.
     */
    fun load(conversationId: String, isDirect: Boolean) {
        if (_state.value.conversationId == conversationId) {
            _state.update {
                it.copy(
                    isDirect = isDirect,
                    sealed = sealedOf(it, conversationId),
                    selected = it.selected.takeIf { mode -> mode.isOfferedFor(isDirect) } ?: ConversationEncryptionModeChoice.SERVER,
                    confirmsEndToEnd = false,
                )
            }
            read()
            return
        }
        _state.value = ConversationEncryptionUiState(
            conversationId = conversationId,
            isDirect = isDirect,
            sealed = ledger.isSealed(conversationId),
        )
        read()
    }

    fun retry() {
        _state.update { it.copy(isLoading = true, notice = null) }
        read()
    }

    fun select(mode: ConversationEncryptionModeChoice) {
        if (mode.isOfferedFor(_state.value.isDirect)) _state.update { it.copy(selected = mode) }
    }

    fun activate() {
        if (_state.value.canActivate) requestSwitch()
    }

    /** Fait passer un régime au repos au mode choisi (`POST /conversations/:id/encryption`). */
    fun switchMode() {
        if (_state.value.canSwitchMode) requestSwitch()
    }

    /**
     * Le bout en bout confirmé part, si le geste est TOUJOURS permis : une relecture ou un registre
     * qui a appris le bout en bout entre la question et la réponse ferment la porte (#12949).
     */
    fun confirmEndToEnd() {
        val current = _state.value
        _state.update { it.copy(confirmsEndToEnd = false) }
        val stillAllowed = current.canActivate || current.canSwitchMode
        if (!current.confirmsEndToEnd || current.selected != ConversationEncryptionModeChoice.E2EE || !stillAllowed) return
        switch { id -> encryption.enable(id, ConversationEncryptionModeChoice.E2EE) }
    }

    fun cancelEndToEnd() {
        _state.update { it.copy(confirmsEndToEnd = false) }
    }

    private fun requestSwitch() {
        val mode = _state.value.selected
        if (mode == ConversationEncryptionModeChoice.E2EE) {
            _state.update { it.copy(confirmsEndToEnd = true, notice = null) }
            return
        }
        switch { id -> encryption.enable(id, mode) }
    }

    fun dismissNotice() {
        _state.update { it.copy(notice = null) }
    }

    private fun read() {
        val id = _state.value.conversationId ?: return
        viewModelScope.launch {
            val result = encryption.status(id)
            _state.update { current ->
                if (current.conversationId != id) return@update current
                val served = (result as? NetworkResult.Success)?.data
                current.copy(
                    isLoading = false,
                    status = served ?: current.status,
                    sealed = sealedOf(current, id),
                    notice = (result as? NetworkResult.Failure)?.let { noticeOf(it.error, ConversationEncryptionNotice.READ_FAILED) },
                )
            }
        }
    }

    private fun switch(call: suspend (String) -> NetworkResult<ConversationEncryptionStatus>) {
        val id = _state.value.conversationId ?: return
        _state.update { it.copy(isSwitching = true, notice = null) }
        viewModelScope.launch {
            when (val result = call(id)) {
                is NetworkResult.Success -> _state.update {
                    it.copy(isSwitching = false, status = result.data, sealed = sealedOf(it, id), notice = null)
                }
                is NetworkResult.Failure -> {
                    val notice = noticeOf(result.error, ConversationEncryptionNotice.FAILED)
                    _state.update { it.copy(isSwitching = false, sealed = sealedOf(it, id), notice = notice) }
                    if (notice in REREAD_AFTER) refreshKeepingNotice(id, notice)
                }
            }
        }
    }

    private suspend fun refreshKeepingNotice(id: String, notice: ConversationEncryptionNotice) {
        val served = (encryption.status(id) as? NetworkResult.Success)?.data
        _state.update { current ->
            if (current.conversationId != id) current else current.copy(status = served ?: current.status, sealed = sealedOf(current, id), notice = notice)
        }
    }

    /** Le scellé ne recule jamais dans la feuille : un compte momentanément inconnu ne rouvre pas le clair (#12949). */
    private fun sealedOf(current: ConversationEncryptionUiState, id: String): Boolean = current.sealed || ledger.isSealed(id)

    private fun noticeOf(error: ApiError, fallback: ConversationEncryptionNotice): ConversationEncryptionNotice =
        NOTICE_OF_CODE[error.code] ?: if (error.httpStatus == FORBIDDEN) ConversationEncryptionNotice.FORBIDDEN else fallback

    private companion object {
        const val FORBIDDEN = 403

        /** Chaque refus de la passerelle a ses mots ; un code inconnu retombe sur l'échec générique. */
        val NOTICE_OF_CODE: Map<String, ConversationEncryptionNotice> = mapOf(
            ConversationEncryptionRepository.REGIME_CHANGED to ConversationEncryptionNotice.REGIME_CHANGED,
            ConversationEncryptionRepository.IRREVERSIBLE to ConversationEncryptionNotice.IRREVERSIBLE,
            ConversationEncryptionRepository.DIRECT_ALREADY_END_TO_END to ConversationEncryptionNotice.DIRECT_ALREADY_END_TO_END,
            ConversationEncryptionRepository.DIRECT_NOT_A_PAIR to ConversationEncryptionNotice.DIRECT_NOT_A_PAIR,
            ConversationEncryptionRepository.ACTIVATION_RESTRICTED to ConversationEncryptionNotice.RESTRICTED,
            ConversationEncryptionRepository.ALREADY_ENABLED to ConversationEncryptionNotice.ALREADY_ENABLED,
            "NETWORK" to ConversationEncryptionNotice.OFFLINE,
        )

        /** Ces refus disent que l'état ou le droit servis ont bougé : la feuille les relit, et garde le mot. */
        val REREAD_AFTER: Set<ConversationEncryptionNotice> = setOf(
            ConversationEncryptionNotice.REGIME_CHANGED,
            ConversationEncryptionNotice.IRREVERSIBLE,
            ConversationEncryptionNotice.FORBIDDEN,
            ConversationEncryptionNotice.RESTRICTED,
            ConversationEncryptionNotice.ALREADY_ENABLED,
            ConversationEncryptionNotice.DIRECT_ALREADY_END_TO_END,
        )
    }
}
