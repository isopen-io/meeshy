package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.feed.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **La trace du son de fond, en tête de la scène lue, et elle AGIT** (#5602, iOS `PostSceneSoundHeader`) : le crédit du son
 * (note et onde d'un son original, « titre · @auteur » d'un son emprunté), puis le coupe-son et l'arrêt/reprise de la scène
 * ENTIÈRE. Posée au-dessus de la scène, jamais dessus : un son de fond ne produit aucun pixel au rendu.
 */
@Composable
internal fun PostSceneSoundHeader(
    credit: SceneSoundCredit,
    muted: Boolean,
    paused: Boolean,
    onToggleMute: () -> Unit,
    onTogglePlayback: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = MeeshyTheme.tokens.textSecondary
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
        PostSceneSoundCredit(credit = credit, tint = tint, modifier = Modifier.weight(1f).padding(start = MeeshySpacing.sm))
        IconButton(onClick = onToggleMute) {
            Icon(
                imageVector = if (muted) MeeshyIcons.VolumeOff else MeeshyIcons.VolumeUp,
                contentDescription = stringResource(if (muted) R.string.feed_scene_sound_unmute else R.string.feed_scene_sound_mute),
                tint = tint,
            )
        }
        IconButton(onClick = onTogglePlayback) {
            Icon(
                imageVector = if (paused) MeeshyIcons.Play else MeeshyIcons.Pause,
                contentDescription = stringResource(if (paused) R.string.feed_scene_resume else R.string.feed_scene_pause),
                tint = tint,
            )
        }
    }
}

/**
 * Le crédit du son joué, posé en tête de la barre (iOS `PostSceneSoundHeader`) : la note et l'onde d'un son original, la note et
 * « titre · @auteur » d'un son emprunté. L'œil et le lecteur d'écran reçoivent la même chose : « Son de fond · crédit · durée ».
 */
@Composable
private fun PostSceneSoundCredit(credit: SceneSoundCredit, tint: Color, modifier: Modifier) {
    val track = stringResource(R.string.feed_scene_sound_track)
    when (credit) {
        SceneSoundCredit.None -> Spacer(modifier)
        SceneSoundCredit.Original -> Row(
            modifier = modifier.semantics(mergeDescendants = true) { contentDescription = track },
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(imageVector = MeeshyIcons.MusicNote, contentDescription = null, tint = tint, modifier = Modifier.size(CREDIT_ICON_SIZE))
            Icon(imageVector = MeeshyIcons.Waveform, contentDescription = null, tint = tint, modifier = Modifier.size(CREDIT_ICON_SIZE))
        }
        is SceneSoundCredit.Library -> {
            val spoken = listOf(track, credit.attribution, credit.duration.orEmpty()).filter(String::isNotEmpty).joinToString(" · ")
            Row(
                modifier = modifier.semantics(mergeDescendants = true) { contentDescription = spoken },
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(imageVector = MeeshyIcons.MusicNote, contentDescription = null, tint = tint, modifier = Modifier.size(CREDIT_ICON_SIZE))
                Text(text = credit.line, color = tint, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

private val CREDIT_ICON_SIZE = 16.dp

