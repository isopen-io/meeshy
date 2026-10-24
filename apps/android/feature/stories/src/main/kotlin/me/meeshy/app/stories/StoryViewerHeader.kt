package me.meeshy.app.stories

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor
import java.time.ZoneId

private val HEADER_AVATAR_SIZE = 32.dp

/**
 * L'identité de l'auteur en tête du lecteur — iOS `FullscreenIdentityRow`
 * (`StoryViewerView+Header.swift`) : l'avatar sans anneau (on est déjà dans sa story),
 * le nom, et sur la même ligne le temps écoulé (« 2 h »), qui qualifie l'AUTEUR ; une
 * republication ajoute l'icône et le `@handle`, sans « via ». Lue d'un seul tenant par
 * TalkBack : « Profil de X ».
 */
@Composable
internal fun StoryAuthorIdentity(
    name: String,
    avatarUrl: String?,
    accentHex: String,
    createdAtMillis: Long?,
    repostAttribution: StoryRepostAttribution?,
    modifier: Modifier = Modifier,
) {
    val profileLabel = stringResource(R.string.stories_viewer_profile_of, name)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier.semantics(mergeDescendants = true) { contentDescription = profileLabel },
    ) {
        MeeshyAvatar(name = name, size = HEADER_AVATAR_SIZE, containerColor = hexColor(accentHex), imageUrl = avatarUrl)
        Column(modifier = Modifier.padding(start = MeeshySpacing.sm)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = name,
                    color = MeeshyPalette.White,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                createdAtMillis?.let { StoryElapsedTime(it) }
            }
            repostAttribution?.let { RepostLine(it) }
        }
    }
}

@Composable
private fun StoryElapsedTime(createdAtMillis: Long) {
    val strings = rememberRelativeTimeStrings()
    val locale = LocalConfiguration.current.locales[0]
    val label = RelativeTimeFormat.short(
        epochMillis = createdAtMillis,
        referenceMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = locale,
        strings = strings,
    )
    Text(
        text = label,
        color = MeeshyPalette.White.copy(alpha = 0.7f),
        style = MaterialTheme.typography.labelMedium,
        maxLines = 1,
        modifier = Modifier.padding(start = MeeshySpacing.xs),
    )
}

@Composable
private fun RepostLine(attribution: StoryRepostAttribution) {
    val handle = attribution.handle
    val repostLabel = handle
        ?.let { stringResource(R.string.stories_reposted_from, it) }
        ?: stringResource(R.string.stories_reposted)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = repostLabel },
    ) {
        Icon(
            Icons.Filled.Repeat,
            contentDescription = null,
            tint = MeeshyPalette.White.copy(alpha = 0.6f),
            modifier = Modifier.size(12.dp),
        )
        handle?.let {
            Text(
                text = "@$it",
                color = MeeshyPalette.White.copy(alpha = 0.65f),
                style = MaterialTheme.typography.labelMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 2.dp),
            )
        }
    }
}

/**
 * La coupure du son de la session, dans l'en-tête — iOS `StoryGlobalMute` : une seule
 * commande pour la vidéo de fond, les vidéos de premier plan et les pistes audio.
 */
@Composable
internal fun StoryMuteButton(isMuted: Boolean, onToggle: () -> Unit) {
    IconButton(onClick = onToggle) {
        Icon(
            if (isMuted) Icons.AutoMirrored.Filled.VolumeOff else Icons.AutoMirrored.Filled.VolumeUp,
            contentDescription = stringResource(if (isMuted) R.string.stories_viewer_unmute else R.string.stories_viewer_mute),
            tint = MeeshyPalette.White,
        )
    }
}
