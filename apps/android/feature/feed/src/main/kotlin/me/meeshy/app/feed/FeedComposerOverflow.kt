package me.meeshy.app.feed

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.RowScope
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
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.composer.ComposerRailButton
import me.meeshy.ui.icons.MeeshyIcons

private val OverflowIn = fadeIn(spring(stiffness = Spring.StiffnessMediumLow)) + scaleIn(spring(stiffness = Spring.StiffnessMediumLow), initialScale = 0.6f)
private val OverflowOut = fadeOut(spring(stiffness = Spring.StiffnessMedium)) + scaleOut(spring(stiffness = Spring.StiffnessMedium), targetScale = 0.6f)

/**
 * The `⋯` of the top corridor (iOS `overflowMenu`, `MeeshyComposerHost+Overflow`): it paints only the entries the law serves —
 * with none, the button is absent, and it grows in when the document first has something to take away. The menu is announced
 * by its own name (« Plus d'options »), each entry by its label, and the destructive one in the error ink.
 */
@Composable
internal fun RowScope.PostOverflowMenu(entries: List<PostOverflowEntry>, enabled: Boolean, onPick: (PostOverflowEntry) -> Unit) {
    AnimatedVisibility(visible = entries.isNotEmpty(), enter = OverflowIn, exit = OverflowOut) {
        var expanded by remember { mutableStateOf(false) }
        Box {
            ComposerRailButton(MeeshyIcons.MoreHorizontal, stringResource(R.string.feed_composer_overflow_menu), { expanded = true }, enabled = enabled, active = expanded)
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                entries.forEach { entry ->
                    val destructive = entry == PostOverflowEntry.CLEAR_ALL
                    val ink = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                    DropdownMenuItem(
                        text = { Text(stringResource(overflowLabel(entry)), color = ink) },
                        leadingIcon = { Icon(overflowGlyph(entry), contentDescription = null, tint = ink) },
                        onClick = {
                            expanded = false
                            onPick(entry)
                        },
                    )
                }
            }
        }
    }
}

private fun overflowLabel(entry: PostOverflowEntry): Int = when (entry) {
    PostOverflowEntry.REMOVE_BACKGROUND -> R.string.feed_composer_overflow_remove_background
    PostOverflowEntry.CLEAR_ALL -> R.string.feed_composer_overflow_clear_all
}

private fun overflowGlyph(entry: PostOverflowEntry) = when (entry) {
    PostOverflowEntry.REMOVE_BACKGROUND -> MeeshyIcons.Palette
    PostOverflowEntry.CLEAR_ALL -> MeeshyIcons.Delete
}
