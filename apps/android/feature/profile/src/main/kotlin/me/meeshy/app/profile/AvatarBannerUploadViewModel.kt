package me.meeshy.app.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.model.ImageUploadValidation
import me.meeshy.sdk.user.ProfileImageUploadOutcome
import me.meeshy.sdk.user.ProfileImageUploader
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

/** Un résultat ponctuel : l'écran en tire un toast et une haptique (iOS `FeedbackToastManager` + `HapticFeedback`). */
sealed interface AvatarBannerUploadEffect {
    data class Succeeded(val target: ImageUploadTarget) : AvatarBannerUploadEffect
    data class Failed(val error: ImageUploadError) : AvatarBannerUploadEffect
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
 * [OwnProfileViewModel] already observes.
 *
 * The flow: validate the pick (pure [ImageUploadValidator]) → reject with a typed
 * [ImageUploadError] without touching the network → upload the bytes
 * ([MediaRepository]) → optimistically paint the returned URL onto the session
 * (ARCHITECTURE.md §4) → confirm with the avatar/banner PATCH ([UserRepository]) →
 * adopt the server's canonical identity, or roll the session back to the snapshot
 * on failure. Every adoption runs under the account TICKET taken at the pick ([AccountFence.commit], #13568): a
 * logout or another account adopted while the upload or the confirm is in flight never re-adopts the identity of the
 * account that left (`adopt` would rewrite `currentUser` and the persisted `tokenStore.userId`). A single-flight guard drops a second pick while one is in flight, and
 * `viewModelScope` work rethrows [CancellationException] so a torn-down scope never
 * leaves a spurious error.
 */
@HiltViewModel
class AvatarBannerUploadViewModel @Inject constructor(
    mediaRepository: MediaRepository,
    userRepository: UserRepository,
    private val sessionRepository: SessionRepository,
    private val fence: AccountFence,
) : ViewModel() {

    private val uploader = ProfileImageUploader(mediaRepository, userRepository, sessionRepository, fence)

    private val _state = MutableStateFlow(AvatarBannerUploadUiState())
    val state: StateFlow<AvatarBannerUploadUiState> = _state.asStateFlow()

    private val _effects = Channel<AvatarBannerUploadEffect>(Channel.BUFFERED)
    val effects: Flow<AvatarBannerUploadEffect> = _effects.receiveAsFlow()

    fun dismissError() = _state.update { it.copy(error = null) }

    fun onImagePicked(target: ImageUploadTarget, item: MediaUploadItem) {
        if (_state.value.uploading != null) return

        uploader.validate(target, item)?.let { reason ->
            MediaIntake.release(item)
            fail(reason.toError())
            return
        }

        val snapshot = sessionRepository.currentUser.value
        val ticket = fence.ticket()
        _state.update { it.copy(uploading = target, error = null) }
        viewModelScope.launch {
            try {
                when (val outcome = uploader.send(target, item, snapshot, ticket)) {
                    is ProfileImageUploadOutcome.Applied -> {
                        _state.update { it.copy(uploading = null) }
                        _effects.trySend(AvatarBannerUploadEffect.Succeeded(target))
                    }
                    is ProfileImageUploadOutcome.Rejected -> fail(outcome.reason.toError())
                    ProfileImageUploadOutcome.UploadFailed -> fail(ImageUploadError.UPLOAD_FAILED)
                    ProfileImageUploadOutcome.UpdateFailed -> fail(ImageUploadError.UPDATE_FAILED)
                }
            } finally {
                MediaIntake.release(item)
            }
        }
    }

    private fun fail(error: ImageUploadError) {
        _state.update { it.copy(uploading = null, error = error) }
        _effects.trySend(AvatarBannerUploadEffect.Failed(error))
    }

    private fun ImageUploadValidation.Reason.toError(): ImageUploadError = when (this) {
        ImageUploadValidation.Reason.EMPTY -> ImageUploadError.EMPTY
        ImageUploadValidation.Reason.UNSUPPORTED_TYPE -> ImageUploadError.UNSUPPORTED_TYPE
        ImageUploadValidation.Reason.TOO_LARGE -> ImageUploadError.TOO_LARGE
    }
}
