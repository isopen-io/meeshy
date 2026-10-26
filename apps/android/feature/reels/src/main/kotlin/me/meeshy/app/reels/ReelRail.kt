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
import me.meeshy.feature.reels.R
import me.meeshy.sdk.model.PostReactionPaletteState
import me.meeshy.sdk.model.PostReactionPick
import me.meeshy.sdk.model.format.CompactCountFormat
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.component.fullscreen.FullscreenActionButton
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
)

/**
 * Le rail d'actions d'un réel (iOS `ReelActionRail`) : j'aime — appui bref ❤️, appui long la
 * palette —, commentaires, favori, republier. Le kit plein écran donne à chaque cellule son saut
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
    var palette by remember(reel.id) { mutableStateOf(PostReactionPaletteState()) }
    Column(
        modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(FullscreenChromeDimens.railSpacing),
    ) {
        Box {
            FullscreenActionButton(
                icon = (if (reel.isLiked) FullscreenChromeSymbol.LikeActive else FullscreenChromeSymbol.Like).icon,
                label = stringResource(R.string.reels_like),
                onClick = { actions.onLike(reel.id) },
                caption = count(reel.likeCount, locale),
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
            label = stringResource(R.string.reels_comments),
            onClick = { actions.onComments(reel.id) },
            caption = count(reel.commentCount, locale),
            accessibilityValue = reel.commentCount.takeIf { it > 0 }?.toString(),
        )
        FullscreenActionButton(
            icon = if (reel.isBookmarked) MeeshyIcons.BookmarkFilled else MeeshyIcons.Bookmark,
            label = stringResource(if (reel.isBookmarked) R.string.reels_unbookmark else R.string.reels_bookmark),
            onClick = { actions.onBookmark(reel.id) },
            caption = count(reel.bookmarkCount, locale),
            accessibilityValue = reel.bookmarkCount.takeIf { it > 0 }?.toString(),
            isActive = reel.isBookmarked,
            activeTint = MeeshyPalette.Warning,
            outlineTint = if (reel.isBookmarked) MeeshyPalette.Warning else null,
        )
        FullscreenActionButton(
            icon = FullscreenChromeSymbol.Repost.icon,
            label = stringResource(R.string.reels_repost),
            onClick = { actions.onRepost(reel.id) },
            caption = count(reel.repostCount, locale),
            accessibilityValue = reel.repostCount.takeIf { it > 0 }?.toString(),
        )
    }
}

private fun count(value: Int, locale: Locale): String? =
    value.takeIf { it > 0 }?.let { CompactCountFormat.text(it, locale) }
