package me.meeshy.app.stories

import me.meeshy.sdk.media.readMediaUploadItem
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.produceState
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.StorySourceWindow
import me.meeshy.sdk.model.StoryVisibility
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
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
import me.meeshy.sdk.model.composer.ComposerOpening
import me.meeshy.sdk.model.composer.sound.ComposerSoundPlacement
import me.meeshy.ui.component.audio.AudioTrackSurface
import me.meeshy.ui.theme.MeeshyTheme

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
 * `maxItems > 1` requirement. Hosted or stand-alone, the composer has ONE layout, the scene first
 * ([StoryComposerSceneFirst], #13834). Publishing is
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
    /** Le menu « Publier comme » de l'hôte, posé dans le chevron de Publier ; la route autonome n'en a pas. */
    formatChevron: (@Composable () -> Unit)? = null,
    /** La porte : ce que la scène vide ouvre d'un toucher ou d'un appui long, photo et vidéo ou vidéo seule (#13849). */
    opening: ComposerOpening = ComposerOpening.CAMERA_READY,
    /** La story VUE dont « Composer » sème la scène entière (#13849) : ses médias rapatriés et téléversés à nouveau. */
    recomposeStoryId: String? = null,
    viewModel: StoryComposerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
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
        viewModel.onEnterComposer(
            seededByDoor = repostOfId != null || seededByDoor || editStoryId != null || recomposeStoryId != null,
            initialVisibility = initialVisibility,
        )
        onDispose { viewModel.persistDraft() }
    }

    StoryEditGate(editStoryId = editStoryId, viewModel = viewModel, onClose = onClose)
    StoryRecomposeGate(recomposeStoryId = recomposeStoryId, viewModel = viewModel, onClose = onClose)
    val capture = rememberStorySceneCapture(opening, viewModel)

    val pickers = rememberStoryMediaPickers(state.mediaPickMode, viewModel)

    var sheet by rememberSaveable { mutableStateOf<StoryComposerSheet?>(null) }
    StoryComposerBackgroundSound(state, viewModel, shelfOpen = sheet == StoryComposerSheet.SOUND)

    val close = rememberConfirmedComposerClose(
        hasContent = state.hasDraftContent,
        editingPublished = state.editing,
        onKeep = onClose,
        onDiscard = {
            viewModel.onDiscardDraft()
            onClose()
        },
    )
    var morePanel by rememberSaveable { mutableStateOf<StoryMorePanel?>(null) }
    ComposerBackHandlers(
        close = close,
        onClosePanel = when (state.scenePanel(morePanel)) {
            StoryScenePanel.TOOL -> viewModel::onBandDismiss
            StoryScenePanel.DURATION, StoryScenePanel.CAPTION -> ({ morePanel = null })
            StoryScenePanel.TEXT -> viewModel::onDeselectTextElement
            else -> if (state.selectedSceneObject != null) viewModel::onSceneBackgroundTap else null
        }.takeIf { !capture.armed },
        onCloseSheet = if (sheet?.let(state::serves) == true && !capture.armed) ({ sheet = null }) else null,
    )
    StoryComposerSceneFirst(
        state = state,
        viewModel = viewModel,
        sceneExport = sceneExport,
        doors = StoryComposerDoors(
            onClose = close.request,
            onOpenAudience = { sheet = StoryComposerSheet.AUDIENCE },
            onOpenStickers = { sheet = StoryComposerSheet.STICKERS },
            onPickMedia = pickers.library,
            onOpenSoundShelf = { sheet = StoryComposerSheet.SOUND },
            onPickFiles = pickers.files,
            onPickBackground = pickers.background,
        ),
        morePanel = morePanel,
        onMorePanel = { morePanel = it },
        formatChevron = formatChevron,
        sheet = StorySheetSlot(open = sheet, onDismiss = { sheet = null }, onOpen = { sheet = it }) { open ->
            StoryComposerSheetContent(open, state, viewModel, onDone = { sheet = null })
        },
        capture = capture,
    )
}

/** La feuille ouverte, dans sa coque ancrée ; celles qui se lisent sur la scène sont sombres comme elle. */
@Composable
private fun StoryComposerSheetContent(
    open: StoryComposerSheet,
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    onDone: () -> Unit,
) {
    if (open.isDarkOnScene) {
        MeeshyTheme(darkTheme = true) { StoryComposerSheetBody(open, state, viewModel, onDone) }
    } else {
        StoryComposerSheetBody(open, state, viewModel, onDone)
    }
}

