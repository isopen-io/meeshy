package me.meeshy.app.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.friend.FriendshipCache
import javax.inject.Inject

/** Les onglets du carnet ; « Cercles » (#13938) suit Contacts, comme dans le hub People d'iOS. */
enum class ContactsTab { Contacts, Circles, Requests, Discover, Blocked }

/** Le hub ne garde que la sélection d'onglet et le badge des demandes reçues ; chaque onglet a son propre modèle. */
data class ContactsUiState(
    val selectedTab: ContactsTab = ContactsTab.Contacts,
    val pendingReceivedCount: Int = 0,
)

@HiltViewModel
class ContactsViewModel @Inject constructor(
    private val friendshipCache: FriendshipCache,
) : ViewModel() {

    private val _state = MutableStateFlow(ContactsUiState(pendingReceivedCount = friendshipCache.pendingReceivedCount))
    val state: StateFlow<ContactsUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            friendshipCache.version.collect {
                _state.update { it.copy(pendingReceivedCount = friendshipCache.pendingReceivedCount) }
            }
        }
    }

    fun selectTab(tab: ContactsTab) = _state.update { it.copy(selectedTab = tab) }
}
