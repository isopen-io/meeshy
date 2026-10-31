package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerLabeledRail
import me.meeshy.sdk.model.composer.ComposerMediaSource
import me.meeshy.sdk.model.composer.ComposerMoreEntry
import me.meeshy.sdk.model.composer.ComposerSceneTool
import me.meeshy.sdk.model.composer.ComposerSceneTools
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.ComposerPlateauInk
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val RAIL_ROW = ComposerLabeledRail.ROW.dp
private val RAIL_GAP = ComposerLabeledRail.GAP.dp

/**
 * Ce que le rail gauche du grand écran montre (#13837), en valeurs primitives : [showsClose] et [showsTools] se taisent
 * le pinceau en main ; [activeTool] et [openEntry] surlignent l'outil ouvert, ou « Plus » quand il range l'entrée ouverte ; [moreEntries] sont celles du « ⋯ »
 * de la scène, que le rail range derrière « Plus », Fond excepté.
 */
internal data class LeadingRailModel(
    val showsClose: Boolean,
    val showsTools: Boolean,
    val activeTool: ComposerSceneTool?,
    val openEntry: ComposerMoreEntry?,
    val moreEntries: List<ComposerMoreEntry>,
    val animated: Boolean,
    val exportEnabled: Boolean,
    val cameraServed: Boolean = false,
)

/**
 * Le rail de ce qu'on AJOUTE (#13837, maquette du 2026-10-30) : Fermer, Texte, Média, Sticker, Son, Dessin, Fond, et
 * « Plus » pour le reste du « ⋯ » ([ComposerLabeledRail]). Une icône et un mot par rangée, une cible de 48 dp ; trop
 * court, le rail défile au lieu d'écraser ses cibles.
 */
@Composable
internal fun StoryLeadingRail(
    rail: LeadingRailModel,
    onClose: () -> Unit,
    onTool: (ComposerSceneTool) -> Unit,
    onEntry: (ComposerMoreEntry) -> Unit,
    onMediaSource: (ComposerMediaSource) -> Unit = {},
) {
    val overflow = remember(rail.moreEntries) { ComposerLabeledRail.overflow(rail.moreEntries) }
    Column(
        modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(RAIL_GAP),
    ) {
        if (rail.showsClose) LabeledRailItem(MeeshyIcons.Close, stringResource(R.string.composer_scene_close), onClose)
        if (rail.showsTools) LeadingRailTools(rail, overflow, onTool, onEntry, onMediaSource)
    }
}

@Composable
private fun LeadingRailTools(
    rail: LeadingRailModel,
    overflow: List<ComposerMoreEntry>,
    onTool: (ComposerSceneTool) -> Unit,
    onEntry: (ComposerMoreEntry) -> Unit,
    onMediaSource: (ComposerMediaSource) -> Unit,
) {
    ComposerLabeledRail.tools.forEach { tool ->
        MediaSourcesAnchor(ComposerSceneTools.longPressSources(tool, rail.cameraServed), onMediaSource) { press ->
            LabeledRailItem(tool.glyph(), stringResource(tool.labelRes()), { onTool(tool) }, active = tool == rail.activeTool, press = press)
        }
    }
    if (ComposerMoreEntry.BACKGROUND in rail.moreEntries) {
        LabeledRailItem(
            ComposerMoreEntry.BACKGROUND.glyph(),
            stringResource(ComposerMoreEntry.BACKGROUND.labelRes()),
            { onEntry(ComposerMoreEntry.BACKGROUND) },
            active = rail.openEntry == ComposerMoreEntry.BACKGROUND,
        )
    }
    if (overflow.isNotEmpty()) {
        ComposerMoreMenu(
            entries = overflow,
            animated = rail.animated,
            exportEnabled = rail.exportEnabled,
            anchor = { expanded, open ->
                LabeledRailItem(MeeshyIcons.MoreHorizontal, stringResource(R.string.composer_rail_more), open, active = expanded || rail.openEntry in overflow)
            },
            onPick = onEntry,
        )
    }
}

/**
 * Le rail droit (#13837) : ↶ ↷ au pied, seulement s'ils existent (loi 4) ; un objet de la scène comme le fond média
 * portent leurs options dans le rail gauche, à la place des outils (#13956, #13973).
 */
@Composable
internal fun ColumnScope.StoryTrailingRail(
    history: SceneHistory?,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
) {
    Spacer(Modifier.weight(1f))
    history?.let {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            SceneRoundButton(MeeshyIcons.Undo, stringResource(R.string.story_composer_undo), onUndo, enabled = it.canUndo)
            SceneRoundButton(MeeshyIcons.Redo, stringResource(R.string.story_composer_redo), onRedo, enabled = it.canRedo)
        }
    }
}

/**
 * Grand écran, un objet en édition (#13956) : le rail de ce qu'on ajoute cède sa place, au même endroit, au titre de la
 * sélection et aux options de l'objet — Fermer et les outils reviennent à la désélection.
 */
@Composable
internal fun StoryEditingRail(bar: SceneSelectionBar, tools: List<RailTool>, onAction: (ComposerSelectionAction) -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag(EDITING_RAIL_TAG).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(RAIL_GAP),
    ) { SelectionRailBlock(bar, tools, onAction) }
}

@Composable
private fun SelectionRailBlock(bar: SceneSelectionBar, tools: List<RailTool>, onAction: (ComposerSelectionAction) -> Unit) {
    Text(
        text = stringResource(R.string.composer_rail_selection),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = Color.White.copy(alpha = 0.6f),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(horizontal = MeeshySpacing.xs, vertical = MeeshySpacing.xs).semantics { heading() },
    )
    tools.forEach { tool -> LabeledRailItem(icon = tool.icon, label = stringResource(tool.label), onClick = tool.onClick) }
    bar.actions.forEach { action -> RailActionItem(action) { onAction(action) } }
}

@Composable
private fun RailActionItem(action: ComposerSelectionAction, onClick: () -> Unit) {
    LabeledRailItem(
        icon = action.glyph(),
        label = stringResource(action.labelRes()),
        onClick = onClick,
        tint = if (action.isDestructive) MeeshyPalette.ErrorSoft else Color.White,
    )
}

/**
 * Une rangée de rail : une icône et son mot, une cible de 48 dp ; l'outil ouvert est surligné et annoncé comme tel. Les
 * autres ne portent aucun état : une action (Modifier, Retirer, Fermer) n'est jamais lue « non sélectionnée ». [press] : son
 * appui long (Média, #13845).
 */
@Composable
internal fun LabeledRailItem(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    active: Boolean = false,
    tint: Color = Color.White,
    press: ToolLongPress? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(RAIL_ROW)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(if (active) ComposerPlateauInk.accent.copy(alpha = 0.55f) else Color.Transparent)
            .toolPress(onClick, press = press)
            .then(if (active) Modifier.semantics { selected = true } else Modifier)
            .padding(horizontal = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        Text(
            text = label,
            color = tint,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
