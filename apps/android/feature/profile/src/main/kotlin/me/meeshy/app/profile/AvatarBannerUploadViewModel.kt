package me.meeshy.app.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.AvatarBannerApply
import me.meeshy.sdk.model.AvatarBannerUpload
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.ImageUploadValidation
import me.meeshy.sdk.model.ImageUploadValidator
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/** Why an avatar/banner upload could not be applied — mapped to a string by the screen. */
enum class ImageUploadError {
    EMPTY,
    UNSUPPORTED_TYPE,
    TOO_LARGE,
    UPLOAD_FAILED,
    UPDATE_FAILED,
}

data class AvatarBannerUploadUiState(
    val uploading: ImageUploadTarget? = null,
    val error: ImageUploadError? = null,
)

/**
 * Orchestrates picking → uploading → linking a profile avatar/banner
 * (feature-parity §K, port of iOS `AttachmentUploader` + `UserService.updateAvatar`,
 * generalised to a banner). Kept a dedicated ViewModel hosted inside the profile
 * edit form so the upload flow stays isolated and fully testable; the confirmed
 * identity re-paints every surface via [SessionRepository.currentUser], which
 * [ProfileViewModel] already observes.
 *
 * The flow: validate the pick (pure [ImageUploadValidator]) → reject with a typed
 * [ImageUploadError] without touching the network → upload the bytes
 * ([MediaRepository]) → optimistically paint the returned URL onto the session
 * (ARCHITECTURE.md §4) → confirm with the avatar/banner PATCH ([UserRepository]) →
 * adopt the server's canonical identity, or roll the session back to the snapshot
 * on failure. A single-flight guard drops a second pick while one is in flight, and
 * `viewModelScope` work rethrows [CancellationException] so a torn-down scope never
 * leaves a spurious error.
 */
@HiltViewModel
class AvatarBannerUploadViewModel @Inject constructor(
    private val mediaRepository: MediaRepository,
    private val userRepository: UserRepository,
    private val sessionRepository: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AvatarBannerUploadUiState())
    val state: StateFlow<AvatarBannerUploadUiState> = _state.asStateFlow()

    fun dismissError() = _state.update { it.copy(error = null) }

    fun onImagePicked(target: ImageUploadTarget, item: MediaUploadItem) {
        if (_state.value.uploading != null) return

        when (val validation = ImageUploadValidator.validate(target, item.bytes.size, item.mimeType)) {
            is ImageUploadValidation.Rejected -> {
                _state.update { it.copy(error = validation.reason.toError()) }
                return
            }
            ImageUploadValidation.Accepted -> Unit
        }

        val snapshot = sessionRepository.currentUser.value
        _state.update { it.copy(uploading = target, error = null) }
        viewModelScope.launch {
            try {
                val uploaded = when (val result = mediaRepository.upload(listOf(item))) {
                    is NetworkResult.Success -> result.data
                    is NetworkResult.Failure -> return@launch fail(ImageUploadError.UPLOAD_FAILED)
                }
                val url = AvatarBannerUpload.firstUploadedUrl(uploaded)
                    ?: return@launch fail(ImageUploadError.UPLOAD_FAILED)

                if (snapshot != null) {
                    sessionRepository.adopt(AvatarBannerApply.apply(snapshot, target, url))
                }
                when (val confirm = confirm(target, url)) {
                    is NetworkResult.Success -> {
                        sessionRepository.adopt(confirm.data)
                        _state.update { it.copy(uploading = null) }
                    }
                    is NetworkResult.Failure -> {
                        snapshot?.let(sessionRepository::adopt)
                        fail(ImageUploadError.UPDATE_FAILED)
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                snapshot?.let(sessionRepository::adopt)
                fail(ImageUploadError.UPDATE_FAILED)
            }
        }
    }

    private suspend fun confirm(target: ImageUploadTarget, url: String) = when (target) {
        ImageUploadTarget.AVATAR -> userRepository.updateAvatar(url)
        ImageUploadTarget.BANNER -> userRepository.updateBanner(url)
    }

    private fun fail(error: ImageUploadError) =
        _state.update { it.copy(uploading = null, error = error) }

    private fun ImageUploadValidation.Reason.toError(): ImageUploadError = when (this) {
        ImageUploadValidation.Reason.EMPTY -> ImageUploadError.EMPTY
        ImageUploadValidation.Reason.UNSUPPORTED_TYPE -> ImageUploadError.UNSUPPORTED_TYPE
        ImageUploadValidation.Reason.TOO_LARGE -> ImageUploadError.TOO_LARGE
    }
}
