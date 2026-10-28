package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.composer.ComposerPlateau
import me.meeshy.ui.component.composer.ComposerRailButton
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.ComposerPlateauInk
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * The story composer ON the plateau of the one host (iOS `MeeshyComposerHost` + `ComposerSceneSurface`): the dark tint,
 * the cross and the format in the top corridor, the controllers (history, a new slide) in the trailing column, the
 * socle — audience, then Publish — under the card. Nothing is laid on the scene: the card holds the strip, the stage
 * and the tool band, and a pull down that the scene does not absorb closes like the cross (the draft autosaves).
 */
@Composable
internal fun StoryComposerPlateau(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sceneExport: SceneExportHost,
    onClose: () -> Unit,
    titleContent: (@Composable () -> Unit)?,
    onOpenAudience: () -> Unit,
    panel: @Composable () -> Unit,
) {
    ComposerPlateau(
        onDismiss = onClose,
        topCorridor = {
            CompositionLocalProvider(LocalContentColor provides ComposerPlateauInk.primary) {
                ComposerRailButton(MeeshyIcons.Close, stringResource(R.string.stories_composer_cancel), onClose)
                titleContent?.invoke()
                Spacer(Modifier.weight(1f))
                ComposerOverflowMenu(
                    entries = sceneExport.entries,
                    enabled = !sceneExport.isExporting && !state.isPublishing,
                    onPick = sceneExport::start,
                )
            }
        },
        trailingRail = {
            ComposerRailButton(MeeshyIcons.Undo, stringResource(R.string.story_composer_undo), viewModel::onUndo, enabled = state.canUndo)
            ComposerRailButton(MeeshyIcons.Redo, stringResource(R.string.story_composer_redo), viewModel::onRedo, enabled = state.canRedo)
            ComposerRailButton(
                MeeshyIcons.Add,
                stringResource(R.string.stories_composer_add_slide),
                viewModel::onAddSlide,
                enabled = state.deck.canAddSlide,
            )
        },
        socle = {
            PlateauAudienceChip(state.draft.visibility, state.draft.visibilityUserIds.size, onOpenAudience)
            MeeshyPrimaryButton(
                text = publishLabel(state.publishTitle),
                onClick = viewModel::publish,
                enabled = state.canPublish,
                modifier = Modifier.weight(1f),
            )
        },
    ) {
        StoryComposerBody(
            state = state,
            viewModel = viewModel,
            sceneExport = sceneExport,
            panel = panel,
            modifier = Modifier.padding(12.dp),
            showsAddSlide = false,
        )
    }
}

/** The socle's audience (iOS `audienceChip`) in the plateau's inks: it opens the audience sheet that explains the consequences. */
@Composable
private fun RowScope.PlateauAudienceChip(visibility: StoryVisibility, count: Int, onClick: () -> Unit) {
    val name = stringResource(R.string.composer_socle_audience)
    val label = stringResource(visibility.labelRes())
    val shown = if (visibility.requiresUserSelection && count > 0) "$label ($count)" else label
    Row(
        modifier = Modifier
            .heightIn(min = ComposerPlateauInk.HIT_TARGET_DP.dp)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(ComposerPlateauInk.primary.copy(alpha = 0.12f))
            .clickable(role = Role.Button, onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = name
                stateDescription = shown
                role = Role.Button
            }
            .padding(horizontal = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(visibility.icon(), contentDescription = null, tint = ComposerPlateauInk.primary)
        Text(shown, style = MaterialTheme.typography.labelLarge, color = ComposerPlateauInk.primary, maxLines = 1)
    }
}
