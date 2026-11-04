package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Comment la vidéo d'un réel republié se joue DANS la bande du fil (iOS `ReelFeedVideoSurface`) : le moteur de lecture vit hors
 * du module du fil, l'application le fournit. Arguments : la vidéo du réel cité, [active] (élue par l'autoplay sur l'id du post
 * CONTENANT : elle seule joue), [muted] (le fil est muet tant que l'utilisateur ne rétablit pas le son), le cadre à remplir.
 */
typealias ReelRepostVideoSurface = @Composable (media: FeedMediaItem, active: Boolean, muted: Boolean, modifier: Modifier) -> Unit

/** `null` hors de l'application (tests, aperçus) : la bande reste alors le poster, sans lecture. */
val LocalReelRepostVideoSurface = staticCompositionLocalOf<ReelRepostVideoSurface?> { null }

/**
 * Un RÉEL republié dans le fil, en carte pleine largeur COMPACTE (iOS `ReelRepostEmbedCell`) : une bande de [REEL_STRIP_HEIGHT]
 * (poster rogné pour une vidéo, logo + note pour un audio), le bouton de lecture central, la lecture inline MUETTE quand le
 * fil élit [containingPostId] (l'id du post CONTENANT, jamais celui du réel cité), le bouton de son, puis l'auteur d'origine
 * (avatar, @pseudo, cliquables vers son profil), la légende et les j'aime. Un appui sur la bande ou la légende ouvre le réel.
 */
@Composable
internal fun ReelRepostEmbedCell(
    embed: RepostEmbedPresentation,
    containingPostId: String?,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val cover = embed.reelCover ?: return
    val key = containingPostId?.let(RepostEmbedAutoplayKey::of)
    val coordinator = LocalFeedAutoplayCoordinator.current
    val activeId by (coordinator?.activeId?.collectAsState() ?: remember { mutableStateOf<String?>(null) })
    val surface = LocalReelRepostVideoSurface.current
    val video = embed.reelStripVideo()
    val active = key != null && activeId == key && video != null && surface != null
    var soundOn by remember(embed.id) { mutableStateOf(false) }
    val handle = embed.authorUsername ?: embed.authorName
    val shape = RoundedCornerShape(MeeshyRadius.md)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .border(1.dp, MeeshyPalette.Indigo500.copy(alpha = 0.25f), shape)
            .background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.05f))
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        handle?.let {
            Text(
                text = stringResource(R.string.feed_repost_from) + " @" + it,
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        Box(modifier = Modifier.fillMaxWidth().height(REEL_STRIP_HEIGHT).reelFrame(key, embed.reelStripKind())) {
            ReelCoverView(cover = cover, authorName = embed.authorName, onOpen = onOpen, modifier = Modifier.fillMaxSize())
            if (active && video != null && surface != null) {
                Box(Modifier.fillMaxSize().clip(RoundedCornerShape(MeeshyRadius.md))) {
                    surface(video, true, !soundOn, Modifier.fillMaxSize())
                }
                SoundButton(
                    soundOn = soundOn,
                    onToggle = { soundOn = !soundOn },
                    modifier = Modifier.align(Alignment.TopStart).padding(MeeshySpacing.sm),
                )
            }
        }
        AuthorRow(embed)
        if (embed.content.isNotBlank()) {
            Text(
                text = embed.content,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onOpen),
            )
        }
        LikesRow(embed.likeCount)
    }
}

@Composable
private fun AuthorRow(embed: RepostEmbedPresentation) {
    val unknown = stringResource(R.string.feed_unknown_author)
    val name = embed.authorName ?: unknown
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        MeeshyAvatar(
            name = name,
            size = 28.dp,
            imageUrl = embed.authorAvatarUrl,
            presence = rememberPresence(embed.authorId),
            modifier = Modifier.opensAuthorProfile(embed.authorProfile()),
        )
        Text(
            text = "@" + (embed.authorUsername ?: name),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.opensAuthorProfile(embed.authorProfile()),
        )
    }
}

@Composable
private fun LikesRow(likes: Int) {
    val label = pluralStringResource(R.plurals.feed_repost_likes_count, likes, likes)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = label },
    ) {
        Icon(MeeshyIcons.HeartFilled, contentDescription = null, tint = MeeshyPalette.Indigo500.copy(alpha = 0.7f), modifier = Modifier.size(12.dp))
        Text(
            text = likes.toString(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium,
            color = MeeshyPalette.Indigo500.copy(alpha = 0.7f),
        )
    }
}

@Composable
private fun SoundButton(soundOn: Boolean, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    val label = stringResource(if (soundOn) R.string.feed_scene_sound_mute else R.string.feed_scene_sound_unmute)
    Box(
        modifier = modifier
            .minimumInteractiveComponentSize()
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.45f))
            .clickable(role = Role.Button, onClick = onToggle)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (soundOn) MeeshyIcons.VolumeUp else MeeshyIcons.VolumeOff,
            contentDescription = null,
            tint = MeeshyPalette.White,
            modifier = Modifier.size(18.dp),
        )
    }
}