/** Les stickers, le son, l'audience (#13838), et ce que la publication nomme (#13846). */
@Composable
private fun StoryComposerSheetBody(
    open: StoryComposerSheet,
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    onDone: () -> Unit,
) {
    when (open) {
        StoryComposerSheet.STICKERS -> ComposerAnchoredSheet(fill = true) {
            StoryStickerSheetPanel(viewModel = viewModel, onDismiss = onDone)
        }
        StoryComposerSheet.SOUND -> ComposerAnchoredSheet(fill = true) {
            StorySoundSheet(state = state, composer = viewModel, onDone = onDone)
        }
        StoryComposerSheet.AUDIENCE -> ComposerAnchoredSheet(fill = false) {
            StoryAudiencePanel(
                visibility = state.draft.visibility,
                userIds = state.draft.visibilityUserIds,
                mentions = state.draft.mentions,
                hashtags = state.hashtags,
                onChooseVisibility = viewModel::onVisibilityChange,
                onUserIdsChange = viewModel::onAudienceUserIdsChange,
                onAddMention = viewModel::onAddMention,
                onRemoveMention = viewModel::onRemoveMention,
                onRemoveHashtag = viewModel::onRemoveHashtag,
                onDismiss = onDone,
            )
        }
        StoryComposerSheet.MENTION, StoryComposerSheet.HASHTAGS, StoryComposerSheet.PLACE ->
            StoryReferenceSheet(open, state, viewModel, onDone)
        StoryComposerSheet.OBJECT_EDIT, StoryComposerSheet.OBJECT_TIME, StoryComposerSheet.STICKER_SWAP -> Unit
    }
}

/** Le son de FOND de la diapo, joué en composant (en boucle, dans sa fenêtre propre) tant que l'écran est au premier plan et l'étagère fermée. */
@Composable
private fun StoryComposerBackgroundSound(state: StoryComposerUiState, viewModel: StoryComposerViewModel, shelfOpen: Boolean) {
    val screenState by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val backgroundSound = state.selectedSlideBackgroundSound
    val soundPlays = ComposerSoundPlacement.playsWhileComposing(
        track = backgroundSound,
        screenResumed = screenState.isAtLeast(Lifecycle.State.RESUMED),
        shelfOpen = shelfOpen,
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
}

/** Les sélecteurs du système : la photothèque, les fichiers (appui long sur Média), et un média choisi comme fond (#13845). */
private class StoryMediaPickers(val library: () -> Unit, val files: () -> Unit, val background: () -> Unit)

/**
 * Le sélecteur photo/vidéo du système, et l'importateur de fichiers filtré sur les images et les vidéos : ils lisent les
 * fichiers choisis hors du fil principal et les remettent au ViewModel. Le contrat de la photothèque (un seul ou plusieurs)
 * suit les places libres, pour qu'une seule place ne déclenche jamais `maxItems > 1` ; le fond n'en prend qu'un.
 */
@Composable
private fun rememberStoryMediaPickers(mode: StoryMediaPickMode, viewModel: StoryComposerViewModel): StoryMediaPickers {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    fun dispatchPicked(uris: List<Uri>, asBackground: Boolean = false) {
        if (uris.isEmpty()) return
        scope.launch {
            val items = withContext(Dispatchers.IO) {
                uris.mapNotNull { context.readMediaUploadItem(it) }
            }
            if (items.isNotEmpty()) viewModel.onMediaPicked(items, asBackground = asBackground)
        }
    }
    val pickSingle = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? -> dispatchPicked(listOfNotNull(uri)) }
    val pickMultiple = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(StoryComposerDraft.MAX_MEDIA),
    ) { uris: List<Uri> -> dispatchPicked(uris) }
    val pickFiles = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris: List<Uri> -> dispatchPicked(uris) }
    val pickBackground = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? -> dispatchPicked(listOfNotNull(uri), asBackground = true) }
    val imageAndVideo = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)
    return StoryMediaPickers(
        library = {
            when (mode) {
                StoryMediaPickMode.Single -> pickSingle.launch(imageAndVideo)
                StoryMediaPickMode.Multiple -> pickMultiple.launch(imageAndVideo)
                StoryMediaPickMode.None -> Unit
            }
        },
        files = { if (mode != StoryMediaPickMode.None) pickFiles.launch(MEDIA_FILE_TYPES) },
        background = { if (mode != StoryMediaPickMode.None) pickBackground.launch(imageAndVideo) },
    )
}

private val MEDIA_FILE_TYPES = arrayOf("image/*", "video/*")
