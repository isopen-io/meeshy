package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerMoreEntry
import me.meeshy.sdk.model.composer.ComposerSceneTool
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.composer.ComposerSceneTools
import me.meeshy.sdk.model.composer.StoryToolMode
import me.meeshy.sdk.model.composer.scene.ComposerSceneEffect
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** Ce que l'écran ouvre pour le compositeur : les sélecteurs du système et les feuilles qu'il tient. */
internal class StoryComposerDoors(
    val onClose: () -> Unit,
    val onOpenAudience: () -> Unit,
    val onOpenStickers: () -> Unit,
    val onPickMedia: () -> Unit,
    val onOpenSoundShelf: () -> Unit,
)

/**
 * Le compositeur de story, la scène d'abord (#13834) — UNE disposition pour l'hôte et pour la route autonome
 * (republication, modification, audience d'onboarding) : la scène plein écran, ✕ et ↶↷ en haut, la rangée des diapos dès
 * deux, les six outils à droite, le panneau du geste en cours, puis la pastille d'audience et « Publier la story ▾ ». Un
 * objet touché retire les outils et pose sa seule barre d'actions libellées au-dessus de Publier (#13836) ; le pinceau en
 * main n'a que sa barre de dessin. [formatChevron] est le menu « Publier comme » de
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
) {
    val comparison = remember { LookComparison() }
    val panel = state.scenePanel(morePanel)
    val typing = rememberStoryTyping(state, viewModel, morePanel, onMorePanel, keyboard)
    val chrome = ComposerSceneTools.showsSceneChrome(drawing = state.isDrawingActive)
    val tools = ComposerSceneTools.toolsServed(objectFocused = state.selectedObjectControllers != null, drawing = state.isDrawingActive)
    val selection = state.selectionBar?.takeIf { panel == null && typing == null }
    val openSheet = sheet.open?.takeIf(state::serves)
    StaleSheetReleased(stale = sheet.open != null && openSheet == null, onRelease = sheet.onDismiss)
    val onSelectionAction = { bar: SceneSelectionBar, action: ComposerSelectionAction ->
        viewModel.onSelectionAction(bar.ref, action, sheet.onOpen)
    }
    val rails = storySceneRails(state, viewModel, sceneExport, doors, selection, onSelectionAction, morePanel, onMorePanel, formatChevron)
    StorySceneFirstLayout(
        onDismiss = doors.onClose,
        reduced = panel != null && typing == null,
        scene = { modifier -> StoryComposerScene(state, viewModel, sceneExport, comparison, modifier) },
        top = {
            SceneTopBar(
                onClose = doors.onClose,
                history = SceneHistory(state.canUndo, state.canRedo)
                    .takeIf { chrome && ComposerSceneTools.showsHistory(state.canUndo, state.canRedo) },
                onUndo = viewModel::onUndo,
                onRedo = viewModel::onRedo,
                showsClose = chrome,
            )
        },
        strip = { if (chrome) StorySlideStrip(state, viewModel) },
        trailing = { if (tools.isNotEmpty()) StorySceneTools(state, viewModel, sceneExport, doors, tools, onMorePanel) },
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
            }
        },
        socle = {
            selection?.let { bar ->
                ComposerSelectionActionBar(
                    bar = bar,
                    onAction = { action -> onSelectionAction(bar, action) },
                    onOrder = { choice -> viewModel.onObjectController(bar.ref, choice) },
                )
            }
            if (chrome) StorySocle(state, viewModel, doors, formatChevron)
        },
        sheet = openSheet,
        onSheetDismiss = sheet.onDismiss,
        sheetContent = { open ->
            if (open.servesSelection) StorySelectionSheet(open, state, viewModel, comparison, onDone = sheet.onDismiss) else sheet.content(open)
        },
        typing = typing,
        rails = rails,
    )
}

/** La rangée des vignettes, posée en haut de la scène, seulement à partir de deux diapos ; « + » est dans « ⋯ ». */
@Composable
private fun StorySlideStrip(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    if (!ComposerSceneTools.showsSlideStrip(state.deck.size)) return
    val backgrounds = remember(state.deck.slides, state.attachments, state.pendingUploads) {
        state.deck.slides.associate { it.id to state.thumbnailBackgroundOf(it, viewModel.mediaBaseUrl) }
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
    )
}

