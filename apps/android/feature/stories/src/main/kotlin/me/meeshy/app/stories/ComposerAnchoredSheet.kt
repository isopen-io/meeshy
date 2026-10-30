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

/** Les feuilles que le compositeur fait monter (#13838) : une seule à la fois. */
internal enum class StoryComposerSheet { STICKERS, SOUND, AUDIENCE }

/** La feuille [open] (aucune : `null`), ce qui la referme, et ce qu'elle montre. */
internal class StorySheetSlot(
    val open: StoryComposerSheet?,
    val onDismiss: () -> Unit,
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
