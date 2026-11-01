package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.AdjustmentFamily
import me.meeshy.sdk.model.composer.ComposerSelectionSubject
import me.meeshy.sdk.model.composer.MediaDescriptionLaw
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundEditLevel
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundTool
import me.meeshy.sdk.model.composer.look.ComposerLookFamily
import me.meeshy.sdk.model.composer.scene.ComposerBackdropFraming
import me.meeshy.ui.component.media.MediaTrimContent
import me.meeshy.ui.component.media.MediaTrimStrip
import me.meeshy.ui.component.retouch.ComposerMediaLookPanel
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

internal const val BACKGROUND_BAND_TAG = "composer-background-band"
internal const val BACKGROUND_LOOP_TAG = "composer-background-loop"
internal const val BACKGROUND_DESCRIPTION_TAG = "composer-background-description"

private val OPTION_WIDTH = 68.dp
private val OPTION_DISC = 40.dp

internal fun ComposerBackgroundTool.glyph(): ImageVector = composerEditIcon(ComposerBackgroundEditLevel.entryOf(this).material) ?: MeeshyIcons.Edit

internal fun ComposerBackgroundTool.labelRes(): Int = when (this) {
    ComposerBackgroundTool.FRAMING -> R.string.composer_edit_background_framing
    ComposerBackgroundTool.TRIM -> R.string.composer_edit_trim
    ComposerBackgroundTool.FILTERS -> R.string.composer_column_media_filter
    ComposerBackgroundTool.FRAMES -> R.string.composer_edit_frames
    ComposerBackgroundTool.ADJUST -> R.string.composer_column_media_adjust
    ComposerBackgroundTool.EFFECTS -> R.string.stories_composer_band_effets
    ComposerBackgroundTool.SOUND -> R.string.composer_capture_tool_sound
    ComposerBackgroundTool.LOOP -> R.string.composer_edit_loop
    ComposerBackgroundTool.ROTATE -> R.string.composer_edit_rotate
    ComposerBackgroundTool.DESCRIPTION -> R.string.composer_column_media_alt_text
}

/**
 * Les outils du fond média, vus de l'hôte (#13973, à plat depuis #14047) : ses entrées ([tools], l'ordre de l'arbre
 * partagé), la boucle d'une vidéo ([looping]) et ce que fait chacune ([onTool]) — poser sa bande, basculer la boucle, ouvrir
 * la feuille de la description.
 */
internal class BackgroundTools(val tools: List<ComposerBackgroundTool>, val looping: Boolean, val onTool: (ComposerBackgroundTool) -> Unit)

/**
 * Ce que touche un outil du fond : Boucle bascule aussitôt, Pivoter tourne d'un quart, Décrire ouvre sa feuille basse, toute autre
 * pose sa bande au-dessus du niveau ([onBand]) — ce que l'arbre dit qu'elle ouvre.
 */
internal fun backgroundTools(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    onBand: (ComposerBackgroundTool) -> Unit,
    onDescribe: () -> Unit,
): BackgroundTools = BackgroundTools(
    tools = state.backgroundEditTools,
    looping = state.selectedSlideBackgroundLoop,
    onTool = { tool ->
        when (tool) {
            ComposerBackgroundTool.LOOP -> viewModel.onSceneReduce { StoryComposerBackgroundReducer.paintedBackgroundLoopSet(it, !state.selectedSlideBackgroundLoop) }
            ComposerBackgroundTool.ROTATE -> viewModel.onSceneReduce(StoryComposerBackgroundReducer::rotated)
            ComposerBackgroundTool.DESCRIPTION -> onDescribe()
            else -> onBand(tool)
        }
    },
)

/**
 * Les outils du fond, À PLAT dans son rail avant ses actions (#14047) : un disque et son mot par outil, ou une rangée
 * libellée au grand écran ([wide]) ; la Boucle en interrupteur.
 */
@Composable
internal fun BackgroundToolItems(tools: BackgroundTools, wide: Boolean) {
    tools.tools.forEach { tool ->
        when {
            wide -> LabeledRailItem(
                icon = tool.glyph(),
                label = stringResource(tool.labelRes()),
                onClick = { tools.onTool(tool) },
                active = tool == ComposerBackgroundTool.LOOP && tools.looping,
            )
            tool == ComposerBackgroundTool.LOOP -> LoopSwitch(tools.looping) { tools.onTool(tool) }
            else -> SceneOptionButton(tool.glyph(), stringResource(tool.labelRes()), Color.White) { tools.onTool(tool) }
        }
    }
}

