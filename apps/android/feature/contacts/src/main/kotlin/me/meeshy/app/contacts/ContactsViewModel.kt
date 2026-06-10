package me.meeshy.app.contacts

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

enum class ContactsTab { Contacts, Requests, Discover, Blocked }

data class ContactsUiState(
    val selectedTab: ContactsTab = ContactsTab.Contacts,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class ContactsViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ContactsUiState())
    val state: StateFlow<ContactsUiState> = _state.asStateFlow()

    fun selectTab(tab: ContactsTab) = _state.update { it.copy(selectedTab = tab) }
}
