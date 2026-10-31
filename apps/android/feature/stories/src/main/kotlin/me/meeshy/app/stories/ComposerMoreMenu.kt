package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerMoreEntry
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Le « ⋯ » posé sur la scène (#13834) : l'aperçu, puis ce que la colonne d'outils ne porte pas — une diapo de plus, le
 * fond (couleurs, un média choisi comme fond, le retirer), la durée, l'animation et son temps, le cadre et les effets d'un
 * fond média, la légende — puis l'export, et « Tout effacer » en dernier, en couleur d'alerte (miroir de
 * `ComposerOverflowCopy` iOS, #4996, #13845). Les entrées sont celles de [me.meeshy.sdk.model.composer.ComposerSceneTools.moreEntries] ;
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
                val tint = if (entry.isDestructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                DropdownMenuItem(
                    text = { Text(stringResource(entry.labelRes()), color = tint) },
                    leadingIcon = { Icon(entry.glyph(), contentDescription = null, tint = tint) },
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
    ComposerMoreEntry.PREVIEW -> MeeshyIcons.Eye
    ComposerMoreEntry.PICK_BACKGROUND -> MeeshyIcons.Wallpaper
    ComposerMoreEntry.REMOVE_BACKGROUND -> MeeshyIcons.RemoveCircleFilled
    ComposerMoreEntry.CLEAR_ALL -> MeeshyIcons.Delete
    ComposerMoreEntry.ADD_SLIDE -> MeeshyIcons.Add
    ComposerMoreEntry.BACKGROUND -> MeeshyIcons.Palette
    ComposerMoreEntry.SLIDE_DURATION -> MeeshyIcons.Timer
    ComposerMoreEntry.ANIMATION -> MeeshyIcons.Bolt
    ComposerMoreEntry.TIMING -> MeeshyIcons.ScheduleFilled
    ComposerMoreEntry.OPENING_EFFECT -> MeeshyIcons.Sparkles
    ComposerMoreEntry.VISUAL_EFFECT -> MeeshyIcons.PhotoFilter
    ComposerMoreEntry.CAPTION -> MeeshyIcons.Subtitles
    ComposerMoreEntry.MENTION -> MeeshyIcons.Mention
    ComposerMoreEntry.HASHTAGS -> MeeshyIcons.Tag
    ComposerMoreEntry.PLACE -> MeeshyIcons.Location
    ComposerMoreEntry.SAVE_TO_PHOTOS -> MeeshyIcons.Download
    ComposerMoreEntry.SHARE -> MeeshyIcons.Share
}

internal fun ComposerMoreEntry.labelRes(): Int = when (this) {
    ComposerMoreEntry.PREVIEW -> R.string.composer_more_preview
    ComposerMoreEntry.PICK_BACKGROUND -> R.string.composer_more_pick_background
    ComposerMoreEntry.REMOVE_BACKGROUND -> R.string.composer_more_remove_background
    ComposerMoreEntry.CLEAR_ALL -> R.string.composer_more_clear_all
    ComposerMoreEntry.ADD_SLIDE -> R.string.stories_composer_add_slide
    ComposerMoreEntry.BACKGROUND -> R.string.story_tool_texture
    ComposerMoreEntry.SLIDE_DURATION -> R.string.stories_composer_slide_duration
    ComposerMoreEntry.ANIMATION -> R.string.composer_scene_more_animation
    ComposerMoreEntry.TIMING -> R.string.composer_scene_more_timing
    ComposerMoreEntry.OPENING_EFFECT -> R.string.stories_scene_effect_opening
    ComposerMoreEntry.VISUAL_EFFECT -> R.string.stories_scene_effect_visual
    ComposerMoreEntry.CAPTION -> R.string.stories_composer_text_caption
    ComposerMoreEntry.MENTION -> R.string.composer_more_mention
    ComposerMoreEntry.HASHTAGS -> R.string.story_hashtag_title
    ComposerMoreEntry.PLACE -> R.string.story_place_title
    ComposerMoreEntry.SAVE_TO_PHOTOS -> R.string.stories_scene_overflow_save
    ComposerMoreEntry.SHARE -> R.string.stories_scene_overflow_share
}
