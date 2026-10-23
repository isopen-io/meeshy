package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.TextFieldValue

/**
 * The text of a story object, edited IN PLACE on the scene (#12297) — iOS
 * `StoryInlineTextEditor` parity. Entering composition focuses the field, which raises the
 * soft keyboard, with the caret after what the object already says. While it is mounted
 * this field is the object's only writer, so its buffer is keyed by [elementId] and never
 * re-seeded from [text] mid-typing (a lagging state echo would otherwise eat keystrokes).
 */
@Composable
internal fun ComposerInlineTextField(
    elementId: String,
    text: String,
    placeholder: String,
    style: TextStyle,
    onTextChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var value by remember(elementId) { mutableStateOf(TextFieldValue(text, TextRange(text.length))) }
    val focusRequester = remember { FocusRequester() }
    BasicTextField(
        value = value,
        onValueChange = { next ->
            val changed = next.text != value.text
            value = next
            if (changed) onTextChange(next.text)
        },
        textStyle = style,
        cursorBrush = SolidColor(style.color),
        modifier = modifier.focusRequester(focusRequester),
        decorationBox = { field ->
            Box {
                if (value.text.isEmpty()) {
                    Text(text = placeholder, style = style.copy(color = style.color.copy(alpha = PLACEHOLDER_ALPHA)))
                }
                field()
            }
        },
    )
    LaunchedEffect(elementId) { focusRequester.requestFocus() }
}

private const val PLACEHOLDER_ALPHA = 0.6f
