package me.meeshy.app.feed

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.size
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.annotation.StringRes
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les cinq entrées du menu « + » du placeholder (iOS `FeedComposerPlaceholder`) : ce qu'on ajoute d'emblée à sa publication. */
internal enum class FeedComposerEntry(val icon: ImageVector, @StringRes val labelRes: Int) {
    PHOTO_VIDEO(MeeshyIcons.PhotoLibraryOutlined, R.string.feed_composer_plus_photo_video),
    CAMERA(MeeshyIcons.PhotoCameraOutlined, R.string.feed_composer_plus_camera),
    AUDIO(MeeshyIcons.GraphicEqOutlined, R.string.feed_composer_plus_audio),
    FILE(MeeshyIcons.AttachFileOutlined, R.string.feed_composer_plus_file),
    LOCATION(MeeshyIcons.Location, R.string.feed_composer_plus_location),
}

/**
 * La porte « Partager quelque chose avec le monde… » au-dessus du fil (iOS `FeedView.composerPlaceholder`) :
 * l'avatar de l'utilisateur, l'invite, puis le menu « + » dont chaque entrée ouvre le composeur ([onEntry]).
 */
@Composable
internal fun FeedComposerPlaceholder(
    onClick: () -> Unit,
    userName: String? = null,
    avatarUrl: String? = null,
    onEntry: (FeedComposerEntry) -> Unit = { onClick() },
) {
    val a11yLabel = stringResource(R.string.feed_composer_open_label)
    val haptics = rememberMeeshyHaptics()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .padding(bottom = MeeshySpacing.sm)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.inputBackground)
            .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.lg))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .clickable {
                    haptics.light()
                    onClick()
                }
                .semantics {
                    contentDescription = a11yLabel
                    role = Role.Button
                },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            if (userName != null) MeeshyAvatar(name = userName, size = 36.dp, imageUrl = avatarUrl)
            Text(
                text = stringResource(R.string.feed_composer_open_placeholder),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.weight(1f),
            )
        }
        FeedComposerPlusMenu(onEntry = { entry ->
            haptics.light()
            onEntry(entry)
        })
    }
}

@Composable
private fun RowScope.FeedComposerPlusMenu(onEntry: (FeedComposerEntry) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }, modifier = Modifier.size(48.dp)) {
            Icon(
                imageVector = MeeshyIcons.AddPhotoAlternateOutlined,
                contentDescription = stringResource(R.string.feed_composer_plus_menu),
                tint = MeeshyPalette.Indigo400,
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            FeedComposerEntry.entries.forEach { entry ->
                DropdownMenuItem(
                    text = { Text(stringResource(entry.labelRes)) },
                    leadingIcon = { Icon(entry.icon, contentDescription = null) },
                    onClick = {
                        expanded = false
                        onEntry(entry)
                    },
                )
            }
        }
    }
}
