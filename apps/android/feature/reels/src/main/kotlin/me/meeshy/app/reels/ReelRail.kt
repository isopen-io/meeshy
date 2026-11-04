package me.meeshy.app.reels

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.app.feed.RepostChoiceDialog
import me.meeshy.feature.reels.R
import me.meeshy.sdk.model.PostReactionPaletteState
import me.meeshy.sdk.model.PostReactionPick
import me.meeshy.sdk.model.fullscreen.ChromeRect
import me.meeshy.sdk.model.fullscreen.MediaChromeFraming
import me.meeshy.sdk.model.fullscreen.MediaChromePlacement
import me.meeshy.sdk.model.fullscreen.MediaChromeProbe
import me.meeshy.sdk.model.fullscreen.MediaChromeVeil
import me.meeshy.ui.component.fullscreen.rememberGlyphChromeScheme
import me.meeshy.ui.component.fullscreen.toTone
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.component.fullscreen.FullscreenActionButton
import me.meeshy.ui.component.fullscreen.FullscreenActionStyle
import me.meeshy.ui.component.fullscreen.FullscreenChromeDimens
import me.meeshy.ui.component.fullscreen.icon
import me.meeshy.ui.component.reaction.PostReactionPalette
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.modifier.reactionPaletteTrigger
import me.meeshy.ui.theme.MeeshyPalette
import java.util.Locale

/** Ce que le rail d'un réel déclenche : un seul objet stable, pour que la page ne se recompose pas à chaque rendu de l'écran. */
internal class ReelRailActions(
    val onLike: (String) -> Unit,
    val onReact: (String, PostReactionPick) -> Unit,
    val onComments: (String) -> Unit,
    val onBookmark: (String) -> Unit,
    val onRepost: (String) -> Unit,
    val onSend: (String) -> Unit = {},
    /** « Citer » : le compositeur de citation du réel ; `null` le retire du choix, jamais inerte (#12234). */
    val onQuote: ((String) -> Unit)? = null,
)

/**
 * Le rail d'actions d'un réel (iOS `ReelActionRail`) : j'aime — appui bref ❤️, appui long la
 * palette —, commentaires, favori, republier (le choix « Repartager / Citer » de [RepostChoiceDialog], comme la carte du
 * fil), envoyer (la feuille Meeshy ; « Partager » vit dans le menu « ⋯ »). Le kit plein écran donne à chaque cellule son saut
 * (échelle, ressort rebondissant), son halo coloré à l'état posé et son haptique ; les compteurs
 * sont abrégés comme sur iOS.
 */
