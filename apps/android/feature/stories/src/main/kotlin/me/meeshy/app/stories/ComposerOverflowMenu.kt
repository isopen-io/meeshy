package me.meeshy.app.stories

import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.scene.ComposerOverflowEntry
import me.meeshy.ui.icons.MeeshyIcons

/**
 * **Le `⋯` du composeur** (miroir de `ComposerOverflowCopy` iOS, #4996) : ce que la scène emporte hors de Meeshy —
 * enregistrer en galerie, transférer. Les entrées sont celles de la loi pure ; sans entrée servie, le bouton n'existe pas.
 */
@Composable
internal fun ComposerOverflowMenu(entries: List<ComposerOverflowEntry>, enabled: Boolean, onPick: (ComposerOverflowEntry) -> Unit) {
    if (entries.isEmpty()) return
    var expanded by remember { mutableStateOf(false) }
    IconButton(onClick = { expanded = true }, enabled = enabled) {
        Icon(MeeshyIcons.MoreHorizontal, contentDescription = stringResource(R.string.stories_scene_overflow_menu))
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        entries.forEach { entry ->
            DropdownMenuItem(
                text = {
                    Text(
                        stringResource(
                            if (entry == ComposerOverflowEntry.SAVE_TO_PHOTOS) R.string.stories_scene_overflow_save
                            else R.string.stories_scene_overflow_share,
                        ),
                    )
                },
                leadingIcon = {
                    Icon(
                        if (entry == ComposerOverflowEntry.SAVE_TO_PHOTOS) MeeshyIcons.Download else MeeshyIcons.Share,
                        contentDescription = null,
                    )
                },
                onClick = {
                    expanded = false
                    onPick(entry)
                },
            )
        }
    }
}
