package me.meeshy.app.stories

import me.meeshy.sdk.media.readMediaUploadItem
import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import me.meeshy.ui.component.composer.LocalOnComposerPlateau
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.StorySourceWindow
import me.meeshy.sdk.model.StoryVisibility
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.currentStateAsState
import androidx.lifecycle.flowWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.feature.stories.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.composer.StoryCanvasFraming
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.composer.scene.ComposerBackdropFraming
import me.meeshy.sdk.model.composer.scene.ComposerBackgroundMenuAction
import me.meeshy.sdk.model.composer.sound.ComposerSoundPlacement
import me.meeshy.ui.component.audio.AudioTrackSurface

/** Le délai après lequel la fenêtre d'un son rogné est reprise par le lecteur du composeur. */
private const val SOUND_WINDOW_SETTLE_MS: Long = 300L

/**
 * Story composer screen — the publish surface reached from the tray's "add story"
 * affordance. Keeps to glue: it renders [StoryComposerUiState] and forwards
 * intents to [StoryComposerViewModel]. The system photo/video picker reads the
 * chosen files off the main thread, hands the bytes to the ViewModel for upload,
 * and the returned media ride into the publish through the existing durable-outbox
 * flow. [StoryMediaPicker] routes to the single- or multi-item contract by the
 * free slots left so a single remaining slot never trips the multi-picker's
 * `maxItems > 1` requirement. Publishing is
 * optimistic — the screen dismisses on the one-shot `published` signal while the
 * outbox delivers in the background.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoryComposerScreen(
    onClose: () -> Unit,
    repostOfId: String? = null,
    /** La porte pose elle-même la matière (partage entrant, média de conversation ou de post) : le brouillon enregistré ne se restaure pas par-dessus et n'est pas écrasé. */
    seededByDoor: Boolean = false,
    /** L'audience dont la porte amorce le composeur (onboarding d'un mineur) ; un brouillon restauré garde la sienne. */
    initialVisibility: StoryVisibility? = null,
    /** La story PUBLIÉE à modifier (#13632) : le composeur la rouvre et l'enregistrement la met à jour. */
    editStoryId: String? = null,
    titleContent: (@Composable () -> Unit)? = null,
    viewModel: StoryComposerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val keyboardVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val sceneExport = rememberSceneExportHost(state, viewModel)

    LaunchedEffect(viewModel, lifecycleOwner) {
        viewModel.published
            .flowWithLifecycle(lifecycleOwner.lifecycle)
            .collectLatest { onClose() }
    }

    // Entered as a repost: link this composition to its source story once. The ViewModel
    // ignores a blank id, and the reader half renders the attribution from the published
    // story — so all the author side carries is the source id.
    LaunchedEffect(repostOfId) {
        repostOfId?.let { viewModel.onRepostSource(it) }
    }

    // Restore a persisted draft on open (silent, pristine-only) and persist/purge it on
    // leave — the composer's save-on-dismiss / restore-on-appear seam.
    DisposableEffect(viewModel) {
        viewModel.onEnterComposer(seededByDoor = repostOfId != null || seededByDoor || editStoryId != null, initialVisibility = initialVisibility)
        onDispose { viewModel.persistDraft() }
    }

    StoryEditGate(editStoryId = editStoryId, viewModel = viewModel, onClose = onClose)

    fun dispatchPicked(uris: List<Uri>) {
        if (uris.isEmpty()) return
        scope.launch {
            val items = withContext(Dispatchers.IO) {
                uris.mapNotNull { context.readMediaUploadItem(it) }
            }
            if (items.isNotEmpty()) viewModel.onMediaPicked(items)
        }
    }

    val pickSingle = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? -> dispatchPicked(listOfNotNull(uri)) }

    val pickMultiple = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(StoryComposerDraft.MAX_MEDIA),
    ) { uris: List<Uri> -> dispatchPicked(uris) }

    val imageAndVideo = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)

    var showSoundShelf by remember { mutableStateOf(false) }
    val screenState by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val backgroundSound = state.selectedSlideBackgroundSound
    val soundPlays = ComposerSoundPlacement.playsWhileComposing(
        track = backgroundSound,
        screenResumed = screenState.isAtLeast(Lifecycle.State.RESUMED),
        shelfOpen = showSoundShelf,
    )
    // La fenêtre propre du son (#13601) se joue aussi en composant ; pendant le geste d'une poignée elle n'est reprise qu'une
    // fois posée (un lecteur neuf par image du geste coûterait cher).
    val liveWindow = StorySourceWindow.clippingMs(backgroundSound?.sourceStart, backgroundSound?.sourceEnd)
        ?.takeIf { it.endMs != null }
    val soundWindow by produceState(liveWindow, liveWindow) {
        delay(SOUND_WINDOW_SETTLE_MS)
        value = liveWindow
    }
    backgroundSound?.let(viewModel::playableSoundUrl)?.let { url ->
        key(url) {
            AudioTrackSurface(
                mediaUrl = url,
                isActive = soundPlays,
                rewindWhenInactive = false,
                loop = true,
                volume = backgroundSound.volume,
                sourceStartMs = soundWindow?.startMs,
                sourceEndMs = soundWindow?.endMs,
                handleAudioFocus = true,
            )
        }
    }
    if (showSoundShelf) {
        SoundShelfSheet(
            onUse = { sound ->
                viewModel.onBorrowSound(sound)
                showSoundShelf = false
            },
            onDismiss = { showSoundShelf = false },
        )
    }
    var showStickerPicker by remember { mutableStateOf(false) }
    if (showStickerPicker) {
        StickerPickerDialog(
            onPick = { emoji ->
                viewModel.onAddSticker(emoji)
                showStickerPicker = false
            },
            onDismiss = { showStickerPicker = false },
        )
    }

    var showAudience by rememberSaveable { mutableStateOf(false) }
    if (showAudience) {
        StoryAudienceSheet(
            visibility = state.draft.visibility,
            userIds = state.draft.visibilityUserIds,
            mentions = state.draft.mentions,
            hashtags = state.hashtags,
            onChooseVisibility = viewModel::onVisibilityChange,
            onUserIdsChange = viewModel::onAudienceUserIdsChange,
            onAddMention = viewModel::onAddMention,
            onRemoveMention = viewModel::onRemoveMention,
            onRemoveHashtag = viewModel::onRemoveHashtag,
            onDismiss = { showAudience = false },
        )
    }

    val panel: @Composable () -> Unit = {
        StoryComposerPanel(
            state = state,
            viewModel = viewModel,
            onAddSticker = { showStickerPicker = true },
            onPickMedia = {
                when (state.mediaPickMode) {
                    StoryMediaPickMode.Single -> pickSingle.launch(imageAndVideo)
                    StoryMediaPickMode.Multiple -> pickMultiple.launch(imageAndVideo)
                    StoryMediaPickMode.None -> Unit
                }
            },
            onOpenSoundShelf = { showSoundShelf = true },
        )
    }
    if (LocalOnComposerPlateau.current) {
        StoryComposerPlateau(
            state = state,
            viewModel = viewModel,
            sceneExport = sceneExport,
            onClose = onClose,
            titleContent = titleContent,
            onOpenAudience = { showAudience = true },
            onOpenStickers = { showStickerPicker = true },
            panel = panel,
        )
        return
    }
    Scaffold(
        topBar = { StoryComposerTopBar(state, viewModel, sceneExport, onClose, titleContent) },
    ) { padding ->
        StoryComposerBody(
            state = state,
            viewModel = viewModel,
            sceneExport = sceneExport,
            panel = panel,
            modifier = Modifier.fillMaxSize().padding(padding).imePadding().padding(16.dp),
            onOpenAudience = { showAudience = true },
        )
    }
}
