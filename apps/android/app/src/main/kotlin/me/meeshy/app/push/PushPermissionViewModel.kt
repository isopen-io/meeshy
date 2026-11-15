package me.meeshy.app.push

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.notification.FirstMessageAcceptedSignal
import me.meeshy.sdk.session.SessionRepository

@HiltViewModel
class PushPermissionViewModel @Inject constructor(
    private val gate: PushPermissionGate,
    private val sessionRepository: SessionRepository,
    firstMessage: FirstMessageAcceptedSignal,
) : ViewModel() {
    val requests: Flow<Unit> = gate.requests
    val isAuthorized: StateFlow<Boolean> = gate.status.isAuthorized

    init {
        viewModelScope.launch {
            firstMessage.accepted.collect {
                try {
                    gate.onFirstMessageAccepted()
                } catch (cancelled: kotlinx.coroutines.CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    Unit
                }
            }
        }
    }

    fun onSessionOpened() {
        val origin: SessionOrigin? = sessionRepository.sessionOrigin.value
        viewModelScope.launch { gate.onSessionOpened(origin) }
    }

    fun refreshAuthorization() {
        gate.status.refresh()
    }
}
