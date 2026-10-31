package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Les feuilles que le compositeur fait monter (#13838) : une seule à la fois. Cinq servent l'élément sélectionné
 * (#13836) — son Modifier (média, son), son Temps, l'échange d'un sticker, le lieu qu'une pastille désigne (#13902), les
 * sources de « Remplacer » du fond et sa description (#13973) — et n'existent pas sans lui.
 */
internal enum class StoryComposerSheet {
    STICKERS, SOUND, AUDIENCE, OBJECT_EDIT, OBJECT_TIME, STICKER_SWAP, MENTION, HASHTAGS, PLACE, PLACE_REPOINT, BACKGROUND_SOURCE, BACKGROUND_DESCRIPTION;

    val servesSelection: Boolean
        get() = this == OBJECT_EDIT || this == OBJECT_TIME || this == STICKER_SWAP || this == PLACE_REPOINT || this == BACKGROUND_SOURCE ||
            this == BACKGROUND_DESCRIPTION

    /** Les feuilles qui se lisent sur la scène, sombres comme elle : le son et ce qui nomme la publication. */
    val isDarkOnScene: Boolean get() = this == SOUND || this == MENTION || this == HASHTAGS || this == PLACE || this == PLACE_REPOINT
}

/** La feuille [open] (aucune : `null`), ce qui la referme, ce qui en ouvre une, et ce qu'elle montre. */
internal class StorySheetSlot(
    val open: StoryComposerSheet?,
    val onDismiss: () -> Unit,
    val onOpen: (StoryComposerSheet) -> Unit = {},
    val content: @Composable (StoryComposerSheet) -> Unit,
)

/**
 * Une feuille du compositeur ancrée en bas (#13838) — sans voile : elle ne grise pas la scène et ne la couvre pas,
 * [StorySceneFirstLayout] mesure sa hauteur et réduit la scène, entière, au-dessus d'elle. [fill] la pose à sa hauteur
 * maximale (une grille, une liste qui défile) ; sinon elle prend la hauteur de son contenu.
 */
@Composable
internal fun ComposerAnchoredSheet(fill: Boolean, content: @Composable () -> Unit) {
    Surface(
        color = MeeshyTheme.tokens.backgroundPrimary,
        shape = RoundedCornerShape(topStart = MeeshyRadius.xl, topEnd = MeeshyRadius.xl),
        modifier = Modifier
            .fillMaxWidth()
            .then(if (fill) Modifier.fillMaxHeight() else Modifier)
            .semantics { isTraversalGroup = true },
    ) {
        Box(Modifier.fillMaxWidth()) { content() }
    }
}
