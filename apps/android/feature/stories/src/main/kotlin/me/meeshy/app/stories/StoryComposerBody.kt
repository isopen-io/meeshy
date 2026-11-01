package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerEditingChrome
import me.meeshy.sdk.model.composer.ComposerRailContent
import me.meeshy.sdk.model.composer.ComposerMediaSource
import me.meeshy.sdk.model.composer.ComposerMoreEntry
import me.meeshy.sdk.model.composer.ComposerSceneReferences
import me.meeshy.sdk.model.composer.ComposerSceneTool
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.composer.ComposerSelectionSubject
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundSource
import me.meeshy.sdk.model.composer.ComposerSceneTools
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.composer.scene.ComposerSceneEffect
import me.meeshy.ui.component.chrome.StatusBarIconsOverDark
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Ce que l'écran ouvre pour le compositeur : les sélecteurs du système et les feuilles qu'il tient. [onPickFiles] : l'appui
 * long sur Média, « Depuis les fichiers » ; [onPickBackground] : « ⋯ › Choisir un fond », dont le média devient le fond (#13845) ;
 * [onReplaceBackground] : « Fond › Remplacer » depuis la photothèque ou les fichiers, le fond [replacing] quittant la diapo
 * une fois le nouveau arrivé (#13973).
 */
internal class StoryComposerDoors(
    val onClose: () -> Unit,
    val onOpenAudience: () -> Unit,
    val onOpenStickers: () -> Unit,
    val onPickMedia: () -> Unit,
    val onOpenSoundShelf: () -> Unit,
    val onPickFiles: () -> Unit = {},
    val onPickBackground: () -> Unit = {},
    val onReplaceBackground: (source: ComposerBackgroundSource, replacing: String) -> Unit = { _, _ -> },
)

/**
 * Le compositeur de story, la scène d'abord (#13834) — UNE disposition pour l'hôte et pour la route autonome
 * (republication, modification, audience d'onboarding) : la scène plein écran, ✕ et ↶↷ en haut, la rangée des diapos dès
 * deux, les six outils à droite, le panneau du geste en cours, puis la pastille d'audience et « Publier la story ▾ ». Un
 * objet touché met le compositeur en édition ([me.meeshy.sdk.model.composer.ComposerEditingChrome], #13956) : ✕,
 * l'audience et Publier se retirent, et la colonne des outils porte, à la même place, ses options ; le pinceau en main n'a
 * que sa barre de dessin. [formatChevron] est le menu « Publier comme » de
 * l'hôte ; la route autonome n'en a pas. [sheet] est la feuille ouverte (stickers, sons, audience, ou celles de l'élément
 * sélectionné), ancrée en bas : la scène se réduit au-dessus d'elle (#13838). Un texte qu'on écrit, ou la légende, prend l'état de frappe (#13835) : la
 * scène réduite au-dessus d'une barre collée au clavier, et rien d'autre. Quand la fenêtre a la place de deux rails
 * (#13837), les outils et le « ⋯ » vont dans un rail gauche libellé, la sélection et ↶↷ dans un rail droit, et Publier
 * sous la scène.
 */
@Composable
internal fun StoryComposerSceneFirst(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sceneExport: SceneExportHost,
    doors: StoryComposerDoors,
    morePanel: StoryMorePanel?,
    onMorePanel: (StoryMorePanel?) -> Unit,
    formatChevron: (@Composable () -> Unit)?,
    sheet: StorySheetSlot = StorySheetSlot(open = null, onDismiss = {}) {},
    keyboard: TypingKeyboard? = null,
    capture: StorySceneCapture? = null,
) {
    StatusBarIconsOverDark()
    // La scène, ses feuilles et son socle nomment le format qu'elle compose (#13913) : posé ici, sous chaque porte.
    CompositionLocalProvider(LocalComposerSceneNoun provides state.variant.noun) {
        SceneFirstFrame(state, viewModel, sceneExport, doors, morePanel, onMorePanel, formatChevron, sheet, keyboard, capture)
    }
}

@Composable
private fun SceneFirstFrame(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sceneExport: SceneExportHost,
    doors: StoryComposerDoors,
    morePanel: StoryMorePanel?,
    onMorePanel: (StoryMorePanel?) -> Unit,
    formatChevron: (@Composable () -> Unit)?,
    sheet: StorySheetSlot,
    keyboard: TypingKeyboard?,
    capture: StorySceneCapture?,
) {
    val comparison = remember { LookComparison() }
    val armed = capture?.armed == true
    val panel = state.scenePanel(morePanel)?.takeIf { !armed }
    val typing = rememberStoryTyping(state, viewModel, morePanel, onMorePanel, keyboard)
    val besideScene = state.editingChrome(viewfinderArmed = armed, gestureOpen = panel != null || typing != null)
    val subject = state.selectionSubject
    val selection = state.selectionBar?.takeIf { subject == ComposerSelectionSubject.OBJECT && panel == null && typing == null && !armed }
    val openedFor = remember(sheet.open) { subject }
    val openSheet = sheet.open?.takeIf(state::serves)?.takeIf { !it.servesSelection || openedFor == subject }
    val edition = rememberSceneEdition(state, viewModel, SceneEditionHost(sheet, doors, capture), besideScene.editing && openSheet == null, selection,
        quiet = panel != null || typing != null || armed)
    val reduced = (panel != null || edition.anyBand) && typing == null
    val editing = state.editingChrome(viewfinderArmed = armed, gestureOpen = panel != null || typing != null, sceneReduced = reduced)
    val chrome = editing.sceneControls
    val levels = edition.levels
    val edited = edition.edited
    val placed = edited.placed
    val captureOffered = capture?.offeredOn(state, somethingOpen = panel != null || typing != null || openSheet != null) == true
    StaleSheetReleased(stale = sheet.open != null && openSheet == null, onRelease = sheet.onDismiss)
    val dialogs = rememberStoryOverflowDialogs(state, viewModel)
    val more = StoryMoreHost(sceneExport, doors, dialogs, onMorePanel, sheet.onOpen, capture)
    val rails = storySceneRails(state, viewModel, more, edited, morePanel, formatChevron, besideScene to levels)
    Box(Modifier.fillMaxSize()) {
        StorySceneFirstLayout(
            onDismiss = doors.onClose,
            reduced = reduced,
            scene = { modifier ->
                CompositionLocalProvider(LocalPlacedReframe provides placedReframe(edition.placedBand, placed, viewModel)) {
                    StoryComposerScene(state, viewModel, comparison, modifier, capture, captureOffered)
                }
            },
            top = { StorySceneTop(state, viewModel, doors.onClose, editing) },
            strip = { if (chrome) StorySlideStrip(state, viewModel) },
            trailing = {
                SceneRail(
                    content = editing.rail,
                    tools = { StorySceneTools(state, viewModel, more, ComposerSceneTools.column) },
                    options = { SceneEditingOptions(edited, levels) },
                    background = { SceneEditingBackground(edited, levels) },
                )
            },
            panel = {
                panel?.let {
                    StoryComposerBottomPanel(
                        panel = it,
                        state = state,
                        viewModel = viewModel,
                        comparison = comparison,
                        toolPanel = {
                            StoryComposerPanel(state, viewModel, onPickMedia = doors.onPickMedia, onOpenSoundShelf = doors.onOpenSoundShelf)
                        },
                        onCloseLocal = { onMorePanel(null) },
                    )
                } ?: SceneEditingBand(edition, state, viewModel, comparison)
            },
            socle = {
                if (chrome) StorySocle(state, viewModel, doors, formatChevron, sheet.onOpen, editing.publication) { onMorePanel(StoryMorePanel.POST_TEXT) }
            },
            sheet = openSheet,
            onSheetDismiss = sheet.onDismiss,
            sheetContent = { open -> SceneSheetContent(open, state, viewModel, comparison, sheet, edited.background) },
            typing = typing,
            rails = rails,
            incoming = state.incomingPlaceholder()?.let { placeholder -> { IncomingMediaPlaceholderLayer(placeholder, viewModel::onCancelMediaPick) } },
            clearsTrailingLane = (selection != null || (reduced && editing.rail == ComposerRailContent.BACKGROUND_OPTIONS)) && openSheet == null,
        )
        EditingAnnouncer(editing = editedWord(state, editing.editing))
        edited.background?.let { BackgroundRemoveConfirmation(it) }
    }
}

/** Ce que l'hôte tient pour l'édition : les feuilles, les portes de l'écran et le viseur. */
private class SceneEditionHost(val sheet: StorySheetSlot, val doors: StoryComposerDoors, val capture: StorySceneCapture?)

/** La pile des niveaux d'édition et ce qu'elle porte : l'objet ou le fond sélectionné, et la bande du réglage ouvert. */
private class SceneEdition(
    val levels: EditingLevels<StoryEditingLevel>,
    val edited: SceneEdited,
    val band: me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool?,
    val placedBand: me.meeshy.sdk.model.composer.edit.ComposerPlacedMediaTool?,
    val soundBand: PlacedSoundTool?,
) {
    val anyBand: Boolean get() = band != null || placedBand != null || soundBand != null
}

/**
 * La pile des niveaux de la sélection (#13956, #13973) : le rail « Fond » à plat pour le fond média, les options de l'objet
 * — les outils d'une image, d'une vidéo ou d'un son posés à plat, #14047 — pour un objet, puis la bande d'un réglage.
 * [quiet] : un panneau, une frappe ou le viseur occupent le bas.
 */
@Composable
private fun rememberSceneEdition(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    host: SceneEditionHost,
    backEnabled: Boolean,
    selection: SceneSelectionBar?,
    quiet: Boolean,
): SceneEdition {
    val sheet = host.sheet
    val subject = state.selectionSubject
    val root = if (subject == ComposerSelectionSubject.BACKGROUND) StoryEditingLevel.Background else StoryEditingLevel.ObjectOptions
    val levels = rememberEditingLevels(root, root to state.selectedSceneObject, backEnabled = backEnabled)
    val background = rememberSceneBackground(state, viewModel, sheet, host.doors, host.capture)?.takeIf { !quiet }
    val tools = background?.let {
        backgroundTools(state, viewModel, onBand = { tool -> levels.onPush(StoryEditingLevel.BackgroundBand(tool)) }) {
            sheet.onOpen(StoryComposerSheet.BACKGROUND_DESCRIPTION)
        }
    }
    val band = levels.backgroundBand(tools)
    val placed = rememberPlacedTools(state, viewModel, selection, onBand = { tool -> levels.onPush(StoryEditingLevel.ObjectBand(tool)) }) {
        sheet.onOpen(StoryComposerSheet.BACKGROUND_DESCRIPTION)
    }
    val placedBand = levels.placedBand(placed)
    val objectTools = placed?.railTools() ?: selection?.let { state.soundRailTools(viewModel) { tool -> levels.onPush(StoryEditingLevel.SoundBand(tool)) } }
    val onSelectionAction = { bar: SceneSelectionBar, action: ComposerSelectionAction -> viewModel.onSelectionAction(bar.ref, action, sheet.onOpen) }
    val edited = SceneEdited(selection, background, onSelectionAction, tools, placed, objectTools.orEmpty())
    return SceneEdition(levels, edited, band, placedBand, levels.soundBand(state).takeIf { selection != null })
}

/** Les niveaux de l'objet posé sélectionné dans la colonne de la scène : ses outils à plat et ses options, puis le titre d'un réglage. */
@Composable
private fun SceneEditingOptions(edited: SceneEdited, levels: EditingLevels<StoryEditingLevel>) {
    val bar = edited.selection ?: return
    StoryEditingLevels(levels, back = { SceneLevelBack(it) }) {
        SceneOptionColumn(bar, edited.objectTools) { action -> edited.onSelectionAction(bar, action) }
    }
}

/** Les niveaux du fond média sélectionné dans la colonne de la scène : le rail « Fond » à plat, puis le titre d'un réglage. */
@Composable
private fun SceneEditingBackground(edited: SceneEdited, levels: EditingLevels<StoryEditingLevel>) {
    val background = edited.background ?: return
    val tools = edited.tools ?: return
    StoryEditingLevels(levels, back = { SceneLevelBack(it) }, background = { level -> BackgroundLevelContent(level, background, tools, wide = false) }) {}
}

/** La bande du réglage ouvert au bas de la scène : celle du fond, ou celle du média posé ; rien quand aucun réglage n'est ouvert. */
@Composable
private fun SceneEditingBand(edition: SceneEdition, state: StoryComposerUiState, viewModel: StoryComposerViewModel, comparison: LookComparison) {
    val band = edition.band
    val placedBand = edition.placedBand
    val placed = edition.edited.placed
    when {
        band != null -> ScenePanelSurface { BackgroundBand(band, state, viewModel, comparison) }
        placedBand != null && placed != null -> ScenePanelSurface { PlacedMediaBand(placedBand, placed.mediaId, state, viewModel, comparison) }
        edition.soundBand != null -> ScenePanelSurface { SoundBand(edition.soundBand, state, viewModel) }
    }
}

/** La feuille ouverte : les sources de « Remplacer » du fond, les propriétés de l'élément sélectionné, ou ce que l'hôte tient. */
@Composable
private fun SceneSheetContent(
    open: StoryComposerSheet,
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    comparison: LookComparison,
    sheet: StorySheetSlot,
    background: BackgroundEditing?,
) {
    when {
        open == StoryComposerSheet.BACKGROUND_SOURCE -> background?.let { BackgroundSourceSheet(it, onDone = sheet.onDismiss) }
        open == StoryComposerSheet.BACKGROUND_DESCRIPTION -> BackgroundDescriptionSheet(state, viewModel, onDone = sheet.onDismiss)
        open.servesSelection -> StorySelectionSheet(open, state, viewModel, comparison, onDone = { sheet.onDismiss(); viewModel.onSceneBackgroundTap() })
        else -> sheet.content(open)
    }
}

/** Le niveau « Fond » du fond média sélectionné ; « Remplacer › Prendre une photo » arme le viseur de la scène pour ce fond. */
@Composable
private fun rememberSceneBackground(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sheet: StorySheetSlot,
    doors: StoryComposerDoors,
    capture: StorySceneCapture?,
): BackgroundEditing? = rememberBackgroundEditing(state, viewModel, sheet.onOpen, cameraServed = capture?.offer != null) { source, replacing ->
    if (source == ComposerBackgroundSource.CAMERA) capture?.arm(replacingBackground = replacing) else doors.onReplaceBackground(source, replacing)
}

/** Le mot de ce qui est en édition, pour TalkBack : la famille de l'objet, ou « Fond » pour le fond média (#13973). */
@Composable
private fun editedWord(state: StoryComposerUiState, editing: Boolean): String? {
    val ref = state.selectedSceneObject?.takeIf { editing } ?: return null
    return if (state.selectionSubject == ComposerSelectionSubject.BACKGROUND) stringResource(R.string.stories_composer_background)
    else familyWord(state.familyOf(ref))
}

/**
 * Ce qui est en édition, pour les rails : la barre d'un objet posé et ses outils à plat ([objectTools] : ceux d'une image,
 * d'une vidéo ou d'un son), ou le rail « Fond » du fond média et ses outils ([tools]).
 */
private class SceneEdited(
    val selection: SceneSelectionBar?,
    val background: BackgroundEditing?,
    val onSelectionAction: (SceneSelectionBar, ComposerSelectionAction) -> Unit,
    val tools: BackgroundTools? = null,
    val placed: PlacedTools? = null,
    val objectTools: List<RailTool> = emptyList(),
)

/**
 * Les niveaux de la colonne en édition : le premier porte les options de l'objet et ses outils à plat ([objectOptions]) ;
 * ceux du fond se rendent par [background] ; le titre du réglage d'un média ou d'un son posés se pose par-dessus.
 */
@Composable
private fun StoryEditingLevels(
    levels: EditingLevels<StoryEditingLevel>,
    back: @Composable (onBack: () -> Unit) -> Unit,
    background: @Composable (StoryEditingLevel) -> Unit = {},
    objectOptions: @Composable () -> Unit,
) {
    EditingRailLevels(levels, back) { level ->
        when (level) {
            StoryEditingLevel.ObjectOptions -> objectOptions()
            is StoryEditingLevel.ObjectBand -> PlacedLevelContent(level)
            is StoryEditingLevel.SoundBand -> SoundLevelContent(level)
            else -> background(level)
        }
    }
}

/** ✕ et ↶↷ ; en édition d'un objet (#13956), ✕ se retire et la barre garde sa hauteur, ↶↷ restent. */
@Composable
private fun StorySceneTop(state: StoryComposerUiState, viewModel: StoryComposerViewModel, onClose: () -> Unit, editing: ComposerEditingChrome) {
    SceneTopBar(
        onClose = onClose,
        history = SceneHistory(state.canUndo, state.canRedo)
            .takeIf { editing.sceneControls && ComposerSceneTools.showsHistory(state.canUndo, state.canRedo) },
        onUndo = viewModel::onUndo,
        onRedo = viewModel::onRedo,
        showsClose = editing.close,
        keepsHeight = editing.sceneControls,
    )
}

/** La rangée des vignettes, posée en haut de la scène, seulement à partir de deux diapos ; « + » est dans « ⋯ ». */
@Composable
private fun StorySlideStrip(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    if (!ComposerSceneTools.showsSlideStrip(state.deck.size)) return
    val backgrounds = remember(state.deck.slides, state.attachments, state.pendingUploads) {
        state.deck.slides.associate { it.id to state.thumbnailBackgroundOf(it, viewModel.mediaBaseUrl) }
    }
    val placedMedia = remember(state.deck.slides, state.attachments, state.pendingUploads) {
        state.deck.slides.associate { it.id to state.thumbnailPlacedOf(it, viewModel.mediaBaseUrl) }
    }
    ComposerSlideRail(
        deck = state.deck,
        backgrounds = backgrounds,
        accentHex = viewModel.authorAccentHex,
        canvasWidthPx = state.canvasWidthPx,
        onSelect = viewModel::onSelectSlide,
        onAdd = {},
        onDuplicate = rememberGuardedAddition(state.canAddSlide, state.addSlideRefusalRes(), action = viewModel::onDuplicateSelectedSlide),
        onRemove = viewModel::onRemoveSlide,
        onMove = viewModel::onMoveSlide,
        showsAdd = false,
        onEditBackground = viewModel::onEditSlideBackground,
        placedMedia = placedMedia,
    )
}

/** Ce que les outils et le « ⋯ » atteignent hors du view model : l'export, les portes de l'écran, l'aperçu et l'effacement. */
private class StoryMoreHost(
    val sceneExport: SceneExportHost,
    val doors: StoryComposerDoors,
    val dialogs: StoryOverflowDialogs,
    val onMorePanel: (StoryMorePanel?) -> Unit,
    val onOpenSheet: (StoryComposerSheet) -> Unit,
    val capture: StorySceneCapture? = null,
) {
    /** La caméra de la scène, proposée par l'appui long sur Média tant que le viseur est éteint (#13849). */
    val cameraServed: Boolean get() = capture?.offer != null && !capture.armed
}

/** Les outils posés sur la scène, Fond, Mention et Lieu compris (#14049) ; le « ⋯ » range le reste, l'appui long sur Média propose ses sources. */
@Composable
private fun StorySceneTools(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    more: StoryMoreHost,
    tools: List<ComposerSceneTool>,
) {
    val onTool = rememberSceneToolAction(state, viewModel, more)
    val onEntry = rememberMoreEntryAction(state, viewModel, more)
    SceneToolColumn(
        tools = tools,
        active = state.activeSceneTool(),
        onTool = onTool,
        more = {
            ComposerMoreMenu(
                entries = moreEntriesOf(state, more.sceneExport),
                animated = state.sceneIsAnimated,
                exportEnabled = !more.sceneExport.isExporting && !state.isPublishing,
                onPick = onEntry,
            )
        },
        onMediaSource = rememberMediaSourceAction(state, more.doors, more.onMorePanel, more.capture),
        cameraServed = more.cameraServed,
    )
}

/**
 * Grand écran (#13837) : les mêmes outils et les mêmes entrées, dans un rail gauche libellé ; la sélection dans le rail
 * droit, ↶↷ à son pied ; Publier sous la scène. Le pinceau en main, tout se tait comme sur le petit écran.
 */
@Composable
private fun storySceneRails(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    more: StoryMoreHost,
    scene: SceneEdited,
    morePanel: StoryMorePanel?,
    formatChevron: (@Composable () -> Unit)?,
    edition: Pair<ComposerEditingChrome, EditingLevels<StoryEditingLevel>>,
): StorySceneRails {
    val (editing, levels) = edition
    val chrome = editing.sceneControls
    val onSelectionAction = scene.onSelectionAction
    val edited = scene.selection?.takeIf { editing.editing }
    val background = scene.background?.takeIf { editing.editing }
    val tools = scene.tools
    val doors = more.doors
    val sceneExport = more.sceneExport
    val onTool = rememberSceneToolAction(state, viewModel, more)
    val onEntry = rememberMoreEntryAction(state, viewModel, more)
    val onMediaSource = rememberMediaSourceAction(state, doors, more.onMorePanel, more.capture)
    val model = LeadingRailModel(
        showsClose = editing.close,
        showsTools = chrome && !editing.editing,
        activeTool = state.activeSceneTool(),
        openEntry = state.openMoreEntry(morePanel),
        moreEntries = moreEntriesOf(state, sceneExport),
        animated = state.sceneIsAnimated,
        exportEnabled = !sceneExport.isExporting && !state.isPublishing,
        cameraServed = more.cameraServed,
    )
    return StorySceneRails(
        leading = {
            val back: @Composable (() -> Unit) -> Unit = { LabeledRailItem(MeeshyIcons.Back, stringResource(R.string.composer_editing_back), it) }
            when {
                edited != null -> StoryEditingLevels(levels, back) {
                    StoryEditingRail(edited, scene.objectTools) { action -> onSelectionAction(edited, action) }
                }
                background != null && tools != null ->
                    StoryEditingLevels(levels, back, background = { level -> BackgroundLevelContent(level, background, tools, wide = true) }) {}
                else -> StoryLeadingRail(model, doors.onClose, onTool, onEntry, onMediaSource)
            }
        },
        trailing = {
            StoryTrailingRail(
                history = SceneHistory(state.canUndo, state.canRedo)
                    .takeIf { chrome && ComposerSceneTools.showsHistory(state.canUndo, state.canRedo) },
                onUndo = viewModel::onUndo,
                onRedo = viewModel::onRedo,
            )
        },
        socle = { if (chrome) StorySocleNotice(state, viewModel::onRetryMediaPick) },
        below = { if (chrome && editing.publication) StoryPublish(state, viewModel, doors, formatChevron) { more.onMorePanel(StoryMorePanel.POST_TEXT) } },
    )
}

/** L'entrée du « ⋯ » dont le panneau est ouvert : Temps, ou la durée de la diapo. */
private fun StoryComposerUiState.openMoreEntry(morePanel: StoryMorePanel?): ComposerMoreEntry? = when {
    band.activeTool == StoryToolMode.TIMELINE -> ComposerMoreEntry.TIMING
    morePanel == StoryMorePanel.DURATION -> ComposerMoreEntry.SLIDE_DURATION
    else -> null
}

private fun StoryComposerUiState.activeSceneTool(): ComposerSceneTool? = when (band.activeTool) {
    StoryToolMode.MEDIA -> ComposerSceneTool.MEDIA
    StoryToolMode.AUDIO -> ComposerSceneTool.SOUND
    StoryToolMode.TEXTURE -> ComposerSceneTool.BACKGROUND
    else -> null
}

/**
 * Texte pose un texte, Média et Son ouvrent leur sélecteur (ou leur panneau s'il y a déjà de quoi), Dessin prend le pinceau,
 * Fond ouvre son panneau, Mention et Lieu leur feuille (#14049).
 */
@Composable
private fun rememberSceneToolAction(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    more: StoryMoreHost,
): (ComposerSceneTool) -> Unit {
    val doors = more.doors
    val addText = rememberGuardedAddition(state.deck.selectedCanAddTextElement, R.string.composer_scene_cap_text, viewModel::onAddTextElement)
    val openStickers = rememberGuardedAddition(state.deck.selectedCanAddSticker, R.string.composer_scene_cap_sticker, doors.onOpenStickers)
    val pickMedia = rememberGuardedAddition(state.deck.selectedCanAddMedia, R.string.composer_scene_cap_media, doors.onPickMedia)
    val hasMedia = state.selectedSlideAttachments.isNotEmpty() || state.selectedSlidePending.isNotEmpty() || state.isUploadingMedia
    return { tool ->
        more.onMorePanel(null)
        when (tool) {
            ComposerSceneTool.TEXT -> addText()
            ComposerSceneTool.MEDIA -> if (hasMedia) viewModel.onBandToolTap(StoryToolMode.MEDIA) else pickMedia()
            ComposerSceneTool.STICKER -> openStickers()
            ComposerSceneTool.SOUND -> doors.onOpenSoundShelf()
            ComposerSceneTool.DRAWING -> viewModel.onEnterDrawingMode()
            ComposerSceneTool.BACKGROUND -> viewModel.onBandToolSwipeUp(StoryToolMode.TEXTURE)
            ComposerSceneTool.MENTION -> more.onOpenSheet(StoryComposerSheet.MENTION)
            ComposerSceneTool.PLACE -> more.onOpenSheet(StoryComposerSheet.PLACE)
            ComposerSceneTool.MORE -> Unit
        }
    }
}

private fun moreEntriesOf(state: StoryComposerUiState, sceneExport: SceneExportHost): List<ComposerMoreEntry> =
    ComposerSceneTools.moreEntries(
        ComposerSceneTools.MoreInput(
            editsSlides = !state.editing,
            animated = state.sceneIsAnimated,
            sceneEffects = state.servedSceneEffects,
            exports = sceneExport.entries,
            hasContent = state.deck.publishableSlides.isNotEmpty(),
            hasBackground = StoryComposerEraseReducer.hasBackground(state),
            canPickBackground = StoryComposerEraseReducer.canPickBackground(state),
            hasSomethingToErase = StoryComposerEraseReducer.hasSomethingToErase(state),
            captionsSlides = state.variant.captionsSlides,
        ),
    )

/** L'appui long sur Média : la caméra de la scène, la photothèque ou les fichiers, sous le même plafond que le toucher. */
@Composable
private fun rememberMediaSourceAction(
    state: StoryComposerUiState,
    doors: StoryComposerDoors,
    onMorePanel: (StoryMorePanel?) -> Unit,
    capture: StorySceneCapture?,
): (ComposerMediaSource) -> Unit {
    val camera = rememberGuardedAddition(state.deck.selectedCanAddMedia, R.string.composer_scene_cap_media) { capture?.arm() }
    val library = rememberGuardedAddition(state.deck.selectedCanAddMedia, R.string.composer_scene_cap_media, doors.onPickMedia)
    val files = rememberGuardedAddition(state.deck.selectedCanAddMedia, R.string.composer_scene_cap_media, doors.onPickFiles)
    return { source ->
        onMorePanel(null)
        when (source) {
            ComposerMediaSource.CAMERA -> camera()
            ComposerMediaSource.PHOTO_LIBRARY -> library()
            ComposerMediaSource.FILES -> files()
        }
    }
}

/** Ce que fait chaque entrée du « ⋯ », qu'on la touche dans le menu de la scène ou dans le rail du grand écran. */
@Composable
private fun rememberMoreEntryAction(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    more: StoryMoreHost,
): (ComposerMoreEntry) -> Unit {
    val addSlide = rememberGuardedAddition(state.canAddSlide, state.addSlideRefusalRes(), action = viewModel::onAddSlide)
    val onMorePanel = more.onMorePanel
    return { entry ->
        val local = when (entry) {
            ComposerMoreEntry.SLIDE_DURATION -> StoryMorePanel.DURATION
            ComposerMoreEntry.CAPTION -> StoryMorePanel.CAPTION
            else -> null
        }
        if (local != null) viewModel.onBandDismiss()
        onMorePanel(local)
        when (entry) {
            ComposerMoreEntry.ADD_SLIDE -> addSlide()
            ComposerMoreEntry.ANIMATION -> viewModel.onSceneReduce(StoryComposerSceneReducer::animationToggled)
            ComposerMoreEntry.TIMING -> viewModel.onBandToolSwipeUp(StoryToolMode.TIMELINE)
            ComposerMoreEntry.OPENING_EFFECT -> viewModel.onSceneReduce { StoryComposerSelectionReducer.sceneEffectToggled(it, ComposerSceneEffect.OPENING) }
            ComposerMoreEntry.VISUAL_EFFECT -> viewModel.onSceneReduce { StoryComposerSelectionReducer.sceneEffectToggled(it, ComposerSceneEffect.VISUAL) }
            ComposerMoreEntry.SAVE_TO_PHOTOS, ComposerMoreEntry.SHARE -> entry.export?.let(more.sceneExport::start)
            ComposerMoreEntry.PREVIEW -> more.dialogs.preview()
            ComposerMoreEntry.PICK_BACKGROUND -> more.doors.onPickBackground()
            ComposerMoreEntry.REMOVE_BACKGROUND -> viewModel.onRemoveSceneBackground()
            ComposerMoreEntry.CLEAR_ALL -> more.dialogs.clearAll()
            ComposerMoreEntry.HASHTAGS -> more.onOpenSheet(StoryComposerSheet.HASHTAGS)
            ComposerMoreEntry.SLIDE_DURATION, ComposerMoreEntry.CAPTION -> Unit
        }
    }
}

/** Le bas de la scène : ce que l'éditeur a à dire (seulement s'il a quelque chose à dire), puis l'audience et Publier. */
@Composable
private fun StorySocle(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    doors: StoryComposerDoors,
    formatChevron: (@Composable () -> Unit)?,
    onOpenSheet: (StoryComposerSheet) -> Unit,
    publication: Boolean,
    onPostText: () -> Unit,
) {
    if (ComposerSceneReferences.isServed(state.hashtags, state.draft.mentions)) EditingChromeVisibility(publication) {
        ComposerSceneReferenceFooter(
            hashtags = state.hashtags,
            mentions = state.draft.mentions,
            onHashtags = { onOpenSheet(StoryComposerSheet.HASHTAGS) },
            onMentions = { onOpenSheet(StoryComposerSheet.MENTION) },
        )
    }
    StorySocleNotice(state, viewModel::onRetryMediaPick)
    EditingChromeVisibility(publication) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) { StoryPublish(state, viewModel, doors, formatChevron, onPostText) }
    }
}

