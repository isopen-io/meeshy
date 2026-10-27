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
enum class ConversationEncryptionNotice { READ_FAILED, OFFLINE, REGIME_CHANGED, IRREVERSIBLE, FORBIDDEN, FAILED }

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
    val confirmsDeactivation: Boolean = false,
) {
    /** Ni statut servi ni conversation retenue chiffrée : rien ne permet de dire le régime, la feuille ne devine pas. */
    val readFailed: Boolean get() = !isLoading && status == null && !sealed

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
 * ne se quitte jamais et ne s'active pas depuis ce téléphone (#13015).
 */
@HiltViewModel
class ConversationEncryptionViewModel @Inject constructor(
    private val encryption: ConversationEncryptionProviding,
    private val ledger: EndToEndRegimeLedger,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationEncryptionUiState())
    val state: StateFlow<ConversationEncryptionUiState> = _state.asStateFlow()

    fun load(conversationId: String, isDirect: Boolean) {
        if (_state.value.conversationId == conversationId) return
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
        if (mode.isOfferedOnThisPhone) _state.update { it.copy(selected = mode) }
    }

    fun activate() {
        val current = _state.value
        if (current.isSwitching || !current.view().let { it.mayToggle && it.content == ConversationEncryptionContent.Activation }) return
        switch { id -> encryption.enable(id, current.selected) }
    }

    fun requestDeactivation() {
        val offered = (_state.value.view().content as? ConversationEncryptionContent.Active)?.offersDeactivation == true
        if (offered) _state.update { it.copy(confirmsDeactivation = true) }
    }

    fun cancelDeactivation() {
        _state.update { it.copy(confirmsDeactivation = false) }
    }

    fun confirmDeactivation() {
        val current = _state.value
        val offered = (current.view().content as? ConversationEncryptionContent.Active)?.offersDeactivation == true
        _state.update { it.copy(confirmsDeactivation = false) }
        if (offered && !current.isSwitching) switch { id -> encryption.disable(id) }
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
                    sealed = ledger.isSealed(id),
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
                    it.copy(isSwitching = false, status = result.data, sealed = ledger.isSealed(id), notice = null)
                }
                is NetworkResult.Failure -> {
                    val notice = noticeOf(result.error, ConversationEncryptionNotice.FAILED)
                    _state.update { it.copy(isSwitching = false, sealed = ledger.isSealed(id), notice = notice) }
                    if (notice == ConversationEncryptionNotice.REGIME_CHANGED || notice == ConversationEncryptionNotice.IRREVERSIBLE) {
                        refreshKeepingNotice(id, notice)
                    }
                }
            }
        }
    }

    private suspend fun refreshKeepingNotice(id: String, notice: ConversationEncryptionNotice) {
        val served = (encryption.status(id) as? NetworkResult.Success)?.data
        _state.update { current ->
            if (current.conversationId != id) current else current.copy(status = served ?: current.status, sealed = ledger.isSealed(id), notice = notice)
        }
    }

    private fun noticeOf(error: ApiError, fallback: ConversationEncryptionNotice): ConversationEncryptionNotice = when {
        error.code == ConversationEncryptionRepository.REGIME_CHANGED -> ConversationEncryptionNotice.REGIME_CHANGED
        error.code == ConversationEncryptionRepository.IRREVERSIBLE -> ConversationEncryptionNotice.IRREVERSIBLE
        error.code == OFFLINE_CODE -> ConversationEncryptionNotice.OFFLINE
        error.httpStatus == FORBIDDEN -> ConversationEncryptionNotice.FORBIDDEN
        else -> fallback
    }

    private companion object {
        const val OFFLINE_CODE = "NETWORK"
        const val FORBIDDEN = 403
    }
}
