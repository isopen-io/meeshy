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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
    ComposerBackgroundTool.LOOP -> R.string.composer_edit_loop
    ComposerBackgroundTool.DESCRIPTION -> R.string.composer_column_media_alt_text
}

/**
 * Le niveau « Modifier » du fond média, vu de l'hôte (#13973, lot A-E2) : ses entrées ([tools], l'ordre de l'arbre
 * partagé), la boucle d'une vidéo ([looping]) et ce que fait chacune ([onTool]) — poser sa bande, basculer la boucle, ouvrir
 * la feuille de la description.
 */
internal class BackgroundTools(val tools: List<ComposerBackgroundTool>, val looping: Boolean, val onTool: (ComposerBackgroundTool) -> Unit)

/**
 * Ce que touche une entrée du niveau « Modifier » : Boucle bascule aussitôt, Décrire ouvre sa feuille basse, toute autre
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
            ComposerBackgroundTool.DESCRIPTION -> onDescribe()
            else -> onBand(tool)
        }
    },
)

/** Le niveau « Modifier » dans la colonne de la scène : un disque et son mot par entrée, la Boucle en interrupteur. */
@Composable
internal fun SceneBackgroundEditColumn(tools: BackgroundTools) {
    Column(
        modifier = Modifier.testTag(EDITING_RAIL_TAG).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        tools.tools.forEach { tool ->
            if (tool == ComposerBackgroundTool.LOOP) {
                LoopSwitch(tools.looping) { tools.onTool(tool) }
            } else {
                SceneOptionButton(tool.glyph(), stringResource(tool.labelRes()), Color.White) { tools.onTool(tool) }
            }
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

/** Grand écran : le niveau « Modifier » dans le rail gauche, chaque entrée une rangée libellée, la Boucle allumée tant qu'elle reboucle. */
@Composable
internal fun StoryBackgroundEditRail(tools: BackgroundTools) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag(EDITING_RAIL_TAG).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        tools.tools.forEach { tool ->
            LabeledRailItem(
                icon = tool.glyph(),
                label = stringResource(tool.labelRes()),
                onClick = { tools.onTool(tool) },
                active = tool == ComposerBackgroundTool.LOOP && tools.looping,
            )
        }
    }
}

/** Le niveau d'un réglage posé en bande : son mot, en titre de la colonne, sous le Retour qui le referme. */
@Composable
internal fun SceneBackgroundBandTitle(tool: ComposerBackgroundTool) {
    Column(
        modifier = Modifier.width(OPTION_WIDTH).semantics(mergeDescendants = true) { heading() },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(OPTION_DISC).background(MaterialTheme.colorScheme.primary, CircleShape), contentAlignment = Alignment.Center) {
            Icon(tool.glyph(), contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
        }
        OptionWord(stringResource(tool.labelRes()))
    }
}

/**
 * La bande du réglage ouvert, au bas de la scène qui se réduit au-dessus d'elle (#13973) : le Cadrage (le panneau Cadre),
 * Couper (la frise de la source), Filtres (le filtre de la scène puis ceux de l'appel), Cadres, Réglages, Effets. Chaque
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
            ComposerBackgroundTool.LOOP, ComposerBackgroundTool.DESCRIPTION -> Unit
        }
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

/** Décrire le fond : une feuille basse, sans voile, la scène réduite au-dessus ; la description s'écrit à chaque lettre. */
@Composable
internal fun BackgroundDescriptionSheet(state: StoryComposerUiState, viewModel: StoryComposerViewModel, onDone: () -> Unit) {
    val id = state.selectedSlideBackdropMediaId ?: return
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
 * Le niveau du fond en haut de la pile, à la place des outils : « Fond », « Modifier » ou le titre du réglage dont la bande
 * est posée. [wide] : le rail libellé du grand écran.
 */
@Composable
internal fun BackgroundLevelContent(level: StoryEditingLevel, background: BackgroundEditing, tools: BackgroundTools, wide: Boolean) {
    when (level) {
        StoryEditingLevel.Background -> if (wide) StoryBackgroundRail(background) else SceneBackgroundColumn(background)
        StoryEditingLevel.BackgroundEdit -> if (wide) StoryBackgroundEditRail(tools) else SceneBackgroundEditColumn(tools)
        is StoryEditingLevel.BackgroundBand -> SceneBackgroundBandTitle(level.tool)
        StoryEditingLevel.ObjectOptions -> Unit
    }
}

/** Le réglage dont la bande est posée, s'il est encore offert par le fond sélectionné ; sinon aucune bande. */
internal fun EditingLevels<StoryEditingLevel>.backgroundBand(tools: BackgroundTools?): ComposerBackgroundTool? =
    (stack.top as? StoryEditingLevel.BackgroundBand)?.tool?.takeIf { tools != null && it in tools.tools }
