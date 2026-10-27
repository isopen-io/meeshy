package me.meeshy.app.community

import androidx.compose.runtime.Immutable
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.community.CommunityAppearanceStore
import me.meeshy.sdk.community.CommunityCacheRepository
import me.meeshy.sdk.community.CommunityRepository
import me.meeshy.sdk.media.ImageCompressor
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.AvatarBannerUpload
import me.meeshy.sdk.model.CommunitySettingsDraft
import me.meeshy.sdk.model.CommunitySettingsFields
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.media.ImageUploadContext
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

@Immutable
data class CommunitySettingsUiState(
    val draft: CommunitySettingsDraft? = null,
    val failedToLoad: Boolean = false,
    val uploading: ImageUploadTarget? = null,
    val isSaving: Boolean = false,
    val isDeleting: Boolean = false,
    val errorMessage: String? = null,
) {
    val isLoading: Boolean get() = draft == null && !failedToLoad
    val canSave: Boolean get() = draft?.canSave == true && !isSaving && uploading == null
}

sealed interface CommunitySettingsEffect {
    data object Saved : CommunitySettingsEffect
    data object Deleted : CommunitySettingsEffect
    data class UploadResult(val target: ImageUploadTarget, val succeeded: Boolean) : CommunitySettingsEffect
}

/**
 * Les réglages d'une communauté, réservés à son créateur (iOS `CommunitySettingsViewModel`). Le
 * brouillon est pur ([CommunitySettingsDraft]) : seuls les champs modifiés partent, la couleur et
 * l'emoji restent sur l'appareil. Une image choisie est allégée ([ImageCompressor]) puis téléversée
 * avant d'être liée au brouillon ; rien ne part au serveur avant « Enregistrer ».
 */
@HiltViewModel
class CommunitySettingsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val cache: CommunityCacheRepository,
    private val repository: CommunityRepository,
    private val appearanceStore: CommunityAppearanceStore,
    private val media: MediaRepository,
    private val compressor: ImageCompressor,
    private val session: SessionRepository,
) : ViewModel() {

    val communityId: String = checkNotNull(savedStateHandle[CommunityDetailViewModel.COMMUNITY_ID_ARG])

    private val _state = MutableStateFlow(CommunitySettingsUiState())
    val state: StateFlow<CommunitySettingsUiState> = _state.asStateFlow()

    private val _effects = Channel<CommunitySettingsEffect>(Channel.BUFFERED)
    val effects: Flow<CommunitySettingsEffect> = _effects.receiveAsFlow()

    private var creatorId: String? = null
    val isCreator: Boolean get() = creatorId != null && creatorId == session.currentUserId

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(failedToLoad = false) }
        viewModelScope.launch {
            val api = cache.detail(communityId, onError = { fail() }).first { it.valueOrNull != null }.valueOrNull ?: return@launch
            creatorId = api.createdBy
            val appearance = appearanceStore.observe(communityId, api.name).first()
            _state.update { it.copy(draft = CommunitySettingsDraft.of(api.toFields(appearance.color, appearance.emoji)), failedToLoad = false) }
        }
    }

    fun onName(value: String) = edit { it.copy(name = value) }
    fun onDescription(value: String) = edit { it.copy(description = value) }
    fun onPrivate(value: Boolean) = edit { it.copy(isPrivate = value) }
    fun onColor(hex: String) = edit { it.copy(color = hex) }

    /** L'emoji local tient en deux scalaires Unicode au plus (iOS `unicodeScalars.prefix(2)`). */
    fun onEmoji(value: String) = edit { it.copy(emoji = firstScalars(value, EMOJI_SCALARS)) }

    fun dismissError() = _state.update { it.copy(errorMessage = null) }

    fun upload(target: ImageUploadTarget, item: MediaUploadItem) {
        if (_state.value.uploading != null) return
        _state.update { it.copy(uploading = target) }
        viewModelScope.launch {
            val url = uploadedUrl(target, item)
            _state.update { current ->
                current.copy(
                    uploading = null,
                    draft = if (url == null) current.draft else current.draft?.edit {
                        if (target == ImageUploadTarget.AVATAR) it.copy(avatarUrl = url) else it.copy(bannerUrl = url)
                    },
                )
            }
            _effects.send(CommunitySettingsEffect.UploadResult(target, succeeded = url != null))
        }
    }

    fun save() {
        val current = _state.value
        val draft = current.draft ?: return
        if (!current.canSave) return
        _state.update { it.copy(isSaving = true) }
        viewModelScope.launch {
            val request = draft.toUpdateRequest()
            if (request != null) {
                val result = repository.update(communityId, request.name, null, request.description, request.isPrivate, request.avatar, request.banner)
                if (result is NetworkResult.Failure) {
                    _state.update { it.copy(isSaving = false, errorMessage = result.error.message) }
                    return@launch
                }
            }
            if (draft.current.color != draft.original.color) appearanceStore.setColor(communityId, draft.current.color)
            if (draft.current.emoji != draft.original.emoji) appearanceStore.setEmoji(communityId, draft.current.emoji)
            cache.refreshDetail(communityId)
            cache.refreshList()
            _state.update { it.copy(isSaving = false) }
            _effects.send(CommunitySettingsEffect.Saved)
        }
    }

    fun delete() {
        if (_state.value.isDeleting) return
        _state.update { it.copy(isDeleting = true) }
        viewModelScope.launch {
            when (val result = repository.delete(communityId)) {
                is NetworkResult.Success -> {
                    cache.forget(communityId)
                    cache.refreshList()
                    _state.update { it.copy(isDeleting = false) }
                    _effects.send(CommunitySettingsEffect.Deleted)
                }
                is NetworkResult.Failure -> _state.update { it.copy(isDeleting = false, errorMessage = result.error.message) }
            }
        }
    }

    private suspend fun uploadedUrl(target: ImageUploadTarget, item: MediaUploadItem): String? {
        val context = if (target == ImageUploadTarget.AVATAR) ImageUploadContext.AVATAR else ImageUploadContext.BANNER
        val image = compressor.compress(item.bytes, context)
        val prefix = if (target == ImageUploadTarget.AVATAR) "community_avatar" else "community_banner"
        val upload = MediaUploadItem(image.bytes, "${prefix}_${System.nanoTime()}.${image.fileExtension}", image.mimeType)
        val uploaded = (media.upload(listOf(upload)) as? NetworkResult.Success)?.data ?: return null
        return AvatarBannerUpload.firstUploadedUrl(uploaded)
    }

    private fun edit(transform: (CommunitySettingsFields) -> CommunitySettingsFields) =
        _state.update { current -> current.copy(draft = current.draft?.edit(transform)) }

    private fun fail() = _state.update { if (it.draft == null) it.copy(failedToLoad = true) else it }

    private fun ApiCommunity.toFields(color: String, emoji: String) = CommunitySettingsFields(
        name = name,
        description = description.orEmpty(),
        isPrivate = isPrivate,
        avatarUrl = avatar.orEmpty(),
        bannerUrl = banner.orEmpty(),
        color = color,
        emoji = emoji,
    )

    private companion object {
        const val EMOJI_SCALARS = 2

        fun firstScalars(value: String, count: Int): String {
            val points = value.codePoints().limit(count.toLong()).toArray()
            return String(points, 0, points.size)
        }
    }
}
