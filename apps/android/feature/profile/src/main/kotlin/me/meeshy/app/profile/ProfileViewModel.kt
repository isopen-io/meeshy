package me.meeshy.app.profile

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

data class ProfileUiState(
    val user: MeeshyUser? = null,
    val isLoading: Boolean = false,
    val isEditing: Boolean = false,
    val displayName: String = "",
    val bio: String = "",
    val errorMessage: String? = null,
    val isSaving: Boolean = false,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val userRepository: UserRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val userId: String? = savedStateHandle[USER_ID_ARG]

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    init {
        if (userId == null) {
            // Own profile — observe session
            viewModelScope.launch {
                sessionRepository.currentUser.collect { user ->
                    _state.update { it.copy(user = user, displayName = user?.displayName ?: "", bio = user?.bio ?: "") }
                }
            }
        } else {
            loadProfile(userId)
        }
    }

    fun onDisplayNameChange(value: String) = _state.update { it.copy(displayName = value) }
    fun onBioChange(value: String) = _state.update { it.copy(bio = value) }
    fun startEditing() = _state.update { it.copy(isEditing = true) }
    fun cancelEditing() = _state.update { s ->
        s.copy(isEditing = false, displayName = s.user?.displayName ?: "", bio = s.user?.bio ?: "")
    }

    fun saveProfile() {
        val current = _state.value
        _state.update { it.copy(isSaving = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                val request = UpdateProfileRequest(
                    displayName = current.displayName.trim().takeIf { it.isNotEmpty() },
                    bio = current.bio.trim().takeIf { it.isNotEmpty() },
                )
                when (val result = userRepository.updateProfile(request)) {
                    is NetworkResult.Success ->
                        _state.update { it.copy(user = result.data, isEditing = false, isSaving = false) }
                    is NetworkResult.Failure ->
                        _state.update { it.copy(isSaving = false, errorMessage = result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isSaving = false, errorMessage = e.message) }
            }
        }
    }

    private fun loadProfile(id: String) {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            try {
                when (val result = userRepository.getProfile(id)) {
                    is NetworkResult.Success -> {
                        val user = result.data
                        _state.update { it.copy(user = user, isLoading = false, displayName = user.displayName ?: "", bio = user.bio ?: "") }
                    }
                    is NetworkResult.Failure ->
                        _state.update { it.copy(isLoading = false, errorMessage = result.error.message) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(isLoading = false, errorMessage = e.message) }
            }
        }
    }

    companion object {
        const val USER_ID_ARG = "userId"
    }
}
