package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerMoreEntry
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Le « ⋯ » posé sur la scène (#13834) : ce que la colonne d'outils ne porte pas — une diapo de plus, le fond, la durée,
 * l'animation et son temps, le cadre et les effets d'un fond média, la légende — puis l'export (miroir de
 * `ComposerOverflowCopy` iOS, #4996). Les entrées sont celles de [me.meeshy.sdk.model.composer.ComposerSceneTools.moreEntries] ;
 * l'animation dit si elle est allumée, et l'export se tait pendant un export ou une publication. [anchor] est ce qu'on
 * touche pour l'ouvrir : le bouton rond de la scène, ou « Plus » au pied du rail du grand écran (#13837).
 */
@Composable
internal fun ComposerMoreMenu(
    entries: List<ComposerMoreEntry>,
    animated: Boolean,
    exportEnabled: Boolean,
    anchor: @Composable (expanded: Boolean, open: () -> Unit) -> Unit = { expanded, open ->
        SceneRoundButton(MeeshyIcons.MoreHorizontal, stringResource(R.string.stories_scene_overflow_menu), open, active = expanded)
    },
    onPick: (ComposerMoreEntry) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        anchor(expanded) { expanded = true }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            entries.forEach { entry ->
                val checked = entry == ComposerMoreEntry.ANIMATION && animated
                DropdownMenuItem(
                    text = { Text(stringResource(entry.labelRes())) },
                    leadingIcon = { Icon(entry.glyph(), contentDescription = null) },
                    trailingIcon = if (checked) ({ Icon(MeeshyIcons.Check, contentDescription = null) }) else null,
                    enabled = entry.export == null || exportEnabled,
                    modifier = Modifier.semantics { if (entry == ComposerMoreEntry.ANIMATION) selected = checked },
                    onClick = {
                        expanded = false
                        onPick(entry)
                    },
                )
            }
        }
    }
}

internal fun ComposerMoreEntry.glyph(): ImageVector = when (this) {
    ComposerMoreEntry.ADD_SLIDE -> MeeshyIcons.Add
    ComposerMoreEntry.BACKGROUND -> MeeshyIcons.Palette
    ComposerMoreEntry.SLIDE_DURATION -> MeeshyIcons.Timer
    ComposerMoreEntry.ANIMATION -> MeeshyIcons.Bolt
    ComposerMoreEntry.TIMING -> MeeshyIcons.ScheduleFilled
    ComposerMoreEntry.FRAME -> MeeshyIcons.Crop
    ComposerMoreEntry.OPENING_EFFECT -> MeeshyIcons.Sparkles
    ComposerMoreEntry.VISUAL_EFFECT -> MeeshyIcons.PhotoFilter
    ComposerMoreEntry.CAPTION -> MeeshyIcons.Subtitles
    ComposerMoreEntry.SAVE_TO_PHOTOS -> MeeshyIcons.Download
    ComposerMoreEntry.SHARE -> MeeshyIcons.Share
}

internal fun ComposerMoreEntry.labelRes(): Int = when (this) {
    ComposerMoreEntry.ADD_SLIDE -> R.string.stories_composer_add_slide
    ComposerMoreEntry.BACKGROUND -> R.string.story_tool_texture
    ComposerMoreEntry.SLIDE_DURATION -> R.string.stories_composer_slide_duration
    ComposerMoreEntry.ANIMATION -> R.string.composer_scene_more_animation
    ComposerMoreEntry.TIMING -> R.string.composer_scene_more_timing
    ComposerMoreEntry.FRAME -> R.string.stories_scene_frame_title
    ComposerMoreEntry.OPENING_EFFECT -> R.string.stories_scene_effect_opening
    ComposerMoreEntry.VISUAL_EFFECT -> R.string.stories_scene_effect_visual
    ComposerMoreEntry.CAPTION -> R.string.stories_composer_text_caption
    ComposerMoreEntry.SAVE_TO_PHOTOS -> R.string.stories_scene_overflow_save
    ComposerMoreEntry.SHARE -> R.string.stories_scene_overflow_share
}
