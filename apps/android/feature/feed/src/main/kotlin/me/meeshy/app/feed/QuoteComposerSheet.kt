package me.meeshy.app.feed

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le compositeur de citation : reposter un post accompagne d'un commentaire. Rendu
 * bete de [QuoteComposerState] — la card source (auteur + apercu) au-dessus d'un champ
 * de commentaire libre. Parite iOS (feuille de composition avec `quotePost`), en dialog
 * pour rester coherent avec [ReportPostDialog].
 */
@Composable
internal fun QuoteComposerSheet(
    composer: QuoteComposerState,
    onTextChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.feed_quote_title)) },
        text = {
            Column {
                OutlinedTextField(
                    value = composer.text,
                    onValueChange = onTextChange,
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text(stringResource(R.string.feed_quote_hint)) },
                )
                Spacer(Modifier.height(MeeshySpacing.md))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(MeeshyRadius.md))
                        .border(
                            1.dp,
                            MeeshyTheme.tokens.inputBorder,
                            RoundedCornerShape(MeeshyRadius.md),
                        )
                        .padding(MeeshySpacing.md),
                ) {
                    Text(
                        text = composer.sourceAuthorName ?: unknownAuthor,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                    if (composer.sourceContentPreview.isNotBlank()) {
                        Text(
                            text = composer.sourceContentPreview,
                            style = MaterialTheme.typography.bodySmall,
                            color = MeeshyTheme.tokens.textSecondary,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onSubmit) {
                Text(stringResource(R.string.feed_quote_submit))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.feed_quote_cancel))
            }
        },
    )
}
