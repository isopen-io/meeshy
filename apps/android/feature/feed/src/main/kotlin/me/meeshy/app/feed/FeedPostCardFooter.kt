package me.meeshy.app.feed

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Pied de la carte : l'espacement de clôture puis la rangée d'actions (aimer, commenter,
 * reposter, enregistrer). Emplacement distinct pour que chaque lot suivant possède son fichier.
 */
@Composable
internal fun FeedPostCardFooter(
    post: FeedPostPresentation,
    onLike: () -> Unit,
    onBookmark: () -> Unit,
    onComments: () -> Unit,
    onRepost: () -> Unit,
    onQuote: () -> Unit,
) {
    Spacer(Modifier.height(MeeshySpacing.sm))
    PostStatsRow(
        post = post,
        onLike = onLike,
        onBookmark = onBookmark,
        onComments = onComments,
        onRepost = onRepost,
        onQuote = onQuote,
    )
}
