package me.meeshy.app.reels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import javax.inject.Inject

data class ReelsUiState(
    val reels: List<ReelPresentation> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class ReelsViewModel @Inject constructor(
    private val postRepository: PostRepository,
    private val config: MeeshyConfig,
) : ViewModel() {

    private val _state = MutableStateFlow(ReelsUiState())
    val state: StateFlow<ReelsUiState> = _state.asStateFlow()

    /** Loads the vertical reel thread, optionally anchored at [seed] (a reel touched in the Feed). */
    fun load(seed: String? = null) {
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = postRepository.getReels(seed)) {
                is NetworkResult.Success -> _state.update {
                    it.copy(reels = ReelBuilder.build(result.data, config.socketUrl), isLoading = false)
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isLoading = false, errorMessage = result.error.message)
                }
            }
        }
    }
}
