package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.export.DataExportRepository
import me.meeshy.sdk.model.export.DataExportFileBuilder
import me.meeshy.sdk.model.export.DataExportSelection
import me.meeshy.sdk.model.export.ExportArtifact
import me.meeshy.sdk.model.export.ExportFormat
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/** The reason a data-export request failed — localized by the screen, not the VM. */
enum class DataExportError { NETWORK, GENERIC }

data class DataExportUiState(
    val format: ExportFormat = ExportFormat.JSON,
    val includeMessages: Boolean = true,
    val includeContacts: Boolean = true,
    val isExporting: Boolean = false,
    val artifact: ExportArtifact? = null,
    val messagesCount: Int? = null,
    val contactsCount: Int? = null,
    val error: DataExportError? = null,
) {
    /** The delete/export button may fire only when no request is already in flight. */
    val canSubmit: Boolean
        get() = !isExporting
}

/**
 * Drives the data-export screen (feature-parity §L, port of iOS `DataExportView`). Holds the scope
 * selection (format + optional content sections), performs the single online
 * [DataExportRepository.export] call, and on success builds a shareable [ExportArtifact] via the
 * pure [DataExportFileBuilder].
 *
 * Changing any part of the selection **invalidates a prior export** (clears the artifact, counts and
 * error) so the user can never share a file that doesn't match the current choices; re-selecting the
 * current value is an inert no-op that leaves a ready artifact intact. A failure maps to a targeted
 * [DataExportError] the screen localizes (transport = network; else generic — including the inert
 * no-session case, which should not happen from an authed screen but is handled defensively).
 */
@HiltViewModel
class DataExportViewModel @Inject constructor(
    private val repository: DataExportRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(DataExportUiState())
    val state: StateFlow<DataExportUiState> = _state.asStateFlow()

    fun setFormat(format: ExportFormat) {
        if (_state.value.format == format) return
        _state.update { it.copy(format = format).invalidatingExport() }
    }

    fun toggleMessages() {
        _state.update { it.copy(includeMessages = !it.includeMessages).invalidatingExport() }
    }

    fun toggleContacts() {
        _state.update { it.copy(includeContacts = !it.includeContacts).invalidatingExport() }
    }

    /**
     * Requests the export. Inert while a request is already in flight (double-tap safe —
     * [DataExportUiState.isExporting] is set synchronously before the coroutine launches). On
     * success the parsed payload is turned into a shareable [ExportArtifact].
     */
    fun submit() {
        val snapshot = _state.value
        if (!snapshot.canSubmit) return
        _state.update { it.copy(isExporting = true, error = null) }
        val selection = DataExportSelection(
            format = snapshot.format,
            includeMessages = snapshot.includeMessages,
            includeContacts = snapshot.includeContacts,
        )
        viewModelScope.launch {
            val result = repository.export(selection)
            _state.update { current ->
                when (result) {
                    is NetworkResult.Success -> current.copy(
                        isExporting = false,
                        artifact = DataExportFileBuilder.build(result.data),
                        messagesCount = result.data.messagesCount,
                        contactsCount = result.data.contactsCount,
                        error = null,
                    )
                    is NetworkResult.Failure -> current.copy(
                        isExporting = false,
                        error = result.error.toDataExportError(),
                    )
                    null -> current.copy(isExporting = false, error = DataExportError.GENERIC)
                }
            }
        }
    }
}

private fun DataExportUiState.invalidatingExport(): DataExportUiState =
    copy(artifact = null, messagesCount = null, contactsCount = null, error = null)

private fun ApiError.toDataExportError(): DataExportError =
    if (code == "NETWORK") DataExportError.NETWORK else DataExportError.GENERIC
