package me.meeshy.ui.component.comments

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Le cadre d'UNE ligne de commentaire (iOS `CommentRowView`) : l'avatar à gauche, le corps à droite. Une ligne optimiste
 * est estompée tant que le serveur ne l'a pas confirmée. Le contenu (texte du Prisme, cœur, réponse) est fourni par l'hôte.
 */
@Composable
public fun CommentRowFrame(
    isPending: Boolean,
    avatar: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    body: @Composable ColumnScope.() -> Unit,
) {
    Row(modifier = modifier.fillMaxWidth().alpha(if (isPending) PENDING_ALPHA else 1f)) {
        avatar()
        Spacer(Modifier.width(MeeshySpacing.sm))
        Column(modifier = Modifier.weight(1f), content = body)
    }
}

private const val PENDING_ALPHA = 0.5f
