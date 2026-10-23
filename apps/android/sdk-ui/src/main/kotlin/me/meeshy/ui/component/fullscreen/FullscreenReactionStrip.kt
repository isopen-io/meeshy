package me.meeshy.ui.component.fullscreen

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.R
import me.meeshy.ui.component.EmojiQuickStrip
import me.meeshy.ui.component.ReactionStripChrome
import me.meeshy.ui.theme.DarkMeeshyTokens
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La rangée d'émojis du plein écran — une forme pour toutes les surfaces. La rangée rapide du
 * chat ([EmojiQuickStrip], jamais redessinée ici), défilante, en thème sombre : le média EST son
 * fond. Les paramètres de survol ([highlightedIndex], [onTileBounds]) passent tels quels pour la
 * surface qui les pilote (la story, glisser d'un appui long sur une tuile).
 *
 * [accentColor] est le contour des émojis déjà posés ; la couleur de contexte (conversation,
 * story) arrive en paramètre, jamais calculée ici.
 */
@Composable
public fun FullscreenReactionStrip(
    onReact: (String) -> Unit,
    modifier: Modifier = Modifier,
    quickEmojis: List<String> = EmojiCatalog.defaultQuickReactions,
    ownReactions: Set<String> = emptySet(),
    accentColor: Color = MeeshyPalette.Indigo400,
    onExpandFullPicker: (() -> Unit)? = null,
    highlightedIndex: Int? = null,
    onTileBounds: ((Int, Rect) -> Unit)? = null,
    chrome: ReactionStripChrome = ReactionStripChrome.None,
) {
    CompositionLocalProvider(LocalMeeshyTokens provides DarkMeeshyTokens) {
        EmojiQuickStrip(
            emojis = quickEmojis,
            onReact = onReact,
            modifier = modifier,
            accentColor = accentColor,
            ownReactions = ownReactions,
            onExpand = onExpandFullPicker,
            highlightedIndex = highlightedIndex,
            onTileBounds = onTileBounds,
            chrome = chrome,
        )
    }
}

/**
 * « Réagir » — l'émoji et son « + ». Le tap OUVRE la rangée ; il ne pose jamais d'émoji à
 * l'aveugle. Ouverte ([isOpen]), l'action se teinte indigo.
 *
 * La story garde son CŒUR (« le cœur et non réaction, car on ne voit pas ») : elle passe
 * [icon] = le cœur plein, sans [badge] ni teinte — le contour ([outlineTint]) dit l'état, autour
 * d'un glyphe qui reste lisible. Les autres surfaces gardent l'émoji et son « + ».
 */
@Composable
public fun FullscreenReactAction(
    isOpen: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    label: String = stringResource(R.string.fullscreen_react),
    hint: String? = null,
    style: FullscreenActionStyle = FullscreenActionStyle.Floating(),
    caption: String? = null,
    accessibilityValue: String? = null,
    icon: ImageVector = FullscreenChromeSymbol.React.icon,
    badge: ImageVector? = FullscreenChromeSymbol.ReactBadge.icon,
    activeTint: Color? = MeeshyPalette.Indigo400,
    outlineTint: Color? = null,
    handlesTapViaGesture: Boolean = false,
) {
    FullscreenActionButton(
        icon = icon,
        label = label,
        onClick = onClick,
        modifier = modifier,
        hint = hint,
        style = style,
        caption = caption,
        accessibilityValue = accessibilityValue,
        badge = badge,
        isActive = isOpen,
        activeTint = activeTint,
        outlineTint = outlineTint,
        handlesTapViaGesture = handlesTapViaGesture,
    )
}

/**
 * « Répondre » — ouvre la barre de saisie qui CITE le média, au bas de l'écran, sans quitter le
 * visualiseur. Ouverte ([isOpen]), l'action se teinte indigo.
 */
@Composable
public fun FullscreenReplyAction(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isOpen: Boolean = false,
    label: String = stringResource(R.string.fullscreen_reply),
    hint: String? = null,
    style: FullscreenActionStyle = FullscreenActionStyle.Floating(),
    caption: String? = null,
    accessibilityValue: String? = null,
) {
    FullscreenActionButton(
        icon = FullscreenChromeSymbol.Reply.icon,
        label = label,
        onClick = onClick,
        modifier = modifier,
        hint = hint,
        style = style,
        caption = caption,
        accessibilityValue = accessibilityValue,
        isActive = isOpen,
        activeTint = MeeshyPalette.Indigo400,
    )
}
