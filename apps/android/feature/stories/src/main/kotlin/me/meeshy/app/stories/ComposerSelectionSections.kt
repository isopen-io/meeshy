package me.meeshy.app.stories

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.AdjustmentFamily
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.MediaDescriptionLaw
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.composer.scene.ComposerBackdropFraming
import me.meeshy.sdk.model.composer.sound.SoundTrimLaw
import me.meeshy.ui.component.media.MediaTrimContent
import me.meeshy.ui.component.retouch.ComposerMediaLookPanel
import me.meeshy.ui.component.media.MediaTrimStrip
import me.meeshy.ui.component.composer.rememberHostedTextField

private val SECTION_PLAN_MAX_HEIGHT = 220.dp

/**
 * Les options du MÉDIA touché, sous la scène : la section ouverte dans la colonne droite — le filtre de la scène (média de fond), la
 * description du média ou le plan. Une section chasse l'autre en fondu, sans saut de hauteur (iOS : le contenu change
 * sous la colonne).
 */
@Composable
internal fun MediaSectionContent(state: StoryComposerUiState, mediaId: String, viewModel: StoryComposerViewModel, comparison: LookComparison) {
    AnimatedContent(
        targetState = state.openMediaSection,
        transitionSpec = { fadeIn() togetherWith fadeOut() using SizeTransform(clip = false) },
        label = "media-section",
    ) { open ->
        when (open) {
            ComposerObjectEditorSection.Media(MediaEditTool.LOOK) -> ComposerMediaLookPanel(
                look = state.mediaLookOf(mediaId),
                onChoose = { item -> viewModel.onSceneReduce { StoryComposerLookReducer.chosen(it, mediaId, item) } },
            )
            ComposerObjectEditorSection.Media(MediaEditTool.ALT_TEXT) -> MediaAltField(
                alt = state.draft.mediaAlt[state.deck.selectedSlide.mediaFileOf(mediaId)].orEmpty(),
                onChange = { viewModel.onMediaAltChange(state.deck.selectedSlide.mediaFileOf(mediaId), it.take(MediaDescriptionLaw.MAX_LENGTH)) },
            )
            ComposerObjectEditorSection.Plan -> PlanSection(state, viewModel)
            ComposerObjectEditorSection.Media(MediaEditTool.TRIM) -> PlacedTrimSection(state, mediaId, viewModel)
            ComposerObjectEditorSection.Media(MediaEditTool.CROP) -> PlacedCropSection(state, mediaId, viewModel)
            ComposerObjectEditorSection.Media(MediaEditTool.ADJUST) -> AdjustSection(state, mediaId, AdjustmentFamily.TONE, viewModel, comparison)
            ComposerObjectEditorSection.Media(MediaEditTool.EFFECTS) -> AdjustSection(state, mediaId, AdjustmentFamily.EFFECT, viewModel, comparison)
            else -> if (state.deck.selectedSlide.placedMedia.any { it.id == mediaId }) {
                FilterRow(
                    selected = state.placedFilterOf(mediaId),
                    intensity = 1f,
                    onSelect = { viewModel.onSelectPlacedMediaFilter(mediaId, it) },
                    onIntensityChange = null,
                )
            } else {
                FilterRow(
                    selected = state.selectedSlideFilter,
                    intensity = state.selectedSlideFilterIntensity,
                    onSelect = viewModel::onSelectFilter,
                    onIntensityChange = viewModel::onFilterIntensityChange,
                )
            }
        }
    }
}

/**
 * Les curseurs d'un sous-outil du média touché, posé ou de fond : chaque image du geste écrit sa valeur, un seul cran
 * d'historique par curseur et par geste. « Comparer » ne s'écrit nulle part : il montre l'original sur la scène le temps du geste.
 */
@Composable
private fun AdjustSection(state: StoryComposerUiState, mediaId: String, family: AdjustmentFamily, viewModel: StoryComposerViewModel, comparison: LookComparison) {
    ComposerImageAdjustmentsPanel(
        adjustments = state.adjustmentsOf(mediaId) ?: ImageAdjustments.NEUTRAL,
        isVideo = state.placedMediaIsVideo(mediaId),
        family = family,
        accent = MaterialTheme.colorScheme.primary,
        carriesLook = state.carriesLook(mediaId),
        onAdjust = { kind, value -> viewModel.onSceneGesture("adjust-$mediaId-${kind.wireName}") { StoryComposerAdjustReducer.adjusted(it, mediaId, kind, value) } },
        onReset = { viewModel.onSceneReduce { StoryComposerAdjustReducer.reset(it, mediaId, family) } },
        onCompare = { holding -> if (holding) comparison.hold(mediaId) else comparison.release(mediaId) },
    )
}

/**
 * La fenêtre de source de la vidéo posée (iOS `MediaTrimStrip` + `setSourceTrim`) : la source ENTIÈRE en vignettes, deux
 * poignées pour ce qu'on garde, l'écarté assombri. Chaque image du geste écrit les bornes (un seul cran d'historique par geste).
 */
