package me.meeshy.app.stories

import android.text.format.DateUtils
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.SoundShelfLaw
import me.meeshy.sdk.model.composer.sound.SoundTitle
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor
import android.icu.text.CompactDecimalFormat
import java.util.Locale

private val COVER_SIZE = 48.dp

/** Le titre d'une ligne : celui de l'auteur, sinon la date d'envoi en durée écoulée — jamais une chaîne du serveur. */
@Composable
internal fun soundTitleText(sound: ApiSound): String =
    when (val title = SoundShelfLaw.title(sound)) {
        is SoundTitle.Authored -> title.text
        is SoundTitle.UploadedAt -> uploadedAgo(title.epochMillis)
        SoundTitle.Original -> stringResource(R.string.story_sound_library_untitled)
    }

private fun uploadedAgo(epochMillis: Long): String =
    DateUtils.getRelativeTimeSpanString(epochMillis, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()

/**
 * Une ligne de l'étagère — cercle de vignette qui porte lecture/arrêt (une roue pendant le téléchargement : « stop »
 * mentirait, il n'y a rien à arrêter), titre + auteur + compteurs, renommer (mes sons), « Utiliser ». Le bloc texte
 * s'ouvre sur la page du son quand elle existe ; l'appui long ouvre le retrait sur « Mes sons ».
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun SoundShelfRow(
    sound: ApiSound,
    isMine: Boolean,
    isPlaying: Boolean,
    isPreparing: Boolean,
    onTogglePreview: () -> Unit,
    onRename: (() -> Unit)?,
    onRemove: (() -> Unit)?,
    onUse: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SoundCover(sound, isPlaying, isPreparing, onTogglePreview)
        Box(modifier = Modifier.weight(1f)) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .combinedClickable(
                        enabled = onRemove != null,
                        onClick = {},
                        onLongClick = { menuOpen = true },
                    ),
            ) {
                Text(
                    text = soundTitleText(sound),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                SoundMetadata(sound)
                SoundShelfLaw.secondaryDateMillis(sound, isMine)?.let { millis ->
                    Text(
                        text = uploadedAgo(millis),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                        maxLines = 1,
                    )
                }
            }
            if (onRemove != null) {
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.story_sound_library_remove), color = MeeshyPalette.Error) },
                        leadingIcon = { Icon(MeeshyIcons.Delete, contentDescription = null, tint = MeeshyPalette.Error) },
                        onClick = {
                            menuOpen = false
                            onRemove()
                        },
                    )
                }
            }
        }
        if (onRename != null) {
            IconButton(onClick = onRename, modifier = Modifier.size(44.dp)) {
                Icon(
                    MeeshyIcons.Edit,
                    contentDescription = stringResource(R.string.story_sound_library_rename),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        Button(onClick = onUse) { Text(stringResource(R.string.story_sound_library_use)) }
    }
}

/** Auteur, publications, lectures — la ligne qui rend une entrée sans titre identifiable ; icônes lues comme des mots. */
@Composable
private fun SoundMetadata(sound: ApiSound) {
    val author = sound.authorLabel
    val posts = if (sound.postCount > 0) {
        pluralStringResource(R.plurals.story_sound_library_postCount, sound.postCount, sound.postCount)
    } else {
        null
    }
    val plays = if (sound.playCount > 0) {
        pluralStringResource(R.plurals.story_sound_library_playCount, sound.playCount, sound.playCount)
    } else {
        null
    }
    val spoken = listOfNotNull(author, posts, plays).joinToString(", ")
    if (spoken.isEmpty()) return
    Row(
        modifier = Modifier.clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (author != null) {
            Text(author, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        }
        if (sound.postCount > 0) CompactCount(MeeshyIcons.Layers, sound.postCount)
        if (sound.playCount > 0) CompactCount(MeeshyIcons.Play, sound.playCount)
    }
}

@Composable
private fun CompactCount(icon: androidx.compose.ui.graphics.vector.ImageVector, count: Int) {
    val formatted = remember(count) {
        CompactDecimalFormat.getInstance(Locale.getDefault(), CompactDecimalFormat.CompactStyle.SHORT).format(count)
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(12.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(formatted, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
    }
}

/** Cascade de vignette : image du contenu → avatar de l'auteur → aplat à sa teinte. Jamais un cercle vide. */
@Composable
private fun SoundCover(sound: ApiSound, isPlaying: Boolean, isPreparing: Boolean, onToggle: () -> Unit) {
    val label = when {
        isPreparing -> stringResource(R.string.story_sound_library_preparing)
        isPlaying -> stringResource(R.string.story_sound_library_stop)
        else -> stringResource(R.string.story_sound_library_play)
    }
    Box(
        modifier = Modifier
            .size(COVER_SIZE)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onToggle)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        val uploader = sound.uploader
        when {
            sound.coverUrl != null -> AsyncImage(
                model = sound.coverUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(COVER_SIZE),
            )
            uploader != null -> MeeshyAvatar(
                name = uploader.displayName ?: uploader.username,
                size = COVER_SIZE,
                imageUrl = uploader.avatar,
            )
            else -> Box(
                Modifier
                    .size(COVER_SIZE)
                    .background(sound.coverColor?.let { hexColor(it, MeeshyPalette.Indigo500) } ?: MeeshyPalette.Indigo500),
            )
        }
        Box(Modifier.size(COVER_SIZE).background(MeeshyPalette.Ink.copy(alpha = 0.42f)), contentAlignment = Alignment.Center) {
            Crossfade(targetState = if (isPreparing) 0 else if (isPlaying) 1 else 2, label = "sound-cover-state") { phase ->
                when (phase) {
                    0 -> CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MeeshyPalette.White)
                    1 -> Icon(MeeshyIcons.Stop, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(22.dp))
                    else -> Icon(MeeshyIcons.Play, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(22.dp))
                }
            }
        }
    }
}
