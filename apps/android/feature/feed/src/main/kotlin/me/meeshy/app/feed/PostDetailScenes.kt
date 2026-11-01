package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.StoryAudioAvailability
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Les scènes d'un post dans sa fiche** (#13893, iOS `PostDetailView.storyCanvasSection`) : une seule publication à l'écran,
 * donc ses scènes JOUENT, et leur son avec elles (« Audio is ON by DEFAULT in detail »). Une barre posée au-dessus de la scène,
 * jamais sur elle, coupe et rétablit le son, et arrête ou reprend la scène entière (iOS `PostSceneSoundHeader`). Elle ne paraît
 * que si une scène a quelque chose à faire entendre : un contrôle sans effet serait un bouton inerte.
 */
@Composable
internal fun PostDetailScenes(scenes: FeedPostScenes, modifier: Modifier = Modifier) {
    var muted by rememberSaveable { mutableStateOf(false) }
    var paused by rememberSaveable { mutableStateOf(false) }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        if (scenes.offersSound) {
            PostSceneSoundBar(muted = muted, paused = paused, onToggleMute = { muted = !muted }, onTogglePlayback = { paused = !paused })
        }
        PostScenesView(scenes = scenes, live = !paused, host = PostScenesHost.DETAIL, muted = muted)
    }
}

@Composable
private fun PostSceneSoundBar(muted: Boolean, paused: Boolean, onToggleMute: () -> Unit, onTogglePlayback: () -> Unit) {
    val tint = MeeshyTheme.tokens.textSecondary
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
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

/** Ce que les scènes d'un post font entendre, lu une fois à la projection du post. */
internal object PostSceneSound {

    /**
     * Une scène a-t-elle quelque chose à faire entendre ? Une vidéo compte tant qu'elle ne se déclare pas muette : la fiche n'a
     * pas sondé sa piste, et taire le contrôle d'un son qui joue serait pire que l'offrir à une vidéo silencieuse.
     */
    fun offers(scenes: List<StoryItem>): Boolean = scenes.any { scene ->
        val effects = scene.storyEffects
        StoryAudioAvailability.hasAudibleSound(effects, StoryAudioAvailability.videosNeedingAudioProbe(effects).associate { it.id to true })
    }
}
