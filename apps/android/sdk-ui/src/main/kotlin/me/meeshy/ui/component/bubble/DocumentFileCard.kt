package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.fileviewer.DocumentKindResolver
import me.meeshy.ui.R
import me.meeshy.ui.attachment.AttachmentDisplay
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** La largeur d'une carte de document : celle de la grille média, pour que les pièces s'alignent dans la bulle. */
public val DocumentCardWidth: Dp = 252.dp

/**
 * La carte d'un document du fil (miroir de `DocumentViewerView.richCard`, iOS) : une pastille colorée par famille
 * (PDF distinct de Word), le nom en semibold — ou le libellé du type —, puis type, taille et « N pages » quand ils sont
 * connus. [trailing] porte l'état du transfert (télécharger, progression, prêt).
 */
@Composable
internal fun DocumentFileCard(
    file: BubbleFile,
    onColor: Color,
    modifier: Modifier = Modifier,
    trailing: @Composable () -> Unit = {},
) {
    val display = remember(file.mimeType, file.name) {
        AttachmentDisplay.of(DocumentKindResolver.kindOf(file.mimeType, file.name))
    }
    val typeLabel = stringResource(display.shortLabel)
    val size = file.sizeBytes?.takeIf { it > 0 }?.let { formatFileSize(it) }
    val pages = file.pageCount?.takeIf { it > 0 }?.let { stringResource(R.string.document_card_pages, it) }
    Row(
        modifier = modifier.width(DocumentCardWidth),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        DocumentTile(display, tileSize = 42.dp)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = file.name?.takeIf { it.isNotBlank() } ?: typeLabel,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = onColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = listOfNotNull(typeLabel, size, pages).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall,
                color = onColor.copy(alpha = 0.7f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        trailing()
    }
}

/**
 * La carte compacte d'un document en cours de composition : pastille, nom et croix « Supprimer la pièce jointe »
 * (cible de 48 dp). Sans [onDelete], aucune croix.
 */
@Composable
public fun DocumentComposerCard(
    name: String?,
    mimeType: String?,
    onColor: Color,
    modifier: Modifier = Modifier,
    onDelete: (() -> Unit)? = null,
) {
    val display = remember(mimeType, name) { AttachmentDisplay.of(DocumentKindResolver.kindOf(mimeType, name)) }
    val typeLabel = stringResource(display.shortLabel)
    val deleteLabel = stringResource(R.string.document_delete_attachment)
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        DocumentTile(display, tileSize = 52.dp)
        Text(
            text = name?.takeIf { it.isNotBlank() } ?: typeLabel,
            style = MaterialTheme.typography.labelMedium,
            color = onColor.copy(alpha = 0.7f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (onDelete != null) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .clickable(role = Role.Button, onClick = onDelete)
                    .semantics { contentDescription = deleteLabel },
                contentAlignment = Alignment.Center,
            ) { Icon(MeeshyIcons.Close, null, tint = onColor, modifier = Modifier.size(18.dp)) }
        }
    }
}

@Composable
private fun DocumentTile(display: AttachmentDisplay, tileSize: Dp) {
    Box(
        modifier = Modifier
            .size(tileSize)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(Brush.linearGradient(listOf(display.tint, display.tint.copy(alpha = 0.7f)))),
        contentAlignment = Alignment.Center,
    ) { Icon(display.icon, null, tint = Color.White, modifier = Modifier.size(tileSize / 2)) }
}
