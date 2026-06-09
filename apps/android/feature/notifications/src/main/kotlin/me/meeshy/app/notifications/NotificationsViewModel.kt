package me.meeshy.app.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationRepository
import javax.inject.Inject

data class NotificationsUiState(
    val notifications: List<ApiNotification> = emptyList(),
    val unreadCount: Int = 0,
    val isLoading: Boolean = false,
    val isSyncing: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val notificationRepository: NotificationRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(isLoading = it.notifications.isEmpty(), isSyncing = true) }
        viewModelScope.launch {
            try {
                when (val result = notificationRepository.list()) {
                    is NetworkResult.Success -> _state.update {
                        it.copy(
                            notifications = result.data,
                            isLoading = false,
                            isSyncing = false,
                        )
                    }
                    is NetworkResult.Failure -> _state.update {
                        it.copy(isLoading = false, isSyncing = false, errorMessage = result.error.message)
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, isSyncing = false, errorMessage = e.message) }
            }
        }
    }

    fun markAsRead(notificationId: String) {
        viewModelScope.launch {
            notificationRepository.markAsRead(notificationId)
            _state.update { s ->
                s.copy(notifications = s.notifications.map {
                    if (it.id == notificationId) it.copy(state = it.state.copy(isRead = true))
                    else it
                })
            }
        }
    }

    fun markAllRead() {
        viewModelScope.launch {
            notificationRepository.markAllAsRead()
            _state.update { s ->
                s.copy(
                    notifications = s.notifications.map { it.copy(state = it.state.copy(isRead = true)) },
                    unreadCount = 0,
                )
            }
        }
    }
}
