package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius

internal const val SELECTION_BAR_TAG = "composer-selection-bar"

private val BAR_HEIGHT = 56.dp
private val BAR_VEIL = MeeshyMediaChromeColors.ScrimStrong

/**
 * La barre d'actions du FOND sélectionné (#13836, état 3 de la maquette), posée sur la scène juste au-dessus de Public et
 * Publier — un objet de la scène, lui, porte ses options dans la colonne des outils ([SceneOptionColumn], #13956) : une icône et un MOT par action, chacune une cible de toute la hauteur de la barre — Modifier,
 * Dupliquer, Temps, Retirer ; aucun Ordre, toucher un objet le fait passer devant (#13917). Retirer est en couleur d'alerte, et l'historique la défait. Le rail droit du grand
 * écran (#13837) sert la même liste, depuis la même loi.
 */
@Composable
internal fun ComposerSelectionActionBar(
    bar: SceneSelectionBar,
    onAction: (ComposerSelectionAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .testTag(SELECTION_BAR_TAG)
            .fillMaxWidth()
            .height(BAR_HEIGHT)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(BAR_VEIL)
            .padding(horizontal = 6.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        bar.actions.forEach { action ->
            SelectionActionItem(action, onClick = { onAction(action) }, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun SelectionActionItem(action: ComposerSelectionAction, onClick: () -> Unit, modifier: Modifier) {
    val tint = if (action.isDestructive) MeeshyPalette.ErrorSoft else Color.White
    Column(
        modifier = modifier
            .height(BAR_HEIGHT)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .clickable(role = Role.Button, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(action.glyph(), contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        Text(
            text = stringResource(action.labelRes()),
            color = tint,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

internal fun ComposerSelectionAction.glyph(): ImageVector = when (this) {
    ComposerSelectionAction.EDIT -> MeeshyIcons.Edit
    ComposerSelectionAction.DUPLICATE -> MeeshyIcons.Copy
    ComposerSelectionAction.TIME -> MeeshyIcons.ScheduleFilled
    ComposerSelectionAction.REMOVE -> MeeshyIcons.Delete
}

internal fun ComposerSelectionAction.labelRes(): Int = when (this) {
    ComposerSelectionAction.EDIT -> R.string.story_canvas_action_edit
    ComposerSelectionAction.DUPLICATE -> R.string.story_canvas_action_duplicate
    ComposerSelectionAction.TIME -> R.string.composer_scene_more_timing
    ComposerSelectionAction.REMOVE -> R.string.composer_selection_remove
}
