package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
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
import me.meeshy.sdk.model.BackgroundSoundV3
import me.meeshy.sdk.model.StoryAudioAvailability
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.composer.sound.SoundCredit
import me.meeshy.sdk.model.resolvedBackgroundAudio
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Les scènes d'un post dans sa fiche** (#13893, iOS `PostDetailView.storyCanvasSection`) : une seule publication à l'écran,
 * donc ses scènes JOUENT, et leur son avec elles (« Audio is ON by DEFAULT in detail »). Une barre posée au-dessus de la scène,
 * jamais sur elle, coupe et rétablit le son, et arrête ou reprend la scène entière (iOS `PostSceneSoundHeader`). Elle ne paraît
 * que si une scène a quelque chose à faire entendre : un contrôle sans effet serait un bouton inerte. Elle nomme en tête le son
 * qu'elle fait entendre ([SceneSoundCredit], #14201).
 */
@Composable
internal fun PostDetailScenes(scenes: FeedPostScenes, modifier: Modifier = Modifier) {
    var muted by rememberSaveable { mutableStateOf(false) }
    var paused by rememberSaveable { mutableStateOf(false) }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        if (scenes.offersSound) {
            PostSceneSoundBar(
                credit = scenes.soundCredit,
                muted = muted,
                paused = paused,
                onToggleMute = { muted = !muted },
                onTogglePlayback = { paused = !paused },
            )
        }
        PostScenesView(scenes = scenes, live = !paused, host = PostScenesHost.DETAIL, muted = muted)
    }
}

@Composable
private fun PostSceneSoundBar(credit: SceneSoundCredit, muted: Boolean, paused: Boolean, onToggleMute: () -> Unit, onTogglePlayback: () -> Unit) {
    val tint = MeeshyTheme.tokens.textSecondary
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
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
 * Le son que la fiche NOMME (iOS `BackgroundSoundBadge.announcement`) : rien, un son ORIGINAL (la note et l'onde), ou un son de
 * la bibliothèque, crédité de son titre et de son auteur.
 */
sealed interface SceneSoundCredit {
    data object None : SceneSoundCredit

    data object Original : SceneSoundCredit

    data class Library(val title: String?, val author: String?, val duration: String?) : SceneSoundCredit {
        /** « Titre · @auteur » ; vide sans l'un ni l'autre. */
        val attribution: String
            get() = listOfNotNull(title, author?.trimStart('@')?.takeIf(String::isNotEmpty)?.let { "@$it" }).joinToString(" · ")

        /** La ligne affichée : l'attribution, ou le crédit générique d'un son qui ne dit pas son nom (iOS `genericCredit`). */
        val line: String get() = attribution.ifEmpty { GENERIC_CREDIT }

        private companion object {
            const val GENERIC_CREDIT = "♫ —"
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

    /**
     * Le son que la fiche nomme, dans l'ordre d'iOS (`BackgroundSoundBadge.backgroundSound`) : le son du DOCUMENT quand le post le
     * garde, puis la piste de fond de la première scène (empruntée si elle porte un `soundId`, sinon originale), puis l'identifiant
     * de fond hérité, toujours un emprunt. Titre et auteur viennent de la piste ; la durée, de la piste résolue. Sans aucun son de
     * fond, la barre nomme le son de la bibliothèque POSÉ sur la scène (#14201) : c'est lui qu'elle fait entendre.
     */
    fun credit(scenes: List<StoryItem>, documentSound: BackgroundSoundV3?): SceneSoundCredit {
        val effects = scenes.firstOrNull()?.storyEffects
        val trace = effects?.audioPlayerObjects?.firstOrNull { it.isBackground == true }
        val borrowed = library(trace, (trace ?: effects?.resolvedBackgroundAudio)?.let(SoundCredit::durationLabel))
        if (documentSound != null) return if (documentSound.source.t == ORIGINAL_SOURCE) SceneSoundCredit.Original else borrowed
        if (trace != null) return if (trace.soundId.isNullOrBlank()) SceneSoundCredit.Original else borrowed
        if (!effects?.backgroundAudioId.isNullOrBlank()) return borrowed
        val posed = effects?.audioPlayerObjects?.firstOrNull { !it.soundId.isNullOrBlank() } ?: return SceneSoundCredit.None
        return library(posed, SoundCredit.durationLabel(posed))
    }

    private fun library(track: StoryAudioPlayerObject?, duration: String?): SceneSoundCredit.Library = SceneSoundCredit.Library(
        title = track?.name?.trim()?.takeIf(String::isNotEmpty),
        author = track?.soundAuthorUsername?.trim()?.takeIf(String::isNotEmpty),
        duration = duration,
    )

    private const val ORIGINAL_SOURCE = "original"
}