/** La Boucle d'une vidéo de fond : un interrupteur dans le rail même, allumé tant que la vidéo reboucle. */
@Composable
private fun LoopSwitch(on: Boolean, onToggle: () -> Unit) {
    Column(
        modifier = Modifier
            .width(OPTION_WIDTH)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .toggleable(value = on, role = Role.Switch, onValueChange = { onToggle() })
            .testTag(BACKGROUND_LOOP_TAG),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val disc = if (on) MaterialTheme.colorScheme.primary else Color.Black.copy(alpha = 0.38f)
        Box(Modifier.size(OPTION_DISC).background(disc, CircleShape), contentAlignment = Alignment.Center) {
            Icon(ComposerBackgroundTool.LOOP.glyph(), contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
        }
        OptionWord(stringResource(ComposerBackgroundTool.LOOP.labelRes()))
    }
}

@Composable
private fun OptionWord(text: String) {
    Text(
        text = text,
        color = Color.White,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        textAlign = TextAlign.Center,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
    )
}

/** Le niveau d'un réglage posé en bande : son mot, en titre de la colonne, sous le Retour qui le referme. */
@Composable
internal fun SceneBackgroundBandTitle(tool: ComposerBackgroundTool) = SceneLevelTitle(tool.glyph(), stringResource(tool.labelRes()))

/** Le titre d'un niveau dont la bande est posée, fond ou objet : son disque allumé et son mot. */
@Composable
internal fun SceneLevelTitle(icon: ImageVector, label: String) {
    Column(
        modifier = Modifier.width(OPTION_WIDTH).semantics(mergeDescendants = true) { heading() },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(OPTION_DISC).background(MaterialTheme.colorScheme.primary, CircleShape), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
        }
        OptionWord(label)
    }
}

/**
 * La bande du réglage ouvert, au bas de la scène qui se réduit au-dessus d'elle (#13973) : le Cadrage (le panneau Cadre),
 * Couper (la frise de la source), Filtres (le filtre de la scène puis ceux de l'appel), Cadres, Réglages, Effets, le Son
 * d'une vidéo (son volume en %, et Muet). Chaque
 * geste écrit sa valeur à chaque image : la scène se repeint pendant le geste.
 */
@Composable
internal fun BackgroundBand(tool: ComposerBackgroundTool, state: StoryComposerUiState, viewModel: StoryComposerViewModel, comparison: LookComparison) {
    val id = state.selectedSlideBackdropMediaId ?: return
    Column(Modifier.fillMaxWidth().testTag(BACKGROUND_BAND_TAG), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        when (tool) {
            ComposerBackgroundTool.FRAMING -> BackgroundFraming(state, viewModel)
            ComposerBackgroundTool.TRIM -> BackgroundTrimStrip(state, id, viewModel)
            ComposerBackgroundTool.FILTERS -> {
                FilterRow(
                    selected = state.selectedSlideFilter,
                    intensity = state.selectedSlideFilterIntensity,
                    onSelect = viewModel::onSelectFilter,
                    onIntensityChange = viewModel::onFilterIntensityChange,
                )
                if (state.offersLook(id)) LookFamilies(state, id, viewModel, listOf(ComposerLookFamily.FILTERS))
            }
            ComposerBackgroundTool.FRAMES -> LookFamilies(state, id, viewModel, listOf(ComposerLookFamily.FRAMES))
            ComposerBackgroundTool.ADJUST -> AdjustSection(state, id, AdjustmentFamily.TONE, viewModel, comparison)
            ComposerBackgroundTool.EFFECTS -> AdjustSection(state, id, AdjustmentFamily.EFFECT, viewModel, comparison)
            ComposerBackgroundTool.SOUND -> BackgroundVolume(state, viewModel)
            ComposerBackgroundTool.LOOP, ComposerBackgroundTool.ROTATE, ComposerBackgroundTool.DESCRIPTION -> Unit
        }
    }
}

/** Son › Volume et Muet de la vidéo de fond (#14083) : le curseur écrit le volume à chaque valeur et le dit en %, Muet coupe et rend le niveau quitté. */
@Composable
private fun BackgroundVolume(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    val setting = state.paintedBackgroundSetting
    ComposerVolumeRow(setting.volume, { v -> viewModel.onSceneGesture("background-volume") { StoryComposerBackgroundReducer.volumeSet(it, v) } }) {
        FilterChip(
            selected = setting.isMuted,
            onClick = { viewModel.onSceneReduce(StoryComposerBackgroundReducer::muteToggled) },
            label = { Text(stringResource(R.string.composer_edit_mute)) },
            modifier = Modifier.heightIn(min = 48.dp),
        )
    }
}

