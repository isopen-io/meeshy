package me.meeshy.app.settings

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.legal.LegalDocumentCatalog
import me.meeshy.sdk.model.legal.LegalDocumentLanguage
import me.meeshy.sdk.session.SessionRepository

@Immutable
data class LegalDocumentUiState(val language: LegalDocumentLanguage)

sealed interface LegalDocumentUiEvent {
    data class SelectLanguage(val language: LegalDocumentLanguage) : LegalDocumentUiEvent
}

/**
 * The language a legal document is read in. It opens in the first delivered language of the
 * reader's Prisme ([LegalDocumentCatalog.initialLanguage]) and follows the segmented picker for the
 * lifetime of the screen, without leaving it.
 */
@HiltViewModel
class LegalDocumentViewModel @Inject constructor(
    sessionRepository: SessionRepository,
) : ViewModel() {

    private val chosen = MutableStateFlow<LegalDocumentLanguage?>(null)

    val state: StateFlow<LegalDocumentUiState> = combine(sessionRepository.currentUser, chosen) { user, picked ->
        LegalDocumentUiState(picked ?: initialLanguageOf(user))
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        LegalDocumentUiState(initialLanguageOf(sessionRepository.currentUser.value)),
    )

    fun onEvent(event: LegalDocumentUiEvent) {
        when (event) {
            is LegalDocumentUiEvent.SelectLanguage -> chosen.value = event.language
        }
    }

    private fun initialLanguageOf(user: MeeshyUser?): LegalDocumentLanguage =
        LegalDocumentCatalog.initialLanguage(
            systemLanguage = user?.systemLanguage,
            regionalLanguage = user?.regionalLanguage,
            customDestinationLanguage = user?.customDestinationLanguage,
            deviceLocale = ReaderPrism.deviceLocale(stored = user?.deviceLocale, current = Locale.getDefault()),
        )
}
