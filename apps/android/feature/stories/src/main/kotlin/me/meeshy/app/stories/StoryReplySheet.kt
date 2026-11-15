package me.meeshy.app.stories

import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.composer.ComposerConfiguration
import me.meeshy.ui.component.composer.LocalUniversalComposer
import me.meeshy.ui.component.composer.UniversalComposerSpec
import me.meeshy.ui.component.message.MeeshyMentionSuggestions
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.story.StoryReplyRules
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/** La story que la réponse cite : de quoi la reconnaître d'un coup d'œil, comme la citation de la bulle. */
data class StoryReplyQuote(
    val storyId: String,
    val authorId: String,
    val authorName: String,
    val preview: String?,
    val thumbnailUrl: String?,
    val accentHex: String,
)

/**
 * « Répondre » à une story (#13501, iso iOS : `ReplyContext.story` ouvre le composeur de la conversation
 * directe avec l'auteur). La feuille porte la story citée au-dessus du champ ; la lecture est figée tant
 * qu'elle est ouverte ; l'envoi est optimiste (la feuille se referme, la réponse part dans la file) et un
 * échec garde les mots et le dit.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoryReplySheet(
    quote: StoryReplyQuote,
    onDismiss: () -> Unit,
    viewModel: StoryReplyViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val mention by viewModel.mention.collectAsStateWithLifecycle()
    LaunchedEffect(quote.authorId, quote.authorName) { viewModel.attachAuthor(quote.authorId, quote.authorName) }
    val context = LocalContext.current
    val sentMessage = stringResource(R.string.stories_reply_sent)
    LaunchedEffect(state.phase) {
        if (state.phase == StoryReplyPhase.SENT) {
            Toast.makeText(context, sentMessage, Toast.LENGTH_SHORT).show()
            viewModel.consumeOutcome()
            onDismiss()
        }
    }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    // Les encarts (barre de navigation, clavier) sont ceux du composeur universel : la feuille n'en pose aucun (#14313).
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, contentWindowInsets = { WindowInsets(0, 0, 0, 0) }) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            QuotedStory(quote)
            AnimatedVisibility(
                visible = state.phase == StoryReplyPhase.FAILED || state.phase == StoryReplyPhase.ENCRYPTED,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                Text(
                    text = stringResource(
                        if (state.phase == StoryReplyPhase.ENCRYPTED) R.string.stories_reply_encrypted else R.string.stories_reply_failed,
                    ),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
            ReplyField(
                text = state.text,
                authorName = quote.authorName,
                accentHex = quote.accentHex,
                isSending = state.phase == StoryReplyPhase.SENDING,
                canSend = StoryReplyRules.canSend(canReply = true, isSending = state.phase == StoryReplyPhase.SENDING, text = state.text),
                mention = mention,
                onChange = viewModel::onTextChange,
                onMentionSelected = viewModel::onMentionSelected,
                onSend = { viewModel.send(quote.storyId, quote.authorId) },
            )
        }
    }
}

@Composable
private fun QuotedStory(quote: StoryReplyQuote) {
    val header = stringResource(R.string.stories_reply_to, quote.authorName)
    val accent = hexColor(quote.accentHex)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(accent.copy(alpha = 0.12f))
            .padding(MeeshySpacing.sm)
            .semantics(mergeDescendants = true) { contentDescription = listOfNotNull(header, quote.preview).joinToString(". ") },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Box(
            modifier = Modifier.size(width = 36.dp, height = 56.dp).clip(RoundedCornerShape(8.dp)).background(accent.copy(alpha = 0.35f)),
        ) {
            if (quote.thumbnailUrl != null) {
                AsyncImage(
                    model = quote.thumbnailUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(width = 36.dp, height = 56.dp),
                )
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(text = header, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = accent)
            if (quote.preview != null) {
                Text(
                    text = quote.preview,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * La saisie de la réponse : LE composeur universel des conversations (#14313), réglé pour un texte seul — la réponse
 * part dans la conversation directe, où la feuille ne joint aucune pièce. Plus de barre jumelle.
 */
@Composable
private fun ReplyField(
    text: String,
    authorName: String,
    accentHex: String,
    isSending: Boolean,
    canSend: Boolean,
    mention: MentionAutocompleteState,
    onChange: (String) -> Unit,
    onMentionSelected: (MentionCandidate) -> Unit,
    onSend: () -> Unit,
) {
    val accent = hexColor(accentHex)
    val composer = LocalUniversalComposer.current ?: return
    composer(
        UniversalComposerSpec(
            configuration = ComposerConfiguration.COMMENT,
            draft = text,
            placeholder = stringResource(R.string.stories_reply_placeholder, authorName),
            canSend = canSend && !isSending,
            onDraftChange = onChange,
            onSend = onSend,
            accentColor = accent,
            topSlot = { MeeshyMentionSuggestions(mention = mention, onSelect = onMentionSelected, accentColor = accent) },
        ),
        Modifier,
    )
}