/** Les six outils posés sur la scène ; le « ⋯ » range le reste. */
@Composable
private fun StorySceneTools(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sceneExport: SceneExportHost,
    doors: StoryComposerDoors,
    tools: List<ComposerSceneTool>,
    onMorePanel: (StoryMorePanel?) -> Unit,
) {
    val onTool = rememberSceneToolAction(state, viewModel, doors, onMorePanel)
    val onEntry = rememberMoreEntryAction(state, viewModel, sceneExport, onMorePanel)
    SceneToolColumn(
        tools = tools,
        active = state.activeSceneTool(),
        onTool = onTool,
        more = {
            ComposerMoreMenu(
                entries = moreEntriesOf(state, sceneExport),
                animated = state.sceneIsAnimated,
                exportEnabled = !sceneExport.isExporting && !state.isPublishing,
                onPick = onEntry,
            )
        },
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
    sceneExport: SceneExportHost,
    doors: StoryComposerDoors,
    selection: SceneSelectionBar?,
    onSelectionAction: (SceneSelectionBar, ComposerSelectionAction) -> Unit,
    morePanel: StoryMorePanel?,
    onMorePanel: (StoryMorePanel?) -> Unit,
    formatChevron: (@Composable () -> Unit)?,
): StorySceneRails {
    val chrome = ComposerSceneTools.showsSceneChrome(drawing = state.isDrawingActive)
    val onTool = rememberSceneToolAction(state, viewModel, doors, onMorePanel)
    val onEntry = rememberMoreEntryAction(state, viewModel, sceneExport, onMorePanel)
    val model = LeadingRailModel(
        showsClose = chrome,
        showsTools = chrome,
        activeTool = state.activeSceneTool(),
        openEntry = state.openMoreEntry(morePanel),
        moreEntries = moreEntriesOf(state, sceneExport),
        animated = state.sceneIsAnimated,
        exportEnabled = !sceneExport.isExporting && !state.isPublishing,
    )
    return StorySceneRails(
        leading = { StoryLeadingRail(model, doors.onClose, onTool, onEntry) },
        trailing = {
            StoryTrailingRail(
                bar = selection,
                history = SceneHistory(state.canUndo, state.canRedo)
                    .takeIf { chrome && ComposerSceneTools.showsHistory(state.canUndo, state.canRedo) },
                onAction = { action -> selection?.let { onSelectionAction(it, action) } },
                onOrder = { choice -> selection?.let { viewModel.onObjectController(it.ref, choice) } },
                onUndo = viewModel::onUndo,
                onRedo = viewModel::onRedo,
            )
        },
        socle = { if (chrome) StorySocleNotice(state) },
        below = { if (chrome) StoryPublish(state, viewModel, doors, formatChevron) },
    )
}

/** L'entrée du « ⋯ » dont le panneau est ouvert : Fond, Temps, ou la durée de la diapo. */
private fun StoryComposerUiState.openMoreEntry(morePanel: StoryMorePanel?): ComposerMoreEntry? = when {
    band.activeTool == StoryToolMode.TEXTURE -> ComposerMoreEntry.BACKGROUND
    band.activeTool == StoryToolMode.TIMELINE -> ComposerMoreEntry.TIMING
    morePanel == StoryMorePanel.DURATION -> ComposerMoreEntry.SLIDE_DURATION
    else -> null
}

private fun StoryComposerUiState.activeSceneTool(): ComposerSceneTool? = when (band.activeTool) {
    StoryToolMode.MEDIA -> ComposerSceneTool.MEDIA
    StoryToolMode.AUDIO -> ComposerSceneTool.SOUND
    else -> null
}

/** Texte pose un texte, Média et Son ouvrent leur sélecteur (ou leur panneau s'il y a déjà de quoi), Dessin prend le pinceau. */
@Composable
private fun rememberSceneToolAction(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    doors: StoryComposerDoors,
    onMorePanel: (StoryMorePanel?) -> Unit,
): (ComposerSceneTool) -> Unit {
    val addText = rememberGuardedAddition(state.deck.selectedCanAddTextElement, R.string.composer_scene_cap_text, viewModel::onAddTextElement)
    val openStickers = rememberGuardedAddition(state.deck.selectedCanAddSticker, R.string.composer_scene_cap_sticker, doors.onOpenStickers)
    val pickMedia = rememberGuardedAddition(state.deck.selectedCanAddMedia, R.string.composer_scene_cap_media, doors.onPickMedia)
    val openShelf = rememberGuardedAddition(state.canBorrowSound, state.soundCapRefusal, doors.onOpenSoundShelf)
    val hasMedia = state.selectedSlideAttachments.isNotEmpty() || state.selectedSlidePending.isNotEmpty() || state.isUploadingMedia
    val hasSound = state.selectedSlideAudio.isNotEmpty()
    return { tool ->
        onMorePanel(null)
        when (tool) {
            ComposerSceneTool.TEXT -> addText()
            ComposerSceneTool.MEDIA -> if (hasMedia) viewModel.onBandToolTap(StoryToolMode.MEDIA) else pickMedia()
            ComposerSceneTool.STICKER -> openStickers()
            ComposerSceneTool.SOUND -> if (hasSound) viewModel.onBandToolTap(StoryToolMode.AUDIO) else openShelf()
            ComposerSceneTool.DRAWING -> viewModel.onEnterDrawingMode()
            ComposerSceneTool.MORE -> Unit
        }
    }
}

private fun moreEntriesOf(state: StoryComposerUiState, sceneExport: SceneExportHost): List<ComposerMoreEntry> =
    ComposerSceneTools.moreEntries(
        ComposerSceneTools.MoreInput(
            editsSlides = !state.editing,
            hasBackgroundMedia = state.selectedSlideSceneBackground != null,
            animated = state.sceneIsAnimated,
            sceneEffects = state.servedSceneEffects,
            exports = sceneExport.entries,
        ),
    )

/** Ce que fait chaque entrée du « ⋯ », qu'on la touche dans le menu de la scène ou dans le rail du grand écran. */
@Composable
private fun rememberMoreEntryAction(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sceneExport: SceneExportHost,
    onMorePanel: (StoryMorePanel?) -> Unit,
): (ComposerMoreEntry) -> Unit {
    val addSlide = rememberGuardedAddition(state.canAddSlide, state.addSlideRefusalRes(), action = viewModel::onAddSlide)
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
            ComposerMoreEntry.BACKGROUND -> viewModel.onBandToolSwipeUp(StoryToolMode.TEXTURE)
            ComposerMoreEntry.ANIMATION -> viewModel.onSceneReduce(StoryComposerSceneReducer::animationToggled)
            ComposerMoreEntry.TIMING -> viewModel.onBandToolSwipeUp(StoryToolMode.TIMELINE)
            ComposerMoreEntry.FRAME -> viewModel.onSceneReduce(StoryComposerSelectionReducer::frameToggled)
            ComposerMoreEntry.OPENING_EFFECT -> viewModel.onSceneReduce { StoryComposerSelectionReducer.sceneEffectToggled(it, ComposerSceneEffect.OPENING) }
            ComposerMoreEntry.VISUAL_EFFECT -> viewModel.onSceneReduce { StoryComposerSelectionReducer.sceneEffectToggled(it, ComposerSceneEffect.VISUAL) }
            ComposerMoreEntry.SAVE_TO_PHOTOS, ComposerMoreEntry.SHARE -> entry.export?.let(sceneExport::start)
            ComposerMoreEntry.SLIDE_DURATION, ComposerMoreEntry.CAPTION -> Unit
        }
    }
}

