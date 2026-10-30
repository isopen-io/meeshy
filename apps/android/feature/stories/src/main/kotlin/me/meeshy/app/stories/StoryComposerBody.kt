package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
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
 * deux, les six outils à droite (ou, un objet touché ou le pinceau en main, la colonne de ses réglages), le panneau du
 * geste en cours, puis la pastille d'audience et « Publier la story ▾ ». [formatChevron] est le menu « Publier comme » de
 * l'hôte ; la route autonome n'en a pas. [sheet] est la feuille ouverte (stickers, sons, audience), ancrée en bas : la
 * scène se réduit au-dessus d'elle (#13838).
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
) {
    val comparison = remember { LookComparison() }
    val panel = state.scenePanel(morePanel)
    val chrome = ComposerSceneTools.showsSceneChrome(drawing = state.isDrawingActive)
    val tools = ComposerSceneTools.toolsServed(objectFocused = state.selectedObjectControllers != null, drawing = state.isDrawingActive)
    StorySceneFirstLayout(
        onDismiss = doors.onClose,
        reduced = panel != null,
        scene = { modifier -> StoryComposerScene(state, viewModel, sceneExport, comparison, modifier) },
        top = {
            SceneTopBar(
                onClose = doors.onClose,
                history = SceneHistory(state.canUndo, state.canRedo)
                    .takeIf { tools.isNotEmpty() && ComposerSceneTools.showsHistory(state.canUndo, state.canRedo) },
                onUndo = viewModel::onUndo,
                onRedo = viewModel::onRedo,
                showsClose = chrome,
            )
        },
        strip = { if (chrome) StorySlideStrip(state, viewModel) },
        trailing = {
            if (tools.isNotEmpty()) {
                StorySceneTools(state, viewModel, sceneExport, doors, tools, onMorePanel)
            } else {
                ObjectColumn(state, viewModel)
            }
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
            }
        },
        socle = { if (chrome) StorySocle(state, viewModel, doors, formatChevron) },
        sheet = sheet.open,
        onSheetDismiss = sheet.onDismiss,
        sheetContent = sheet.content,
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

/** Les six outils : Texte pose un texte, Média et Son ouvrent leur sélecteur (ou leur panneau s'il y a déjà de quoi), Dessin prend le pinceau. */
@Composable
private fun StorySceneTools(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sceneExport: SceneExportHost,
    doors: StoryComposerDoors,
    tools: List<ComposerSceneTool>,
    onMorePanel: (StoryMorePanel?) -> Unit,
) {
    val addText = rememberGuardedAddition(state.deck.selectedCanAddTextElement, R.string.composer_scene_cap_text, viewModel::onAddTextElement)
    val openStickers = rememberGuardedAddition(state.deck.selectedCanAddSticker, R.string.composer_scene_cap_sticker, doors.onOpenStickers)
    val pickMedia = rememberGuardedAddition(state.deck.selectedCanAddMedia, R.string.composer_scene_cap_media, doors.onPickMedia)
    val openShelf = rememberGuardedAddition(state.canBorrowSound, state.soundCapRefusal, doors.onOpenSoundShelf)
    val hasMedia = state.selectedSlideAttachments.isNotEmpty() || state.selectedSlidePending.isNotEmpty() || state.isUploadingMedia
    SceneToolColumn(
        tools = tools,
        active = when (state.band.activeTool) {
            StoryToolMode.MEDIA -> ComposerSceneTool.MEDIA
            StoryToolMode.AUDIO -> ComposerSceneTool.SOUND
            else -> null
        },
        onTool = { tool ->
            onMorePanel(null)
            when (tool) {
                ComposerSceneTool.TEXT -> addText()
                ComposerSceneTool.MEDIA -> if (hasMedia) viewModel.onBandToolTap(StoryToolMode.MEDIA) else pickMedia()
                ComposerSceneTool.STICKER -> openStickers()
                ComposerSceneTool.SOUND ->
                    if (state.selectedSlideAudio.isNotEmpty()) viewModel.onBandToolTap(StoryToolMode.AUDIO) else openShelf()
                ComposerSceneTool.DRAWING -> viewModel.onEnterDrawingMode()
                ComposerSceneTool.MORE -> Unit
            }
        },
        more = { StoryMoreMenu(state, viewModel, sceneExport, onMorePanel) },
    )
}

@Composable
private fun StoryMoreMenu(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sceneExport: SceneExportHost,
    onMorePanel: (StoryMorePanel?) -> Unit,
) {
    val addSlide = rememberGuardedAddition(state.canAddSlide, state.addSlideRefusalRes(), action = viewModel::onAddSlide)
    val entries = ComposerSceneTools.moreEntries(
        ComposerSceneTools.MoreInput(
            editsSlides = !state.editing,
            hasBackgroundMedia = state.selectedSlideSceneBackground != null,
            animated = state.sceneIsAnimated,
            sceneEffects = state.servedSceneEffects,
            exports = sceneExport.entries,
        ),
    )
    ComposerMoreMenu(
        entries = entries,
        animated = state.sceneIsAnimated,
        exportEnabled = !sceneExport.isExporting && !state.isPublishing,
    ) { entry ->
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

/** Un objet touché ou le pinceau en main : la colonne de ses réglages, sur un voile qui la garde lisible sur toute scène. */
@Composable
private fun ColumnScope.ObjectColumn(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    Column(
        modifier = Modifier
            .fillMaxHeight()
            .background(OBJECT_COLUMN_VEIL, RoundedCornerShape(MeeshyRadius.xxl))
            .padding(vertical = MeeshySpacing.xxs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        StoryTrailingColumn(state, viewModel)
    }
}

private val OBJECT_COLUMN_VEIL = Color.Black.copy(alpha = 0.38f)

/** Le bas de la scène : ce que l'éditeur a à dire (seulement s'il a quelque chose à dire), puis l'audience et Publier. */
@Composable
private fun StorySocle(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    doors: StoryComposerDoors,
    formatChevron: (@Composable () -> Unit)?,
) {
    val notice = state.publishBlock?.let { stringResource(it.messageRes()) } ?: sceneNotice(state)
    notice?.let {
        Text(
            text = it,
            style = MaterialTheme.typography.bodySmall,
            color = Color.White,
            modifier = Modifier
                .fillMaxWidth()
                .background(OBJECT_COLUMN_VEIL, RoundedCornerShape(MeeshyRadius.sm))
                .padding(horizontal = MeeshySpacing.sm, vertical = 6.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
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
