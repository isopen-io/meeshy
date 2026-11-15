package me.meeshy.app.chat.audio

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import me.meeshy.app.chat.ComposerReplyBanner
import me.meeshy.app.chat.ComposerReplyRow
import me.meeshy.app.chat.ReplyBannerAuthor
import me.meeshy.app.chat.ReplyBannerKind
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.fullscreen.AudioReplyCitation
import me.meeshy.ui.component.audio.AudioFullscreenSource
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **La barre de réponse du plein écran audio** (iOS `MediaReplyComposerBar`) : la citation du vocal REGARDÉ — son auteur,
 * « Vocal · durée », jamais sa transcription —, un champ, l'envoi. Ni « + » ni micro : un contrôle qui ne fait rien est un
 * contrôle qui ment, et le plein écran n'a ni le pipeline d'envoi de pièces ni la feuille de consentement vocal.
 *
 * Le brouillon vit chez l'hôte ([onDraftChange]) : refermer la barre le garde, et la rouvrir le rend. [onSend] rend `true`
 * quand la réponse part — la barre se referme alors et la LECTURE continue, rien ne l'a touchée ; sinon le texte reste.
 */
@Composable
internal fun MediaReplyComposerBar(
    source: AudioFullscreenSource,
    accent: Color,
    initialDraft: String,
    onDraftChange: (String) -> Unit,
    onSend: (String) -> Boolean,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var field by remember(source.attachmentId) { mutableStateOf(TextFieldValue(initialDraft)) }
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val canSend = field.text.isNotBlank()
    val submit = {
        if (canSend && onSend(field.text)) {
            field = TextFieldValue("")
            onClose()
        }
    }
    LaunchedEffect(source.attachmentId) {
        focus.requestFocus()
        keyboard?.show()
    }
    val tokens = MeeshyTheme.tokens
    Column(modifier = modifier.fillMaxWidth().background(tokens.backgroundPrimary)) {
        ComposerReplyRow(banner = citationBanner(source), accentColor = accent, onCancel = onClose)
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = FIELD_MIN_HEIGHT)
                    .clip(RoundedCornerShape(MeeshyRadius.xl))
                    .background(tokens.inputBackground)
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                contentAlignment = Alignment.CenterStart,
            ) {
                BasicTextField(
                    value = field,
                    onValueChange = {
                        field = it
                        onDraftChange(it.text)
                    },
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = tokens.textPrimary),
                    cursorBrush = SolidColor(accent),
                    maxLines = MAX_LINES,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { submit() }),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus),
                    decorationBox = { inner ->
                        if (field.text.isEmpty()) {
                            Text(
                                text = stringResource(R.string.media_reply_placeholder),
                                style = MaterialTheme.typography.bodyLarge,
                                color = tokens.textMuted,
                            )
                        }
                        inner()
                    },
                )
            }
            IconButton(onClick = { submit() }, enabled = canSend, modifier = Modifier.size(SEND_TARGET)) {
                Icon(
                    imageVector = MeeshyIcons.Send,
                    contentDescription = stringResource(R.string.chat_send),
                    tint = if (canSend) accent else tokens.textMuted,
                )
            }
        }
    }
}

/** La bannière d'un vocal cité : le même habillage que la réponse du fil, avec la durée à la place d'un aperçu. */
@Composable
private fun citationBanner(source: AudioFullscreenSource): ComposerReplyBanner {
    val citation = AudioReplyCitation.of(source.authorName, source.durationMs)
    val voice = stringResource(R.string.chat_composer_reply_voice)
    val label = citation.durationLabel?.let { "$voice · $it" } ?: voice
    val author = citation.author.takeIf { it.isNotEmpty() }?.let { ReplyBannerAuthor.Named(it) } ?: ReplyBannerAuthor.Unknown
    return ComposerReplyBanner(author = author, preview = label, kind = ReplyBannerKind.Voice)
}

private val FIELD_MIN_HEIGHT = 44.dp

private val SEND_TARGET = 48.dp

private const val MAX_LINES = 4