@Composable
private fun StorySocleNotice(state: StoryComposerUiState, onRetryMedia: () -> Unit) {
    val block = state.publishBlock?.let { stringResource(it.messageRes()) }
    val notice = block ?: sceneNotice(state) ?: return
    val retries = block == null && state.canRetryMedia && state.errorMessage == StoryComposerViewModel.MEDIA_FAILED
    SceneNoticeLine(notice, onRetry = onRetryMedia.takeIf { retries })
}

/** « Texte du post » en post et en réel, puis la pastille d'audience et « Publier … ▾ » : posés sur la scène au petit écran, sous elle au grand. */
@Composable
private fun StoryPublish(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    doors: StoryComposerDoors,
    formatChevron: (@Composable () -> Unit)?,
    onPostText: () -> Unit,
) {
    if (state.writesPostText) PostTextPill(state.postText, onPostText)
    val visibility = state.draft.visibility
    val count = state.draft.visibilityUserIds.size
    val label = stringResource(visibility.labelRes())
    ScenePublishSocle(
        audience = SceneAudience(
            label = if (visibility.requiresUserSelection && count > 0) "$label ($count)" else label,
            icon = visibility.icon(),
        ),
        onAudience = doors.onOpenAudience,
        publishLabel = publishLabel(state.publishTitle),
        canPublish = state.canPublish,
        onPublish = viewModel::publish,
        chevron = formatChevron,
    )
}

