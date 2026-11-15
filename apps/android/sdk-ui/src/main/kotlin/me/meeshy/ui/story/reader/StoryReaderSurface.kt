package me.meeshy.ui.story.reader

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.Dp
import me.meeshy.ui.theme.MeeshyRadius

/** Le rayon de la carte 9:16, identique sur les quatre surfaces (fil, détail, réel, viewer). */
public val StoryReaderCardRadius: Dp = MeeshyRadius.xl

/** Le contexte de lecture de la surface la plus proche ; les couches du contenu le lisent sans paramètre. */
public val LocalStoryReaderContext = staticCompositionLocalOf { StoryReaderContext.Empty }

/**
 * La surface de lecture RÉUTILISABLE (iOS `StoryReaderRepresentable`) : une carte 9:16 arrondie, au sol dérivé du
 * ThumbHash ([floor], jamais du noir pur), qui publie son [context] à ses couches. Montable depuis le fil, le repost
 * ou l'aperçu de post-story sans dépendre de `:feature:stories` : le contenu de la scène est un slot.
 *
 * [onDisplayed] part UNE fois, à la première mise en page effective — la minuterie d'une slide démarre là, à
 * l'affichage, et non à la composition.
 */
@Composable
public fun StoryReaderSurface(
    context: StoryReaderContext,
    floor: Color,
    modifier: Modifier = Modifier,
    cornerRadius: Dp = StoryReaderCardRadius,
    onDisplayed: () -> Unit = {},
    content: @Composable BoxScope.() -> Unit,
) {
    var displayed by remember { mutableStateOf(false) }
    CompositionLocalProvider(LocalStoryReaderContext provides context) {
        Box(
            modifier
                .clip(RoundedCornerShape(cornerRadius))
                .background(floor)
                .onGloballyPositioned {
                    if (!displayed) {
                        displayed = true
                        onDisplayed()
                    }
                },
            content = content,
        )
    }
}
