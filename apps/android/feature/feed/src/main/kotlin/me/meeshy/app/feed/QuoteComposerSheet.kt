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
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.displayContent
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * State of the open quote-repost composer: the source post being quoted (author +
 * a content preview so the sheet renders the embed) and the commentary draft.
 * [postId] is the CARD the reader touched — [RepostCommand] resolves the root and the format from it.
 */
data class QuoteComposerState(
    val postId: String,
    val sourceAuthorName: String?,
    val sourceContentPreview: String,
    val text: String = "",
) {
    companion object {
        /**
         * La carte de la publication citée — sa RACINE quand elle republie (iOS `ComposerQuotedPublication(quoting:)`) :
         * c'est elle que [RepostCommand] vise, donc elle que le fil montrera sous le commentaire. Montrer la carte
         * intermédiaire citerait une chose et en publierait une autre.
         *
         * Son texte descend le Prisme du lecteur ([preferences], `null` = session sans préférences), comme la carte au-dessus
         * (#16001) : la carte sert la traduction, l'aperçu ne sert jamais l'original à sa place.
         */
        fun quoting(post: ApiPost, preferences: LanguageResolver.ContentLanguagePreferences?): QuoteComposerState {
            val reader = preferences ?: EmptyContentPreferences
            return quoting(post.id, post.author.quotedName(), post.displayContent(reader), post.repostOf, reader)
        }

        /**
         * La même règle pour une surface qui a déjà résolu le nom et le texte SERVI de la carte (le lecteur de réels) : la
         * racine d'une republication, elle, descend encore le Prisme de [preferences].
         */
        fun quoting(
            cardId: String,
            cardAuthorName: String?,
            cardContent: String?,
            repostOf: ApiRepostOf?,
            preferences: LanguageResolver.ContentLanguagePreferences?,
        ): QuoteComposerState =
            QuoteComposerState(
                postId = cardId,
                sourceAuthorName = if (repostOf != null) repostOf.author.quotedName() else cardAuthorName?.takeIf { it.isNotBlank() },
                sourceContentPreview = (
                    if (repostOf != null) repostOf.displayContent(preferences ?: EmptyContentPreferences) else cardContent
                    ).orEmpty().trim(),
            )

        private fun ApiAuthor?.quotedName(): String? =
            listOfNotNull(this?.displayName, this?.username).firstOrNull { it.isNotBlank() }
    }
}

/**
 * Le compositeur de citation : reposter un post accompagne d'un commentaire. Rendu
 * bete de [QuoteComposerState] — la card source (auteur + apercu) au-dessus d'un champ
 * de commentaire libre. Parite iOS (feuille de composition avec `quotePost`), en dialog
 * pour rester coherent avec [ReportPostDialog].
 */
@Composable
fun QuoteComposerSheet(
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