@Composable
private fun PlacedTrimSection(state: StoryComposerUiState, mediaId: String, viewModel: StoryComposerViewModel) {
    val source = state.placedTrimSourceOf(mediaId) ?: return
    val bounds = state.placedTrimOf(mediaId) ?: return
    val file = state.deck.selectedSlide.mediaFileOf(mediaId)
    val url = state.attachments.firstOrNull { it.id == file }?.url.orEmpty().let { ComposerMediaAddress.of(it, viewModel.mediaBaseUrl) }
    MediaTrimStrip(
        content = MediaTrimContent.VIDEO,
        sourceDuration = source,
        bounds = bounds,
        accent = MaterialTheme.colorScheme.primary,
        frames = rememberVideoFrames(url, source),
        onChange = { next -> viewModel.onSceneGesture("trim-$mediaId") { StoryComposerPlacedMediaReducer.trimmed(it, mediaId, next) } },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun MediaAltField(alt: String, onChange: (String) -> Unit) {
    val hint = stringResource(R.string.story_media_alt_a11yHint)
    val field = rememberHostedTextField(alt, onChange)
    OutlinedTextField(
        value = field.value,
        onValueChange = field.onValueChange,
        label = { Text(stringResource(R.string.story_media_alt_label)) },
        placeholder = { Text(stringResource(R.string.story_media_alt_placeholder)) },
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = hint },
    )
}

/** Les options de la PISTE touchée : son départ et sa durée (comme un texte), ou le plan. */
@Composable
internal fun SoundSectionContent(state: StoryComposerUiState, sound: StoryAudioPlayerObject, viewModel: StoryComposerViewModel) {
    AnimatedContent(
        targetState = state.openSoundSection,
        transitionSpec = { fadeIn() togetherWith fadeOut() using SizeTransform(clip = false) },
        label = "sound-section",
    ) { open ->
        if (open == ComposerObjectEditorSection.Plan) {
            PlanSection(state, viewModel)
        } else if (open == ComposerObjectEditorSection.Media(MediaEditTool.TRIM)) {
            SoundTrimSection(state, sound, viewModel)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                TimingCycleButtons(
                    timing = sound.timing(),
                    onCycleStart = { viewModel.onSceneReduce { StoryComposerSelectionReducer.soundStartCycled(it, sound.id) } },
                    onCycleDuration = { viewModel.onSceneReduce { StoryComposerSelectionReducer.soundDurationCycled(it, sound.id) } },
                )
            }
        }
    }
}

/**
 * La fenêtre propre du son dans sa source (iOS `MediaTrimStrip`) : la source ENTIÈRE avec son onde, deux poignées pour ce
 * qu'on garde, l'écarté assombri. Chaque image du geste écrit les bornes (un seul cran d'historique par geste).
 */
@Composable
internal fun SoundTrimSection(state: StoryComposerUiState, sound: StoryAudioPlayerObject, viewModel: StoryComposerViewModel) {
    val source = state.trimSourceOf(sound) ?: return
    MediaTrimStrip(
        content = MediaTrimContent.AUDIO,
        sourceDuration = source,
        bounds = SoundTrimLaw.window(sound, source),
        accent = MaterialTheme.colorScheme.primary,
        waveform = sound.waveformSamples,
        onChange = { bounds -> viewModel.onSceneGesture("trim-${sound.id}") { StoryComposerSelectionReducer.soundTrimmed(it, sound.id, bounds) } },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun PlanSection(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    Column(Modifier.heightIn(max = SECTION_PLAN_MAX_HEIGHT).verticalScroll(rememberScrollState())) {
        StoryPlanFrise(state, viewModel)
    }
}

/**
 * Le pied du plateau d'une scène sans objet touché : le Cadre quand son bouton du rail gauche est allumé, puis le
 * carrousel de l'effet ouvert dans la colonne droite (iOS `ComposerSceneEffectCarousel`). Chacun entre et sort en glissant.
 */
@Composable
internal fun SceneEffectsDock(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    val frame = state.deck.selectedSlide.frame
    val transform = frame.backgroundTransform()
    AnimatedVisibility(
        visible = state.frameOpen,
        enter = fadeIn() + expandVertically(),
        exit = fadeOut() + shrinkVertically(),
    ) {
        ComposerFramePanel(
            fitMode = ComposerBackdropFraming.fitMode(transform),
            backdrop = ComposerBackdropFraming.backdrop(transform),
            onPickFitMode = { mode -> viewModel.onSceneReduce { StoryComposerBackgroundReducer.fitModeSet(it, mode) } },
            onPickBackdrop = { fond -> viewModel.onSceneReduce { StoryComposerBackgroundReducer.backdropChosen(it, fond) } },
        )
    }
    ComposerSceneEffectCarousel(
        open = state.sceneEffectCarousel,
        frame = frame,
        onClose = { viewModel.onSceneReduce(StoryComposerSelectionReducer::sceneEffectClosed) },
        onChoose = { choice -> viewModel.onSceneReduce { StoryComposerBackgroundReducer.effectChosen(it, choice) } },
        visual = {
            FilterRow(
                selected = state.selectedSlideFilter,
                intensity = state.selectedSlideFilterIntensity,
                onSelect = viewModel::onSelectFilter,
                onIntensityChange = viewModel::onFilterIntensityChange,
            )
        },
    )
}
