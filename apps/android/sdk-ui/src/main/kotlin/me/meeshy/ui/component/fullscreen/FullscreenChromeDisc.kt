package me.meeshy.ui.component.fullscreen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.SaveAlt
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.fullscreen.FullscreenChromeMetrics
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.DarkMeeshyTokens
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** La teinte d'un bouton posé sur un média. */
public enum class FullscreenChromeTone {
    /**
     * Glyphe blanc sur verre sombre : lisible sur n'importe quelle image, sans mesure.
     * Le défaut.
     */
    OnMedia,

    /**
     * Glyphe et verre qui suivent le thème de l'environnement. Pour l'hôte qui pose ce thème
     * d'après la luminance du média — sans lui, le glyphe serait indigo sur une image sombre
     * en thème clair.
     */
    Adaptive,
}

/**
 * Les cotes du chrome en dp, lues dans la table unique de `:core:model`
 * ([FullscreenChromeMetrics]) : aucun visualiseur ne pose sa propre taille de croix.
 */
public object FullscreenChromeDimens {
    public val discDiameter: Dp = FullscreenChromeMetrics.DISC_DIAMETER_DP.dp
    public val tapTarget: Dp = FullscreenChromeMetrics.TAP_TARGET_DP.dp
    public val discGlyph: Dp = FullscreenChromeMetrics.DISC_GLYPH_SIZE_DP.dp
    public val floatingGlyph: Dp = FullscreenChromeMetrics.FLOATING_GLYPH_SIZE_DP.dp
    public val floatingCellWidth: Dp = FullscreenChromeMetrics.FLOATING_CELL_WIDTH_DP.dp
    public val railSpacing: Dp = FullscreenChromeMetrics.RAIL_SPACING_DP.dp
    public val edgeInset: Dp = FullscreenChromeMetrics.EDGE_INSET_DP.dp
    public val topInset: Dp = FullscreenChromeMetrics.TOP_INSET_DP.dp
    public val barSpacing: Dp = FullscreenChromeMetrics.BAR_SPACING_DP.dp
    public val dismissDragThreshold: Dp = FullscreenChromeMetrics.DISMISS_DRAG_THRESHOLD_DP.dp
    public val reactionStripLeadingOffset: Dp = FullscreenChromeMetrics.REACTION_STRIP_LEADING_OFFSET_DP.dp
    public val outlineGlowRadius: Dp = FullscreenChromeMetrics.OUTLINE_GLOW_RADIUS_DP.dp

    /**
     * La marge latérale d'une barre haute : le DISQUE visible tombe sur la gouttière du chrome,
     * sa cible déborde vers le bord.
     */
    public val topBarHorizontalPadding: Dp =
        (FullscreenChromeMetrics.EDGE_INSET_DP - (FullscreenChromeMetrics.TAP_TARGET_DP - FullscreenChromeMetrics.DISC_DIAMETER_DP) / 2).dp
}

/** Un verbe, un glyphe, partout : le symbole Material de chaque verbe du chrome. */
public val FullscreenChromeSymbol.icon: ImageVector
    get() = when (this) {
        FullscreenChromeSymbol.Close -> Icons.Filled.Close
        FullscreenChromeSymbol.Back -> Icons.AutoMirrored.Filled.ArrowBack
        FullscreenChromeSymbol.More -> Icons.Filled.MoreHoriz
        FullscreenChromeSymbol.React -> Icons.Filled.EmojiEmotions
        FullscreenChromeSymbol.ReactBadge -> Icons.Filled.Add
        FullscreenChromeSymbol.Like -> Icons.Filled.FavoriteBorder
        FullscreenChromeSymbol.LikeActive -> Icons.Filled.Favorite
        FullscreenChromeSymbol.Reply -> Icons.AutoMirrored.Filled.Reply
        FullscreenChromeSymbol.Comments -> Icons.AutoMirrored.Filled.Chat
        FullscreenChromeSymbol.Share -> Icons.Filled.Share
        FullscreenChromeSymbol.Save -> Icons.Filled.SaveAlt
        FullscreenChromeSymbol.Saved -> Icons.Filled.Check
        FullscreenChromeSymbol.Repost -> Icons.Filled.Repeat
        FullscreenChromeSymbol.Compose -> Icons.Filled.AutoAwesome
        FullscreenChromeSymbol.AudioOutput -> Icons.Filled.Cast
        FullscreenChromeSymbol.Play -> Icons.Filled.PlayArrow
        FullscreenChromeSymbol.Pause -> Icons.Filled.Pause
    }

