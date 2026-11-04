package me.meeshy.app.stories

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.story.StoryGroupIntro
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.media.MeeshyAsyncImage
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * Le rendu UNIQUE de l'identité d'un auteur entre deux groupes (iOS `StoryAuthorIdentityCard`) : la bannière du profil
 * en fond (flou ThumbHash pendant le chargement ; sans bannière, dégradé de la couleur d'avatar vers le noir sur une
 * base opaque), le voile de lisibilité 0,62 / 0,28 / 0,72, et au centre avatar, nom, @pseudo, présence, humeur.
 *
 * [contentAlpha] est lu en phase de dessin : la face de cube y monte l'identité AU DOIGT, sans recomposer.
 * Paramètres OPAQUES : [presence] est déjà décidée (amis seulement) par l'appelant, la couleur d'avatar suit le nom.
 */
@Composable
internal fun StoryAuthorIdentityCard(
    intro: StoryGroupIntro,
    avatarUrl: String?,
    presence: PresenceState?,
    modifier: Modifier = Modifier,
    contentAlpha: () -> Float = { 1f },
) {
    val accent = remember(intro.title) { hexColor(DynamicColorGenerator.colorForName(intro.title)) }
    Box(modifier.fillMaxSize().background(Color.Black)) {
        IdentityBackdrop(intro, accent)
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(StoryGroupIntro.SCRIM_ALPHAS.map { Color.Black.copy(alpha = it) }),
            ),
        )
        IdentityContent(intro, avatarUrl, presence, accent, Modifier.align(Alignment.Center).graphicsLayer { alpha = contentAlpha() })
    }
}

@Composable
private fun IdentityBackdrop(intro: StoryGroupIntro, accent: Color) {
    val fallback = Modifier.fillMaxSize().background(Brush.linearGradient(listOf(accent, Color.Black)))
    if (intro.bannerUrl.isNullOrEmpty()) {
        Box(fallback)
        return
    }
    Box(fallback) {
        MeeshyAsyncImage(
            url = intro.bannerUrl,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            thumbHash = intro.bannerThumbHash,
            showsStatusOverlays = false,
        )
    }
}

@Composable
private fun IdentityContent(
    intro: StoryGroupIntro,
    avatarUrl: String?,
    presence: PresenceState?,
    accent: Color,
    modifier: Modifier,
) {
    Column(
        modifier.padding(horizontal = MeeshySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
    ) {
        MeeshyAvatar(name = intro.title, size = 88.dp, containerColor = accent, imageUrl = avatarUrl)
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(intro.title, color = MeeshyPalette.White, fontSize = 22.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            intro.handle?.let { Text(it, color = MeeshyPalette.White.copy(alpha = 0.8f), fontSize = 15.sp) }
        }
        presence?.let { PresenceBadge(it) }
        intro.moodEmoji?.let { MoodCapsule(it, intro.moodMessage) }
    }
}

@Composable
private fun PresenceBadge(state: PresenceState) {
    val dot = meeshyPresenceDotColor(state) ?: return
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(9.dp).clip(CircleShape).background(dot))
        Text(stringResource(storyGroupIntroPresenceLabel(state)), color = MeeshyPalette.White.copy(alpha = 0.9f), fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun MoodCapsule(emoji: String, message: String?) {
    Row(
        Modifier
            .clip(RoundedCornerShape(percent = 50))
            .background(MeeshyPalette.White.copy(alpha = 0.16f))
            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(emoji, fontSize = 20.sp)
        if (!message.isNullOrEmpty()) {
            Text(message, color = MeeshyPalette.White.copy(alpha = 0.9f), fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Le libellé de présence de l'interlude : le même texte pour le badge et pour le résumé TalkBack. */
@StringRes
internal fun storyGroupIntroPresenceLabel(state: PresenceState): Int = when (state) {
    PresenceState.ONLINE -> R.string.story_group_intro_online
    PresenceState.AWAY -> R.string.story_group_intro_away
    PresenceState.IDLE -> R.string.story_group_intro_idle
    PresenceState.OFFLINE -> R.string.story_group_intro_offline
}
