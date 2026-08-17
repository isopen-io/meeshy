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
import me.meeshy.sdk.socket.MessageSocketManager
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
    private val messageSocketManager: MessageSocketManager,
) : ViewModel() {

    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

    init {
        load()
        observeRealtime()
    }

    /**
     * A `notification:new` arriving while this screen is alive/backing the badge is prepended
     * live — an already-known id (REST list beat the socket, or a duplicate delivery) is a
     * no-op rather than a second row. Mirrors iOS `NotificationCoordinator`'s optimistic
     * unread increment, minus the toast/dedup-window machinery (feature-parity §M — the toast
     * itself is a separate, not-yet-scoped slice; this is real-time DATA only).
     */
    private fun observeRealtime() {
        viewModelScope.launch {
            messageSocketManager.notificationReceived.collect { notification ->
                _state.update { s ->
                    if (s.notifications.any { it.id == notification.id }) return@update s
                    s.copy(
                        notifications = listOf(notification) + s.notifications,
                        unreadCount = if (notification.state.isRead) s.unreadCount else s.unreadCount + 1,
                    )
                }
            }
        }
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