@Composable
private fun BackgroundFraming(state: StoryComposerUiState, viewModel: StoryComposerViewModel) {
    val transform = state.deck.selectedSlide.frame.backgroundTransform()
    ComposerFramePanel(
        fitMode = ComposerBackdropFraming.fitMode(transform),
        backdrop = ComposerBackdropFraming.backdrop(transform),
        onPickFitMode = { mode -> viewModel.onSceneReduce { StoryComposerBackgroundReducer.fitModeSet(it, mode) } },
        onPickBackdrop = { fond -> viewModel.onSceneReduce { StoryComposerBackgroundReducer.backdropChosen(it, fond) } },
    )
}

@Composable
private fun LookFamilies(state: StoryComposerUiState, id: String, viewModel: StoryComposerViewModel, families: List<ComposerLookFamily>) {
    ComposerMediaLookPanel(
        look = state.mediaLookOf(id),
        onChoose = { item -> viewModel.onSceneReduce { StoryComposerLookReducer.chosen(it, id, item) } },
        families = families,
    )
}

/**
 * Couper la vidéo de fond (iOS `MediaTrimStrip` + `sourceStart`/`sourceEnd` de l'objet de fond) : la source ENTIÈRE en
 * vignettes, deux poignées pour ce qu'on garde ; chaque image du geste écrit la fenêtre, un seul cran d'historique par geste.
 */
@Composable
private fun BackgroundTrimStrip(state: StoryComposerUiState, id: String, viewModel: StoryComposerViewModel) {
    val source = state.backgroundTrimSourceOf(id) ?: return
    val bounds = state.backgroundTrimOf(id) ?: return
    val url = state.attachments.firstOrNull { it.id == id }?.url.orEmpty().let { ComposerMediaAddress.of(it, viewModel.mediaBaseUrl) }
    MediaTrimStrip(
        content = MediaTrimContent.VIDEO,
        sourceDuration = source,
        bounds = bounds,
        accent = MaterialTheme.colorScheme.primary,
        frames = rememberVideoFrames(url, source),
        onChange = { next -> viewModel.onSceneGesture("trim-background-$id") { StoryComposerBackgroundReducer.trimmed(it, next) } },
        modifier = Modifier.fillMaxWidth(),
    )
}

/**
 * Le fichier que « Décrire » décrit : celui du fond sélectionné, ou celui du média posé sélectionné (#13973, A-E4) — une
 * copie posée décrit le même fichier que sa source.
 */
internal val StoryComposerUiState.describedMediaFile: String?
    get() = if (selectionSubject == ComposerSelectionSubject.BACKGROUND) selectedSlideBackdropMediaId
    else selectedMedia?.takeIf { id -> deck.selectedSlide.placedMedia.any { it.id == id } }?.let(deck.selectedSlide::mediaFileOf)

/** Décrire le fond ou le média posé : une feuille basse, sans voile, la scène réduite au-dessus ; la description s'écrit à chaque lettre. */
@Composable
internal fun BackgroundDescriptionSheet(state: StoryComposerUiState, viewModel: StoryComposerViewModel, onDone: () -> Unit) {
    val id = state.describedMediaFile ?: return
    ComposerAnchoredSheet(fill = false) {
        Column(
            modifier = Modifier.fillMaxWidth().testTag(BACKGROUND_DESCRIPTION_TAG).padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(ComposerBackgroundTool.DESCRIPTION.labelRes()),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                IconButton(onClick = onDone) {
                    Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.composer_sheet_dismiss))
                }
            }
            MediaAltField(
                alt = state.draft.mediaAlt[id].orEmpty(),
                onChange = { viewModel.onMediaAltChange(id, it.take(MediaDescriptionLaw.MAX_LENGTH)) },
            )
        }
    }
}

/**
 * Le niveau du fond en haut de la pile, à la place des outils : le rail « Fond » à plat, ou le titre du réglage dont la
 * bande est posée. [wide] : le rail libellé du grand écran.
 */
@Composable
internal fun BackgroundLevelContent(level: StoryEditingLevel, background: BackgroundEditing, tools: BackgroundTools, wide: Boolean) {
    when (level) {
        StoryEditingLevel.Background -> if (wide) StoryBackgroundRail(background, tools) else SceneBackgroundColumn(background, tools)
        is StoryEditingLevel.BackgroundBand -> SceneBackgroundBandTitle(level.tool)
        else -> Unit
    }
}

/** Le réglage dont la bande est posée, s'il est encore offert par le fond sélectionné ; sinon aucune bande. */
internal fun EditingLevels<StoryEditingLevel>.backgroundBand(tools: BackgroundTools?): ComposerBackgroundTool? =
    (stack.top as? StoryEditingLevel.BackgroundBand)?.tool?.takeIf { tools != null && it in tools.tools }
