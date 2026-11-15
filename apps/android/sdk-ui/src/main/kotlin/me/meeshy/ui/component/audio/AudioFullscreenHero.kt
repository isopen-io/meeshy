package me.meeshy.ui.component.audio

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.fullscreen.AudioFullscreenHeroGeometry
import me.meeshy.sdk.model.media.formatMediaDurationMillis
import me.meeshy.ui.R
import me.meeshy.ui.appearance.rememberAvatarRing
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.profile.LocalProfileSheetOpener
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * **Le héros d'une page du plein écran audio** (iOS `AudioFullscreenPage.hero`) : le portrait de l'auteur — sa photo sinon ses
 * initiales, sa décoration de profil équipée (animée, figée sous « Réduire les animations », libérée avec la page), sa
 * présence SERVIE (hors ligne : aucun point) — au cœur du cadran de 72 barres qui porte la progression et se règle du doigt ;
 * les durées en haut de l'anneau. Toucher le portrait ouvre la fiche de l'auteur. Les mesures viennent de
 * [AudioFullscreenHeroGeometry] : la décoration ne chevauche jamais la bande de l'anneau.
 */
@Composable
internal fun AudioFullscreenHero(
    source: AudioFullscreenSource,
    diameter: Float,
    progress: Double,
    isPlaying: Boolean,
    totalMs: Long,
    samples: List<Float>,
    accent: Color,
    onSeek: (Double) -> Unit,
    onNext: (() -> Unit)?,
    onPrevious: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val opener = LocalProfileSheetOpener.current
    val haptics = rememberMeeshyHaptics()
    val nextLabel = stringResource(R.string.feed_carousel_next)
    val previousLabel = stringResource(R.string.feed_carousel_previous)
    val authorColor = remember(source.author.accentColor, accent) { hexColor(source.author.accentColor, accent) }
    val geometry = AudioFullscreenHeroGeometry.of(diameter, rememberAvatarRing(source.authorRing)?.decor)
    val elapsedMs = (progress * totalMs).toLong()
    Box(contentAlignment = Alignment.Center, modifier = modifier) {
        AudioFullscreenDial(
            samples = samples,
            progress = progress,
            isPlaying = isPlaying,
            portraitDiameter = geometry.portraitDiameter.dp,
            accent = accent,
            trackColor = tokens.textPrimary.copy(alpha = if (MeeshyTheme.isDark) 0.22f else 0.18f),
            cursorColor = tokens.textPrimary,
            totalLabel = formatMediaDurationMillis(totalMs).orEmpty(),
            elapsedLabel = formatMediaDurationMillis(elapsedMs).orEmpty(),
            onSeek = onSeek,
        )
        Box(
            Modifier
                .size(geometry.portraitDiameter.dp)
                .clip(CircleShape)
                .clickable(role = Role.Button) {
                    haptics.light()
                    opener.open(source.author)
                }
                .semantics {
                    customActions = listOfNotNull(
                        onNext?.let { next -> CustomAccessibilityAction(nextLabel) { next(); true } },
                        onPrevious?.let { previous -> CustomAccessibilityAction(previousLabel) { previous(); true } },
                    )
                },
        ) {
            MeeshyAvatar(
                name = source.authorName,
                size = geometry.avatarFootprint.dp,
                containerColor = authorColor,
                presence = source.authorPresence,
                imageUrl = source.author.avatarUrl,
                decorRing = source.authorRing,
            )
        }
    }
}
