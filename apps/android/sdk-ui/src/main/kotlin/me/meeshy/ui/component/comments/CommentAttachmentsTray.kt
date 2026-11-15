package me.meeshy.ui.component.comments

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.CommentPieceKind
import me.meeshy.ui.component.composer.PieceRemoveBadge
import me.meeshy.ui.component.composer.PieceRemoveBadgeGeometry
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Une tuile de la zone : sa pièce ([id], [kind], [name]) et si son fichier se lit encore ([isLoading]). */
@Immutable
public data class CommentTrayTile(
    val id: String,
    val kind: CommentPieceKind,
    val name: String,
    val isLoading: Boolean = false,
)

/** Les libellés d'accessibilité de la zone, localisés par l'hôte : l'action de la tuile, son retrait et l'attente. */
@Immutable
public data class CommentTrayLabels(val edit: String, val remove: String, val preparing: String)

/**
 * **LA ZONE DES PIÈCES D'UN COMMENTAIRE**, au-dessus du champ (iOS `CommentAttachmentsTray`, mêmes tuiles que le
 * message) : une vignette par pièce, toucher la tuile — son centre compris — dit « Éditer » ([onEdit]), la croix à
 * cheval sur son coin la retire ([onRemove]), une pièce dont le fichier se lit encore porte son indicateur et le dit à
 * TalkBack. [thumbnail] peint la vignette de l'hôte (bitmap décodé, symbole de nature) : la zone ne lit aucun fichier.
 */
@Composable
public fun CommentAttachmentsTray(
    tiles: List<CommentTrayTile>,
    labels: CommentTrayLabels,
    onEdit: (CommentTrayTile) -> Unit,
    onRemove: (String) -> Unit,
    modifier: Modifier = Modifier,
    thumbnail: @Composable (CommentTrayTile) -> Unit,
) {
    if (tiles.isEmpty()) return
    Row(
        modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(
                start = MeeshySpacing.md,
                end = PieceRemoveBadgeGeometry.ReachEnd,
                top = PieceRemoveBadgeGeometry.ReachTop,
                bottom = MeeshySpacing.xs,
            ),
        horizontalArrangement = Arrangement.spacedBy(PieceRemoveBadgeGeometry.ReachEnd),
    ) {
        tiles.forEach { tile ->
            key(tile.id) {
                Box(Modifier.size(TILE)) {
                    Box(
                        Modifier
                            .size(TILE)
                            .clip(RoundedCornerShape(MeeshyRadius.md))
                            .background(MeeshyTheme.tokens.inputBackground)
                            .clickable(onClickLabel = labels.edit, role = Role.Button) { onEdit(tile) }
                            .semantics {
                                contentDescription = labels.edit
                                if (tile.isLoading) stateDescription = labels.preparing
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        thumbnail(tile)
                        if (tile.isLoading) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    }
                    PieceRemoveBadge(
                        label = labels.remove,
                        onClick = { onRemove(tile.id) },
                        discColor = Color.Black.copy(alpha = 0.6f),
                        glyphColor = MeeshyPalette.White,
                        modifier = Modifier.align(Alignment.TopEnd),
                    )
                }
            }
        }
    }
}

private val TILE = 56.dp
