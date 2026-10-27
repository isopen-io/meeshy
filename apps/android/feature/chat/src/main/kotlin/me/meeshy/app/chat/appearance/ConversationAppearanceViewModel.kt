package me.meeshy.app.chat.appearance

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.appearance.WallpaperPackRepository
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.mediahub.BackgroundPhotoSource
import me.meeshy.sdk.mediahub.ConversationBackgroundPhotos
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AppearanceDesignPack
import me.meeshy.sdk.model.appearance.ConversationAppearance
import me.meeshy.sdk.model.appearance.WallpaperPackOptions
import me.meeshy.sdk.net.MeeshyConfig

@Immutable
data class ConversationAppearanceUiState(
    val appearance: ConversationAppearance = ConversationAppearance.DEFAULT,
    val catalog: AppearanceCatalog? = null,
    val packs: List<AppearanceDesignPack> = emptyList(),
    val saveFailed: Boolean = false,
)

/**
 * Le choix du fond et de l'accent d'une conversation (miroir de `ConversationAppearanceViewModel` iOS, #10631). La
 * ligne Room des préférences est la SOURCE UNIQUE : chaque choix s'y écrit aussitôt (le fil ouvert se repeint, la
 * liste aussi), le snapshot part par l'outbox des préférences — hors ligne compris —, l'écho d'un autre appareil
 * (`user:preferences-updated`) arrive par la même ligne. Le serveur reste l'autorité (possession, pièce de la conversation).
 */
@HiltViewModel
class ConversationAppearanceViewModel @Inject constructor(
    private val conversations: ConversationRepository,
    private val loader: AppearanceCatalogLoader,
    private val packRepository: WallpaperPackRepository,
    private val photos: ConversationBackgroundPhotos,
    config: MeeshyConfig,
) : ViewModel() {

    private val attachmentRouteBase: String = config.apiBaseUrl.trimEnd('/') + "/attachments"

    private val _state = MutableStateFlow(ConversationAppearanceUiState(catalog = loader.current))
    val state: StateFlow<ConversationAppearanceUiState> = _state.asStateFlow()

    private var conversationId: String? = null
    private var observing: Job? = null

    /** Ouvre sur une conversation ; sans effet si elle est déjà suivie. */
    fun start(id: String) {
        if (conversationId == id) return
        conversationId = id
        observing?.cancel()
        observing = viewModelScope.launch {
            val catalog = runCatching { loader.catalog() }.getOrNull()
            _state.update { it.copy(catalog = catalog, packs = packsFor(catalog, packRepository.cached)) }
            conversations.conversationStream(id).collect { conversation ->
                val raw = conversation?.resolvedPreferences?.appearance
                val appearance = ConversationAppearance.read(raw) { key -> catalog?.gamut?.contains(key) ?: true }
                _state.update { it.copy(appearance = appearance) }
            }
        }
        viewModelScope.launch {
            val installed = packRepository.refresh()
            _state.update { it.copy(packs = packsFor(it.catalog, installed ?: packRepository.cached)) }
        }
    }

    fun selectSignature() = commit { it.withSignature() }

    fun selectDesign(pack: String, design: String) = commit { it.withDesign(pack, design) }

    fun selectSolid(color: String) = commit { it.withSolid(color) }

    /** La photo choisie se mémorise (vignette + plein format) : le fond se repeint même hors de la fenêtre chargée du fil. */
    fun selectPhoto(attachmentId: String, source: BackgroundPhotoSource) {
        photos.remember(attachmentId, source)
        commit { it.withPhoto(attachmentId) }
    }

    fun setPhotoVeil(veil: Double) = commit { it.withPhotoVeil(veil) }

    fun setPhotoBlur(blur: Int) = commit { it.withPhotoBlur(blur) }

    /** `null` = l'accent calculé de la conversation (Automatique). */
    fun setAccent(key: String?) = commit { it.withAccent(key) }

    fun reset() = commit { ConversationAppearance.DEFAULT }

    fun photoSource(attachmentId: String): BackgroundPhotoSource =
        photos.resolve(conversationId.orEmpty(), attachmentId, attachmentRouteBase)

    private fun commit(change: (ConversationAppearance) -> ConversationAppearance) {
        val id = conversationId ?: return
        val current = _state.value.appearance
        val next = change(current)
        if (next == current) return
        _state.update { it.copy(appearance = next, saveFailed = false) }
        viewModelScope.launch {
            val written = conversations.setAppearanceOptimistic(id, next)
            if (!written) _state.update { if (it.appearance == next) it.copy(appearance = current, saveFailed = true) else it }
        }
    }

    private fun packsFor(catalog: AppearanceCatalog?, installed: List<me.meeshy.sdk.model.appearance.InstalledPackSummary>?) =
        catalog?.let { WallpaperPackOptions.packs(installed, it) }.orEmpty()
}
