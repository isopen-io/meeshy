package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerLabeledRail
import me.meeshy.sdk.model.composer.ComposerMoreEntry
import me.meeshy.sdk.model.composer.ComposerSceneTool
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.composer.SceneObjectMenu
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.ComposerPlateauInk
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val RAIL_ROW = ComposerLabeledRail.ROW.dp
private val RAIL_GAP = ComposerLabeledRail.GAP.dp

/**
 * Ce que le rail gauche du grand écran montre (#13837), en valeurs primitives : [showsClose] et [showsTools] se taisent
 * le pinceau en main ; [activeTool] et [openEntry] (Fond, Durée, Temps) surlignent l'outil ouvert ; [moreEntries] sont celles du « ⋯ »
 * de la scène, que le rail range d'après sa hauteur.
 */
internal data class LeadingRailModel(
    val showsClose: Boolean,
    val showsTools: Boolean,
    val activeTool: ComposerSceneTool?,
    val openEntry: ComposerMoreEntry?,
    val moreEntries: List<ComposerMoreEntry>,
    val animated: Boolean,
    val exportEnabled: Boolean,
)

/**
 * Le rail de ce qu'on AJOUTE (#13837, maquette du 2026-10-30) : Fermer, Texte, Média, Sticker, Son, Dessin, Fond, puis
 * les entrées du « ⋯ » qui tiennent dans [railHeight] ([ComposerLabeledRail]) et « Plus » pour le reste. Une icône et un
 * mot par rangée, une cible de 48 dp ; trop court, le rail défile au lieu d'écraser ses cibles.
 */
@Composable
internal fun StoryLeadingRail(
    rail: LeadingRailModel,
    railHeight: Dp,
    onClose: () -> Unit,
    onTool: (ComposerSceneTool) -> Unit,
    onEntry: (ComposerMoreEntry) -> Unit,
) {
    val split = remember(rail.moreEntries, railHeight) { ComposerLabeledRail.leading(rail.moreEntries, railHeight.value) }
    Column(
        modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(RAIL_GAP),
    ) {
        if (rail.showsClose) LabeledRailItem(MeeshyIcons.Close, stringResource(R.string.composer_scene_close), onClose)
        if (rail.showsTools) LeadingRailTools(rail, split, onTool, onEntry)
    }
}

@Composable
private fun LeadingRailTools(
    rail: LeadingRailModel,
    split: ComposerLabeledRail.Leading,
    onTool: (ComposerSceneTool) -> Unit,
    onEntry: (ComposerMoreEntry) -> Unit,
) {
    ComposerLabeledRail.tools.forEach { tool ->
        LabeledRailItem(tool.glyph(), stringResource(tool.labelRes()), { onTool(tool) }, active = tool == rail.activeTool)
    }
    if (ComposerMoreEntry.BACKGROUND in rail.moreEntries) {
        LabeledRailItem(
            ComposerMoreEntry.BACKGROUND.glyph(),
            stringResource(ComposerMoreEntry.BACKGROUND.labelRes()),
            { onEntry(ComposerMoreEntry.BACKGROUND) },
            active = rail.openEntry == ComposerMoreEntry.BACKGROUND,
        )
    }
    split.inline.forEach { entry -> MoreEntryItem(entry, rail, onEntry) }
    if (split.overflow.isNotEmpty()) {
        ComposerMoreMenu(
            entries = split.overflow,
            animated = rail.animated,
            exportEnabled = rail.exportEnabled,
            anchor = { expanded, open ->
                LabeledRailItem(MeeshyIcons.MoreHorizontal, stringResource(R.string.composer_rail_more), open, active = expanded)
            },
            onPick = onEntry,
        )
    }
}

@Composable
private fun MoreEntryItem(entry: ComposerMoreEntry, rail: LeadingRailModel, onEntry: (ComposerMoreEntry) -> Unit) {
    LabeledRailItem(
        icon = entry.glyph(),
        label = stringResource(entry.labelRes()),
        onClick = { onEntry(entry) },
        active = entry == rail.openEntry || (entry == ComposerMoreEntry.ANIMATION && rail.animated),
        enabled = entry.export == null || rail.exportEnabled,
    )
}

/**
 * Le rail de la SÉLECTION (#13837) : son titre et les actions libellées de l'élément touché — la même liste que la barre
 * du petit écran (#13836), Retirer en couleur d'alerte — puis ↶ ↷ au pied. Sans sélection, le rail est vide ; l'historique
 * reste, seulement s'il existe (loi 4).
 */
@Composable
internal fun ColumnScope.StoryTrailingRail(
    bar: SceneSelectionBar?,
    history: SceneHistory?,
    onAction: (ComposerSelectionAction) -> Unit,
    onOrder: (SceneObjectMenu.Action) -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
) {
    Column(
        modifier = Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(RAIL_GAP),
    ) {
        bar?.let {
            Text(
                text = stringResource(R.string.composer_rail_selection),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = Color.White.copy(alpha = 0.6f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = MeeshySpacing.xs, vertical = MeeshySpacing.xs).semantics { heading() },
            )
            it.actions.forEach { action ->
                if (action == ComposerSelectionAction.ORDER) {
                    RailOrderItem(it.orderChoices, onOrder)
                } else {
                    RailActionItem(action) { onAction(action) }
                }
            }
        }
    }
    history?.let {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            SceneRoundButton(MeeshyIcons.Undo, stringResource(R.string.story_composer_undo), onUndo, enabled = it.canUndo)
            SceneRoundButton(MeeshyIcons.Redo, stringResource(R.string.story_composer_redo), onRedo, enabled = it.canRedo)
        }
    }
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

@Composable
private fun RailOrderItem(choices: List<SceneObjectMenu.Action>, onOrder: (SceneObjectMenu.Action) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        RailActionItem(ComposerSelectionAction.ORDER) { open = true }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            choices.forEach { choice ->
                DropdownMenuItem(
                    text = { Text(stringResource(choice.labelRes())) },
                    leadingIcon = { Icon(choice.icon(), contentDescription = null) },
                    onClick = {
                        open = false
                        onOrder(choice)
                    },
                )
            }
        }
    }
}

/**
 * Une rangée de rail : une icône et son mot, une cible de 48 dp ; l'outil ouvert est surligné et annoncé comme tel. Les
 * autres ne portent aucun état : une action (Modifier, Retirer, Fermer) n'est jamais lue « non sélectionnée ».
 */
@Composable
internal fun LabeledRailItem(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    active: Boolean = false,
    enabled: Boolean = true,
    tint: Color = Color.White,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(RAIL_ROW)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(if (active) ComposerPlateauInk.accent.copy(alpha = 0.55f) else Color.Transparent)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .then(if (active) Modifier.semantics { selected = true } else Modifier)
            .padding(horizontal = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        val shade = if (enabled) tint else tint.copy(alpha = 0.4f)
        Icon(icon, contentDescription = null, tint = shade, modifier = Modifier.size(20.dp))
        Text(
            text = label,
            color = shade,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