/** L'encre d'un glyphe du chrome : la teinte d'un état ACTIF d'abord, la tonalité sinon. */
@Composable
internal fun fullscreenChromeInk(tone: FullscreenChromeTone, activeTint: Color?): Color =
    activeTint ?: when (tone) {
        FullscreenChromeTone.OnMedia -> MeeshyPalette.White
        FullscreenChromeTone.Adaptive -> MeeshyTheme.tokens.textPrimary
    }

/**
 * Le verre d'un disque du chrome, par [MeeshyGlassSurface]. Sur un média ([FullscreenChromeTone.OnMedia])
 * il est toujours sombre — quel que soit le thème de l'application — puis teinté de noir : un glyphe
 * blanc y reste lisible sur n'importe quelle image.
 */
@Composable
internal fun FullscreenGlassBackdrop(tone: FullscreenChromeTone, modifier: Modifier = Modifier) {
    when (tone) {
        FullscreenChromeTone.OnMedia -> CompositionLocalProvider(LocalMeeshyTokens provides DarkMeeshyTokens) {
            MeeshyGlassSurface(modifier = modifier, shape = CircleShape) {
                Box(Modifier.fillMaxSize().background(MeeshyPalette.Ink.copy(alpha = ON_MEDIA_TINT_ALPHA)))
            }
        }

        FullscreenChromeTone.Adaptive -> MeeshyGlassSurface(modifier = modifier, shape = CircleShape) {}
    }
}

private const val ON_MEDIA_TINT_ALPHA: Float = 0.35f

/**
 * Le disque du chrome plein écran — ce qu'on VOIT. Un glyphe figé (en dp : la taille de police
 * ne le grandit pas) dans un disque de verre de [FullscreenChromeDimens.discDiameter], entouré
 * d'une cible pleine de [FullscreenChromeDimens.tapTarget]. Sert de libellé à un bouton
 * ([FullscreenChromeButton]) comme à un menu.
 */
@Composable
public fun FullscreenChromeDisc(
    icon: ImageVector,
    modifier: Modifier = Modifier,
    badge: ImageVector? = null,
    tone: FullscreenChromeTone = FullscreenChromeTone.OnMedia,
    activeTint: Color? = null,
) {
    val ink = fullscreenChromeInk(tone, activeTint)
    Box(modifier.size(FullscreenChromeDimens.tapTarget), contentAlignment = Alignment.Center) {
        Box(Modifier.size(FullscreenChromeDimens.discDiameter), contentAlignment = Alignment.Center) {
            FullscreenGlassBackdrop(tone = tone, modifier = Modifier.fillMaxSize())
            Box(Modifier.size(FullscreenChromeDimens.discGlyph)) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = ink,
                    modifier = Modifier.fillMaxSize(),
                )
                if (badge != null) {
                    Icon(
                        imageVector = badge,
                        contentDescription = null,
                        tint = ink,
                        modifier = Modifier
                            .size(BADGE_SIZE)
                            .align(Alignment.TopEnd)
                            .offset(x = BADGE_OFFSET_X, y = BADGE_OFFSET_Y),
                    )
                }
            }
        }
    }
}

private val BADGE_SIZE: Dp = 10.dp
private val BADGE_OFFSET_X: Dp = 6.dp
private val BADGE_OFFSET_Y: Dp = (-4).dp
