package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
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
import me.meeshy.ui.component.presentation.MeeshyCoverDialog
import me.meeshy.ui.icons.MeeshyIcons
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
 * Le compositeur de citation : reposter un post accompagné d'un commentaire. Rendu bête de [QuoteComposerState] — le
 * champ de commentaire au-dessus de la carte source (auteur + aperçu). Il monte en PLEIN ÉCRAN, comme
 * `QuoteComposerCover` sur iOS (`.fullScreenCover`) : la croix, Republier et le retour système jouent la descente,
 * puis rendent la main une seule fois — [onSubmit] pour Republier, [onDismiss] sinon.
 */
@Composable
fun QuoteComposerSheet(
    composer: QuoteComposerState,
    onTextChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
) {
    var outcome by remember { mutableStateOf<QuoteOutcome?>(null) }
    MeeshyCoverDialog(onDismissRequest = { if (outcome == QuoteOutcome.SUBMIT) onSubmit() else onDismiss() }) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MeeshyTheme.tokens.backgroundPrimary)
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .imePadding(),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { if (outcome == null) outcome = QuoteOutcome.DISMISS; dismiss() }) {
                    Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.status_composer_close), tint = MeeshyTheme.tokens.textPrimary)
                }
                Text(
                    text = stringResource(R.string.feed_quote_title),
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                TextButton(onClick = { if (outcome == null) outcome = QuoteOutcome.SUBMIT; dismiss() }) {
                    Text(stringResource(R.string.feed_quote_submit), fontWeight = FontWeight.SemiBold)
                }
            }
            QuoteComposerBody(composer = composer, onTextChange = onTextChange)
        }
    }
}

/** Le premier geste qui ferme le plein écran décide de ce qu'il rend : Republier, ou rien. */
private enum class QuoteOutcome { SUBMIT, DISMISS }

@Composable
private fun QuoteComposerBody(composer: QuoteComposerState, onTextChange: (String) -> Unit) {
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(MeeshySpacing.lg),
    ) {
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
                .border(1.dp, MeeshyTheme.tokens.inputBorder, RoundedCornerShape(MeeshyRadius.md))
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
}
