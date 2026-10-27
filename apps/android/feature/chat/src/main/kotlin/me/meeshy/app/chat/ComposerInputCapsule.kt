package me.meeshy.app.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.ComposerFocusBorderPolicy
import me.meeshy.sdk.model.composer.ComposerLineBounds
import me.meeshy.sdk.model.composer.ComposerToolbarLaw
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le champ de saisie, capsule de VERRE (iOS `textInputField`) : rayon 22, 44 dp au minimum, 1 à 5
 * lignes en police 16. Le micro vit DANS le champ, à gauche, et s'efface au focus. Au repos le
 * liseré liquide, au focus la bordure 1,5 en dégradé accent -> indigo 600 et une échelle 1,02.
 * La touche Retour envoie jusqu'à sept mots, puis redevient un retour à la ligne.
 */
@Composable
internal fun ComposerInputCapsule(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    accentColor: Color,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    showMic: Boolean = false,
    iconTint: Color = MeeshyTheme.tokens.textSecondary,
    protectionTint: Color? = null,
    onRequestVoice: () -> Unit = {},
    focusRequester: FocusRequester = remember { FocusRequester() },
    onFocusChange: (Boolean) -> Unit = {},
) {
    var focused by remember { mutableStateOf(false) }
    val reduceMotion = LocalReduceMotion.current
    val border = ComposerFocusBorderPolicy.resolve(focused)
    val shape = RoundedCornerShape(MeeshyRadius.xlPlus)
    val textStyle = TextStyle(fontSize = 16.sp, lineHeight = 21.sp, color = MeeshyTheme.tokens.textPrimary)
    val scale by animateFloatAsState(
        targetValue = if (focused && !reduceMotion) 1.02f else 1f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = MeeshyMotion.stiffnessForResponse(0.35f)),
        label = "composer-field-scale",
    )
    val micVisible = showMic && !focused
    val returnSends = ComposerToolbarLaw.returnSends(value.text)
    Row(
        modifier = modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .heightIn(min = ComposerLineBounds.MIN_HEIGHT_DP.dp)
            .composerInnerGlass(shape, protectionTint)
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
            visible = micVisible,
            enter = fadeIn() + scaleIn(initialScale = 0.6f),
            exit = fadeOut() + scaleOut(targetScale = 0.6f),
        ) {
            val label = stringResource(R.string.chat_record_voice)
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClick = onRequestVoice)
                    .semantics { contentDescription = label },
                contentAlignment = Alignment.Center,
            ) {
                Icon(MeeshyIcons.Mic, contentDescription = null, tint = iconTint, modifier = Modifier.size(19.dp))
            }
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
                            start = if (micVisible) MeeshySpacing.xxs else MeeshySpacing.lg,
                            end = MeeshySpacing.lg,
                            top = MeeshySpacing.smPlus,
                            bottom = MeeshySpacing.smPlus,
                        ),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (value.text.isEmpty()) {
                        Text(
                            text = stringResource(R.string.chat_message_placeholder),
                            style = textStyle,
                            color = MeeshyTheme.tokens.textMuted,
                            maxLines = 1,
                        )
                    }
                    inner()
                }
            },
        )
    }
}
