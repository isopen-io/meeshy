package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.edit.ComposerBackgroundSource
import me.meeshy.sdk.media.readMediaUploadItem
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import me.meeshy.sdk.model.StoryVisibility
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.flowWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.composer.ComposerOpening
import me.meeshy.ui.theme.MeeshyTheme

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
    /** La porte a promis qu'on écrirait d'emblée (#13863) : en post ou en réel, « Texte du post » s'ouvre une fois, clavier levé. */
    raisePostText: Boolean = false,
    onPostTextRaised: () -> Unit = {},
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
    // Tuer l'app passe par l'arrière-plan (#13869, iOS didEnterBackground) : la dernière fenêtre où l'écriture n'attend pas l'accalmie.
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { viewModel.persistDraft() }

    StoryEditGate(editStoryId = editStoryId, viewModel = viewModel, onClose = onClose)
    StoryRecomposeGate(recomposeStoryId = recomposeStoryId, viewModel = viewModel, onClose = onClose)
    val capture = rememberStorySceneCapture(opening, viewModel)

    val pickers = rememberStoryMediaPickers(state.mediaPickMode, viewModel)

    var sheet by rememberSaveable { mutableStateOf<StoryComposerSheet?>(null) }
    // La scène joue en continu ses vidéos et ses sons, fond compris (#13863, loi 6) ; l'étagère des sons, qui fait écouter les siens, la tait.
    val live = rememberComposerLive(state, viewModel, shelfOpen = sheet == StoryComposerSheet.SOUND)

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
    LaunchedEffect(raisePostText, state.writesPostText) {
        if (!raisePostText || !state.writesPostText) return@LaunchedEffect
        morePanel = StoryMorePanel.POST_TEXT
        onPostTextRaised()
    }
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
    CompositionLocalProvider(LocalComposerLive provides live) {
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
            onPickBackground = { pickers.background(null) },
            onReplaceBackground = { source, replacing -> pickers.replace(source, replacing) },
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
        StoryComposerSheet.OBJECT_EDIT, StoryComposerSheet.OBJECT_TIME, StoryComposerSheet.STICKER_SWAP, StoryComposerSheet.PLACE_REPOINT,
        StoryComposerSheet.BACKGROUND_SOURCE, StoryComposerSheet.BACKGROUND_DESCRIPTION -> Unit
    }
}

/**
 * Les sélecteurs du système : la photothèque, les fichiers (appui long sur Média), un média choisi comme fond (#13845),
 * et « Fond › Remplacer » depuis la photothèque ou les fichiers (#13973) — [background] et [backgroundFiles] reçoivent le
 * fond qu'ils remplacent, `null` quand ils n'en remplacent aucun.
 */
private class StoryMediaPickers(
    val library: () -> Unit,
    val files: () -> Unit,
    val background: (replacing: String?) -> Unit,
    val backgroundFiles: (replacing: String) -> Unit,
) {
    fun replace(source: ComposerBackgroundSource, replacing: String) = when (source) {
        ComposerBackgroundSource.FILES -> backgroundFiles(replacing)
        ComposerBackgroundSource.LIBRARY, ComposerBackgroundSource.CAMERA -> background(replacing)
    }
}

/**
 * Le sélecteur photo/vidéo du système, et l'importateur de fichiers filtré sur les images et les vidéos : ils lisent les
 * fichiers choisis hors du fil principal et les remettent au ViewModel. Le contrat de la photothèque (un seul ou plusieurs)
 * suit les places libres, pour qu'une seule place ne déclenche jamais `maxItems > 1` ; le fond n'en prend qu'un.
 */
@Composable
private fun rememberStoryMediaPickers(mode: StoryMediaPickMode, viewModel: StoryComposerViewModel): StoryMediaPickers {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var replacing by remember { mutableStateOf<String?>(null) }
    fun dispatchPicked(uris: List<Uri>, asBackground: Boolean = false) {
        val replaced = replacing.takeIf { asBackground }
        replacing = null
        if (uris.isEmpty()) return
        scope.launch {
            val items = withContext(Dispatchers.IO) {
                uris.mapNotNull { context.readMediaUploadItem(it) }
            }
            if (items.isNotEmpty()) viewModel.onMediaPicked(items, asBackground = asBackground, replacing = replaced)
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
    val pickBackgroundFile = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
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
        background = { replaced ->
            if (mode != StoryMediaPickMode.None) {
                replacing = replaced
                pickBackground.launch(imageAndVideo)
            }
        },
        backgroundFiles = { replaced ->
            if (mode != StoryMediaPickMode.None) {
                replacing = replaced
                pickBackgroundFile.launch(MEDIA_FILE_TYPES)
            }
        },
    )
}

private val MEDIA_FILE_TYPES = arrayOf("image/*", "video/*")
