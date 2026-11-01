package me.meeshy.ui.component.message

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.composer.ComposerFocusBorderPolicy
import me.meeshy.sdk.model.composer.ComposerLineBounds
import me.meeshy.sdk.model.composer.ComposerToolbarLaw
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.boundedScale

/**
 * Le champ de saisie du composer, capsule de VERRE (iOS `textInputField`) : rayon 22, 44 dp au
 * minimum, 1 à 5 lignes en police 16. Au repos le liseré liquide, au focus la bordure 1,5 en
 * dégradé accent -> indigo 600 et une échelle 1,02. La touche Retour envoie jusqu'à sept mots, puis
 * redevient un retour à la ligne. [leading] (le micro du fil) s'efface au focus quand
 * [hidesLeadingOnFocus] ; [trailing] (l'emoji d'un commentaire) reste. Site UNIQUE, partagé par le
 * composer du fil et la barre de commentaire (#13988).
 */
@Composable
public fun MessageComposerCapsule(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    accentColor: Color,
    placeholder: String,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    protectionTint: Color? = null,
    leading: (@Composable () -> Unit)? = null,
    hidesLeadingOnFocus: Boolean = true,
    trailing: (@Composable () -> Unit)? = null,
    focusRequester: FocusRequester = remember { FocusRequester() },
    onFocusChange: (Boolean) -> Unit = {},
) {
    var focused by remember { mutableStateOf(false) }
    val reduceMotion = LocalReduceMotion.current
    val border = ComposerFocusBorderPolicy.resolve(focused)
    val shape = RoundedCornerShape(MeeshyRadius.xlPlus)
    val textStyle = TextStyle(fontSize = 16.sp, lineHeight = 21.sp, color = MeeshyTheme.tokens.textPrimary)
    val placeholderStyle = textStyle.copy(fontSize = 16.sp.boundedScale(), lineHeight = 21.sp.boundedScale())
    val scale by animateFloatAsState(
        targetValue = if (focused && !reduceMotion) 1.02f else 1f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = MeeshyMotion.stiffnessForResponse(0.35f)),
        label = "composer-field-scale",
    )
    val leadingVisible = leading != null && !(hidesLeadingOnFocus && focused)
    val returnSends = ComposerToolbarLaw.returnSends(value.text)
    Row(
        modifier = modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .heightIn(min = ComposerLineBounds.MIN_HEIGHT_DP.dp)
            .meeshyComposerGlass(shape, protectionTint)
            .then(
                if (border.isVisible) {
                    Modifier.border(1.5.dp, MeeshyGradients.composerFocusBorder(accentColor, border.startAlpha, border.endAlpha), shape)
                } else {
                    Modifier
                },
            ),
        verticalAlignment = Alignment.Bottom,
    ) {
        AnimatedVisibility(
            visible = leadingVisible,
            enter = fadeIn() + scaleIn(initialScale = 0.6f),
            exit = fadeOut() + scaleOut(targetScale = 0.6f),
        ) {
            leading?.invoke()
        }
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
                imeAction = if (returnSends) ImeAction.Send else ImeAction.Default,
            ),
            keyboardActions = KeyboardActions(onSend = { onSend() }),
            decorationBox = { inner ->
                Box(
                    modifier = Modifier
                        .heightIn(min = ComposerLineBounds.MIN_HEIGHT_DP.dp)
                        .padding(
                            start = if (leadingVisible) MeeshySpacing.xxs else MeeshySpacing.lg,
                            end = if (trailing != null) MeeshySpacing.xxs else MeeshySpacing.lg,
                            top = MeeshySpacing.smPlus,
                            bottom = MeeshySpacing.smPlus,
                        ),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (value.text.isEmpty()) {
                        Text(
                            text = placeholder,
                            style = placeholderStyle,
                            color = MeeshyTheme.tokens.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    inner()
                }
            },
        )
        trailing?.invoke()
    }
}
