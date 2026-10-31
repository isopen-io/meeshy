package me.meeshy.ui.component.message

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.CommentComposerText
import me.meeshy.ui.R
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La barre de commentaire — le composer du fil en mode commentaire (iOS `UniversalComposerBar`
 * `mode: .comment`, #13988) : la capsule de verre arrondie, l'emoji qui ouvre le sélecteur complet
 * et se pose au curseur, le bouton d'envoi en dégradé, et des emplacements pour ce que l'hôte sait
 * offrir — [leadingAction] (pièce jointe), [topSlot] (puce de réponse, mentions, pièces en attente).
 * Le texte vit chez l'hôte ([text] / [onTextChange]) ; la barre ne garde que la sélection.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun MeeshyCommentComposer(
    text: String,
    onTextChange: (String) -> Unit,
    placeholder: String,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    isSending: Boolean = false,
    hasAttachment: Boolean = false,
    sendEnabled: Boolean = CommentComposerText.canSend(text, isSending, hasAttachment),
    sendLabel: String = stringResource(R.string.comment_composer_send),
    accentColor: Color = MeeshyPalette.Indigo500,
    secondaryColor: Color = MeeshyPalette.Indigo700,
    focusRequester: FocusRequester = remember { FocusRequester() },
    onFocusChange: (Boolean) -> Unit = {},
    topSlot: (@Composable () -> Unit)? = null,
    leadingAction: (@Composable RowScope.() -> Unit)? = null,
) {
    var field by remember { mutableStateOf(TextFieldValue(text, TextRange(text.length))) }
    val shown = if (field.text == text) field else TextFieldValue(text, TextRange(text.length))
    var emojiOpen by rememberSaveable { mutableStateOf(false) }
    val canSend = sendEnabled && !isSending
    val send: () -> Unit = { if (canSend) onSend() }
    val emojiLabel = stringResource(R.string.comment_composer_emoji)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        topSlot?.invoke()
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            leadingAction?.invoke(this)
            MessageComposerCapsule(
                value = shown,
                onValueChange = { next ->
                    val bounded = CommentComposerText.bounded(next.text)
                    field = if (bounded == next.text) next else TextFieldValue(bounded, next.selection.coerceWithin(bounded.length))
                    if (bounded != text) onTextChange(bounded)
                },
                accentColor = accentColor,
                placeholder = placeholder,
                onSend = send,
                modifier = Modifier.weight(1f),
                trailing = {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(CircleShape)
                            .clickable(role = Role.Button) { emojiOpen = true }
                            .semantics { contentDescription = emojiLabel },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(MeeshyIcons.Emoji, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(21.dp))
                    }
                },
                focusRequester = focusRequester,
                onFocusChange = onFocusChange,
            )
            if (isSending) {
                Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp, color = accentColor)
                }
            } else {
                MessageComposerSendButton(
                    enabled = canSend,
                    accentColor = accentColor,
                    secondaryColor = secondaryColor,
                    contentDescription = sendLabel,
                    onSend = send,
                )
            }
        }
    }

    if (emojiOpen) {
        ModalBottomSheet(onDismissRequest = { emojiOpen = false }, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
            EmojiFullPicker(
                onSelect = { emoji ->
                    val edit = CommentComposerText.insert(text, shown.selection.start, shown.selection.end, emoji)
                    field = TextFieldValue(edit.text, TextRange(edit.cursor))
                    if (edit.text != text) onTextChange(edit.text)
                    emojiOpen = false
                },
                accentColor = accentColor,
                title = emojiLabel,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }
}

private fun TextRange.coerceWithin(length: Int): TextRange =
    TextRange(start.coerceIn(0, length), end.coerceIn(0, length))