private fun StoryPublishBlock.messageRes(): Int = when (this) {
    StoryPublishBlock.CAPTION_TOO_LONG -> R.string.composer_publish_block_caption
    StoryPublishBlock.TEXT_TOO_LONG -> R.string.composer_publish_block_text
    StoryPublishBlock.TOO_MANY_TEXTS -> R.string.composer_publish_block_texts
    StoryPublishBlock.TOO_MANY_STICKERS -> R.string.composer_publish_block_stickers
    StoryPublishBlock.TOO_MANY_MEDIA -> R.string.composer_publish_block_media
    StoryPublishBlock.TOO_MANY_SOUNDS -> R.string.composer_publish_block_sounds
    StoryPublishBlock.DURATION_TOO_LONG -> R.string.composer_publish_block_duration
}

/**
 * Une feuille de sélection dont l'élément a quitté la sélection (retiré, ou une piste de la frise en a encadré un autre),
 * ou ouverte pour un objet quand la sélection est passée au fond (« Mettre en fond ») ou l'inverse, est déjà masquée ; elle se referme aussi, sans quoi elle remonterait d'elle-même à la prochaine sélection (#13836).
 */
@Composable
private fun StaleSheetReleased(stale: Boolean, onRelease: () -> Unit) {
    if (stale) LaunchedEffect(Unit) { onRelease() }
}