private val NOTICE_VEIL = Color.Black.copy(alpha = 0.38f)

/** Le bas de la scène : ce que l'éditeur a à dire (seulement s'il a quelque chose à dire), puis l'audience et Publier. */
@Composable
private fun StorySocle(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    doors: StoryComposerDoors,
    formatChevron: (@Composable () -> Unit)?,
) {
    StorySocleNotice(state)
    StoryPublish(state, viewModel, doors, formatChevron)
}

@Composable
private fun StorySocleNotice(state: StoryComposerUiState) {
    val notice = state.publishBlock?.let { stringResource(it.messageRes()) } ?: sceneNotice(state)
    notice?.let {
        Text(
            text = it,
            style = MaterialTheme.typography.bodySmall,
            color = Color.White,
            modifier = Modifier
                .fillMaxWidth()
                .background(NOTICE_VEIL, RoundedCornerShape(MeeshyRadius.sm))
                .padding(horizontal = MeeshySpacing.sm, vertical = 6.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}

/** La pastille d'audience et « Publier la story ▾ » : posés sur la scène au petit écran, sous elle au grand. */
@Composable
private fun StoryPublish(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    doors: StoryComposerDoors,
    formatChevron: (@Composable () -> Unit)?,
) {
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
 * Une feuille de sélection dont l'élément a quitté la sélection (retiré, ou une piste de la frise en a encadré un autre)
 * est déjà masquée ; elle se referme aussi, sans quoi elle remonterait d'elle-même à la prochaine sélection (#13836).
 */
@Composable
private fun StaleSheetReleased(stale: Boolean, onRelease: () -> Unit) {
    if (stale) LaunchedEffect(Unit) { onRelease() }
}
