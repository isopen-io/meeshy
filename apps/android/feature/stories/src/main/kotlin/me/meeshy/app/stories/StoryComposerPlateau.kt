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
import me.meeshy.sdk.model.composer.ComposerLeadingSceneToggles
import me.meeshy.sdk.model.composer.ComposerRailDoor
import me.meeshy.sdk.model.composer.ComposerSceneToggle
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.composer.ComposerPlateau
import me.meeshy.ui.component.composer.ComposerRailBadge
import me.meeshy.ui.component.composer.ComposerRailButton
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.ComposerPlateauInk
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * The story composer ON the plateau of the one host (iOS `MeeshyComposerHost` + `ComposerSceneSurface`): the dark tint,
 * the cross, the format, a new slide and the export menu in the top corridor (iOS `sceneAddSlideButton` is a top-bar
 * accessory); the doors — each with the counter of what it already carries — in the leading column; in the trailing
 * column the selected object's controllers from the top, closed by its (x), and the foot (timeline, undo, redo) at the
 * thumb; the socle — audience, then Publish — under the card. Nothing is laid on the scene: the card holds the strip, the stage
 * and the open tool's panel, and a pull down that the scene does not absorb closes like the cross (the draft autosaves).
 */
@Composable
internal fun StoryComposerPlateau(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    sceneExport: SceneExportHost,
    onClose: () -> Unit,
    titleContent: (@Composable () -> Unit)?,
    onOpenAudience: () -> Unit,
    onOpenStickers: () -> Unit,
    panel: @Composable () -> Unit,
) {
    ComposerPlateau(
        onDismiss = onClose,
        topCorridor = {
            CompositionLocalProvider(LocalContentColor provides ComposerPlateauInk.primary) {
                ComposerRailButton(MeeshyIcons.Close, stringResource(R.string.stories_composer_cancel), onClose)
                titleContent?.invoke()
                Spacer(Modifier.weight(1f))
                ComposerRailButton(
                    MeeshyIcons.Add,
                    stringResource(R.string.stories_composer_add_slide),
                    rememberGuardedAddition(state.deck.canAddSlide, action = viewModel::onAddSlide),
                )
                ComposerOverflowMenu(
                    entries = sceneExport.entries,
                    enabled = !sceneExport.isExporting && !state.isPublishing,
                    onPick = sceneExport::start,
                )
            }
        },
        leadingRail = {
            val matter = state.plateauDoorMatter
            val openStickers = rememberGuardedAddition(state.deck.selectedCanAddSticker, R.string.composer_scene_cap_sticker, onOpenStickers)
            StoryPlateauDoors.leading.forEach { door ->
                val tool = StoryPlateauDoors.toolFor(door)
                val count = StoryPlateauDoors.badge(door, matter)
                ComposerRailButton(
                    icon = door.glyph(),
                    label = stringResource(door.labelRes()),
                    onClick = { tool?.let(viewModel::onBandToolTap) ?: openStickers() },
                    enabled = !state.isDrawingActive,
                    active = tool != null && state.band.activeTool == tool,
                    badge = ComposerRailBadge(count, stringResource(R.string.story_composer_fab_badge, count))
                        .takeIf { count > 0 },
                )
            }
            // Après les portes : l'éclair (mode Animé), puis le Cadre — des réglages de la scène, pas des portes.
            ComposerLeadingSceneToggles.served(animated = true, frame = state.selectedSlideSceneBackground != null).forEach { toggle ->
                when (toggle) {
                    ComposerSceneToggle.ANIMATED -> ComposerRailButton(
                        icon = MeeshyIcons.Bolt,
                        label = stringResource(R.string.stories_scene_animated),
                        onClick = { viewModel.onSceneReduce(StoryComposerSceneReducer::animationToggled) },
                        enabled = !state.isDrawingActive,
                        active = state.sceneIsAnimated,
                    )
                    ComposerSceneToggle.FRAME -> ComposerRailButton(
                        icon = MeeshyIcons.Crop,
                        label = stringResource(R.string.stories_scene_frame_title),
                        onClick = { viewModel.onSceneReduce(StoryComposerSelectionReducer::frameToggled) },
                        enabled = !state.isDrawingActive,
                        active = state.frameOpen,
                    )
                }
            }
        },
        trailingRail = { StoryTrailingColumn(state, viewModel) },
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
            showsToolBand = false,
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

private fun ComposerRailDoor.glyph() = when (this) {
    ComposerRailDoor.MEDIA -> MeeshyIcons.PhotoFilled
    ComposerRailDoor.SOUND -> MeeshyIcons.MusicNote
    ComposerRailDoor.TEXT -> MeeshyIcons.TextFields
    ComposerRailDoor.BACKGROUND -> MeeshyIcons.Palette
    ComposerRailDoor.DRAWING -> MeeshyIcons.Scribble
    else -> MeeshyIcons.EmojiFilled
}

private fun ComposerRailDoor.labelRes() = when (this) {
    ComposerRailDoor.MEDIA -> R.string.story_tool_media
    ComposerRailDoor.SOUND -> R.string.story_tool_audio
    ComposerRailDoor.TEXT -> R.string.story_tool_text
    ComposerRailDoor.BACKGROUND -> R.string.story_tool_texture
    ComposerRailDoor.DRAWING -> R.string.story_tool_drawing
    else -> R.string.stories_composer_add_sticker
}