@Composable
internal fun ReelRail(
    reel: ReelPresentation,
    quickEmojis: List<String>,
    actions: ReelRailActions,
    modifier: Modifier = Modifier,
) {
    val locale = Locale.getDefault()
    val haptics = rememberMeeshyHaptics()
    // Les glyphes nus prennent la teinte que la luminance du réel SOUS le rail commande (lisibilité AA sur image claire).
    val probe = remember(reel.backdrop) { reel.backdrop?.let { MediaChromeProbe(it, RAIL_PLACEMENT) } }
    val style = FullscreenActionStyle.Floating(rememberGlyphChromeScheme(probe).toTone())
    var palette by remember(reel.id) { mutableStateOf(PostReactionPaletteState()) }
    var choosingRepost by remember(reel.id) { mutableStateOf(false) }
    Column(
        modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(FullscreenChromeDimens.railSpacing),
    ) {
        Box {
            FullscreenActionButton(
                icon = (if (reel.isLiked) FullscreenChromeSymbol.LikeActive else FullscreenChromeSymbol.Like).icon,
                label = stringResource(if (reel.isLiked) R.string.reels_unlike else R.string.reels_like),
                onClick = { haptics.light(); actions.onLike(reel.id) },
                style = style,
                hint = stringResource(R.string.reels_like),
                caption = ReelRailCaption.of(reel.likeCount, stringResource(R.string.reels_like), locale),
                accessibilityValue = reel.likeCount.takeIf { it > 0 }?.toString(),
                isActive = reel.isLiked,
                activeTint = MeeshyPalette.Error,
                outlineTint = if (reel.isLiked) MeeshyPalette.Error else null,
                handlesTapViaGesture = true,
                modifier = Modifier.reactionPaletteTrigger(onOpen = { palette = palette.opened() }),
            )
            PostReactionPalette(
                isOpen = palette.isOpen,
                onDismiss = { palette = palette.dismissed() },
                onPick = { emoji ->
                    val (next, pick) = palette.picked(emoji)
                    palette = next
                    pick?.let { actions.onReact(reel.id, it) }
                },
                emojis = quickEmojis,
            )
        }
        FullscreenActionButton(
            icon = FullscreenChromeSymbol.Comments.icon,
            label = stringResource(R.string.reels_action_comment),
            onClick = { haptics.light(); actions.onComments(reel.id) },
            style = style,
            hint = stringResource(R.string.reels_action_comment),
            caption = ReelRailCaption.of(reel.commentCount, stringResource(R.string.reels_action_comment), locale),
            accessibilityValue = reel.commentCount.takeIf { it > 0 }?.toString(),
        )
        FullscreenActionButton(
            icon = if (reel.isBookmarked) MeeshyIcons.BookmarkFilled else MeeshyIcons.Bookmark,
            label = stringResource(if (reel.isBookmarked) R.string.reels_unbookmark else R.string.reels_bookmark),
            onClick = { haptics.medium(); actions.onBookmark(reel.id) },
            style = style,
            hint = stringResource(R.string.reels_bookmark),
            caption = ReelRailCaption.of(reel.bookmarkCount, stringResource(R.string.reels_bookmark), locale),
            accessibilityValue = reel.bookmarkCount.takeIf { it > 0 }?.toString(),
            isActive = reel.isBookmarked,
            activeTint = MeeshyPalette.Warning,
            outlineTint = if (reel.isBookmarked) MeeshyPalette.Warning else null,
        )
        FullscreenActionButton(
            icon = FullscreenChromeSymbol.Repost.icon,
            label = stringResource(R.string.reels_action_repost),
            onClick = { haptics.light(); choosingRepost = true },
            style = style,
            hint = stringResource(R.string.reels_action_repost),
            caption = ReelRailCaption.of(reel.repostCount, stringResource(R.string.reels_action_repost), locale),
            accessibilityValue = reel.repostCount.takeIf { it > 0 }?.toString(),
            isActive = reel.isReposted,
            activeTint = MeeshyPalette.Success,
            outlineTint = if (reel.isReposted) MeeshyPalette.Success else null,
        )
        FullscreenActionButton(
            icon = MeeshyIcons.Send,
            label = stringResource(R.string.reels_action_send),
            onClick = { haptics.light(); actions.onSend(reel.id) },
            style = style,
            caption = ReelRailCaption.of(reel.shareCount, stringResource(R.string.reels_action_send), locale),
            accessibilityValue = reel.shareCount.takeIf { it > 0 }?.toString(),
        )
    }
    if (choosingRepost) {
        RepostChoiceDialog(
            onRepost = { haptics.success(); actions.onRepost(reel.id) },
            onQuote = actions.onQuote?.let { quote -> { quote(reel.id) } },
            onDismiss = { choosingRepost = false },
        )
    }
}

/** Sous chaque bouton du rail, comme au rail de la story : le compte abrégé quand il y en a un, sinon le nom de l'action. */
internal object ReelRailCaption {
    fun of(count: Int, label: String, locale: Locale): String =
        count.takeIf { it > 0 }?.let { CompactCountFormat.text(it, locale) } ?: label
}

/** Le rail : colonne de droite de la page, sous le voile bas du lecteur (iOS `MediaChromeStage.reelPlayer`). */
private val RAIL_PLACEMENT: MediaChromePlacement =
    MediaChromePlacement.of(ChromeRect(0.80, 0.40, 0.98, 0.90), 9.0 / 19.5, MediaChromeFraming.Fit, MediaChromeVeil.ReelPlayer)
