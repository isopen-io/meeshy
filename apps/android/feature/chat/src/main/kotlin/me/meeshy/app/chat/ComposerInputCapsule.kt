package me.meeshy.app.chat

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.SentimentLevel
import me.meeshy.sdk.model.composer.ComposerFocusBorderPolicy
import me.meeshy.sdk.model.composer.ComposerLineBounds
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le champ de saisie en capsule, sans contour Material : 1 à 5 lignes, 44 dp au minimum, bordure
 * de focus en dégradé accent -> indigo 600 (iOS `textInputField`). L'accent arrive en paramètre.
 */
@Composable
internal fun ComposerInputCapsule(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    accentColor: Color,
    sentiment: SentimentLevel?,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester = remember { FocusRequester() },
    onFocusChange: (Boolean) -> Unit = {},
) {
    var focused by remember { mutableStateOf(false) }
    val border = ComposerFocusBorderPolicy.resolve(focused)
    val shape = RoundedCornerShape(22.dp)
    val textStyle = MaterialTheme.typography.bodyLarge.copy(color = MeeshyTheme.tokens.textPrimary)
    Row(
        modifier = modifier
            .heightIn(min = ComposerLineBounds.MIN_HEIGHT_DP.dp)
            .then(
                if (border.isVisible) {
                    Modifier.border(1.5.dp, MeeshyGradients.composerFocusBorder(accentColor, border.startAlpha, border.endAlpha), shape)
                } else {
                    Modifier
                },
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .weight(1f)
                .focusRequester(focusRequester)
                .onFocusChanged {
                    focused = it.isFocused
                    onFocusChange(it.isFocused)
                },
            textStyle = textStyle,
            cursorBrush = SolidColor(accentColor),
            minLines = ComposerLineBounds.MIN_LINES,
            maxLines = ComposerLineBounds.MAX_LINES,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Sentences,
                imeAction = ImeAction.Send,
            ),
            keyboardActions = KeyboardActions(onSend = { onSend() }),
            decorationBox = { inner ->
                Box(
                    modifier = Modifier
                        .heightIn(min = ComposerLineBounds.MIN_HEIGHT_DP.dp)
                        .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (value.text.isEmpty()) {
                        Text(
                            text = stringResource(R.string.chat_message_placeholder),
                            style = textStyle,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                    inner()
                }
            },
        )
        if (sentiment != null) {
            val description = stringResource(R.string.chat_composer_sentiment)
            Text(
                text = sentiment.emoji,
                modifier = Modifier
                    .padding(end = MeeshySpacing.md)
                    .semantics { contentDescription = description },
            )
        }
    }
}
