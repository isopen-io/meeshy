package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La tête optionnelle : une icône, ou un glyphe de texte. Décorative, masquée de l'accessibilité. */
public sealed interface MeeshyFieldLeading {
    public data class Icon(val icon: ImageVector) : MeeshyFieldLeading
    public data class Glyph(val glyph: String) : MeeshyFieldLeading
}

/**
 * Le champ de saisie de feuille de K08 : une boîte arrondie, une tête optionnelle, une invite, une légende, un compteur
 * et l'effacement. Il ne décide ni de la valeur du plafond ni de ce que la saisie signifie : l'hôte reçoit du texte.
 */
@Composable
public fun MeeshyField(
    label: String,
    text: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    input: MeeshyFieldInput = MeeshyFieldInput.Sentence,
    prompt: String? = null,
    caption: String? = null,
    leading: MeeshyFieldLeading? = null,
    limit: Int? = null,
    counter: MeeshyFieldCounterPlacement = MeeshyFieldCounterPlacement.Inline,
    isBusy: Boolean = false,
    autoFocus: Boolean = false,
    enabled: Boolean = true,
    tone: MeeshyFieldTone? = null,
    haptic: MeeshyFieldHaptic = MeeshyFieldHaptic.Standard,
    increasedContrast: Boolean = false,
    onSubmit: ((String) -> Unit)? = null,
    onCommit: ((String) -> Unit)? = null,
    onFocusChange: ((Boolean) -> Unit)? = null,
    onLimitReached: (() -> Unit)? = null,
    onStep: ((Int) -> Unit)? = null,
    focusRequester: FocusRequester = remember { FocusRequester() },
    trailing: (@Composable () -> Unit)? = null,
) {
    require(label.isNotBlank()) { "MeeshyField: label must not be blank" }
    val recipe = MeeshyFieldRecipe.resolve(input, caption != null, tone, enabled, increasedContrast)
    val haptics = rememberMeeshyHaptics()
    val reduceMotion = LocalReduceMotion.current
    val isDark = MeeshyTheme.isDark
    val context = LocalContext.current
    val view = LocalView.current
    val ink = inkColor(recipe.ink, isDark, LocalMeeshyTokens.current.textPrimary)
    val muted = ink.copy(alpha = MeeshyFieldRecipe.MUTED_ALPHA)
    val alert = alertColor(recipe.ink, isDark)

    var field by remember { mutableStateOf(TextFieldValue(text, TextRange(text.length))) }
    var ledger by remember { mutableStateOf(MeeshyFieldLedger.of(text)) }
    val currentOnChange by rememberUpdatedState(onChange)
    val currentOnCommit by rememberUpdatedState(onCommit)
    val currentOnLimitReached by rememberUpdatedState(onLimitReached)

    LaunchedEffect(text) {
        val (next, changed) = ledger.resync(text)
        if (changed) {
            ledger = next
            field = TextFieldValue(text, TextRange(text.length))
        }
    }
    LaunchedEffect(Unit) {
        if (autoFocus) focusRequester.requestFocus()
    }

    fun commitDraft() {
        val (next, committed) = ledger.commit(field.text)
        ledger = next
        committed?.let { currentOnCommit?.invoke(it) }
    }
    DisposableEffect(Unit) {
        onDispose { commitDraft() }
    }

    val count = MeeshyFieldLimit.count(field.text)
    val isEmpty = field.text.isEmpty()
    val nearLimit = limit != null && MeeshyFieldLimit.isNear(count, limit)
    val counterText = limit?.let { "$count / $it" }.orEmpty()
    val showsClear = MeeshyFieldRecipe.showsClear(input, field.text, isBusy, enabled)
    val showsPrompt = MeeshyFieldRecipe.showsPrompt(field.text, caption)
    val reservesClearCell = recipe.offersClear || isBusy
    val clearAlpha by animateFloatAsState(
        targetValue = if (showsClear || isBusy) 1f else 0f,
        animationSpec = if (reduceMotion) snap() else tween(MeeshyFieldRecipe.FADE_MILLIS),
        label = "meeshy-field-clear",
    )
    val counterAlpha by animateFloatAsState(
        targetValue = if (isEmpty) 0f else 1f,
        animationSpec = if (reduceMotion) snap() else tween(MeeshyFieldRecipe.FADE_MILLIS),
        label = "meeshy-field-counter",
    )

    val clearLabel = context.getString(R.string.kit_field_clear)
    val onTextChange: (TextFieldValue) -> Unit = { next ->
        val (newLedger, edit) = ledger.receive(next.text, limit)
        ledger = newLedger
        if (edit == null) {
            field = next
        } else {
            field = if (edit.wasTruncated) TextFieldValue(edit.value, TextRange(edit.value.length)) else next
            if (edit.emits) currentOnChange(edit.value)
            edit.crossing?.let { crossing ->
                when (crossing) {
                    MeeshyFieldLimitCrossing.Reached -> {
                        currentOnLimitReached?.invoke()
                        if (haptic == MeeshyFieldHaptic.Standard) haptics.warning()
                        view.announceForAccessibility(context.getString(R.string.kit_field_limit_reached))
                    }
                    MeeshyFieldLimitCrossing.Near -> view.announceForAccessibility(
                        context.getString(R.string.kit_field_count, edit.value.length.toString(), (limit ?: 0).toString()),
                    )
                }
            }
        }
    }
    val submit: () -> Unit = {
        if (recipe.returnKey != MeeshyFieldReturnKey.Newline) {
            onSubmit?.invoke(field.text)
            commitDraft()
        }
    }
    val clear: () -> Unit = {
        if (haptic == MeeshyFieldHaptic.Standard) haptics.light()
        onTextChange(TextFieldValue(""))
        focusRequester.requestFocus()
    }

    val stepActions = onStep?.let { step ->
        listOf(
            CustomAccessibilityAction(context.getString(R.string.a11y_kit_increase)) { step(1); true },
            CustomAccessibilityAction(context.getString(R.string.a11y_kit_decrease)) { step(-1); true },
        )
    }.orEmpty()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = recipe.minimumHeightDp.dp)
            .alpha(recipe.contentAlpha)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(ink.copy(alpha = recipe.fillAlpha))
            .then(
                recipe.hairlineAlpha?.let {
                    Modifier.border(MeeshyBorder.hairline, ink.copy(alpha = it), RoundedCornerShape(MeeshyRadius.md))
                } ?: Modifier,
            )
            .clickable(enabled = enabled) { focusRequester.requestFocus() }
            .padding(
                PaddingValues(
                    horizontal = recipe.horizontalPaddingDp.dp,
                    vertical = recipe.verticalPaddingDp.dp,
                ),
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading?.let { LeadingGlyph(it, muted) }
        Column(modifier = Modifier.weight(1f)) {
            caption?.let {
                Text(
                    text = it,
                    color = muted,
                    fontSize = 12.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = recipe.captionSpacingDp.dp),
                )
            }
            BasicTextField(
                value = field,
                onValueChange = onTextChange,
                enabled = enabled,
                textStyle = TextStyle(
                    color = ink,
                    fontSize = recipe.valueSizeSp.sp,
                    fontWeight = if (recipe.valueIsBold) FontWeight.Bold else FontWeight.Normal,
                ),
                cursorBrush = SolidColor(MeeshyPalette.Indigo400),
                singleLine = recipe.lineRange.last == 1,
                minLines = recipe.lineRange.first,
                maxLines = recipe.lineRange.last,
                keyboardOptions = KeyboardOptions(
                    capitalization = if (recipe.capitalization == MeeshyFieldCapitalization.Sentences) {
                        KeyboardCapitalization.Sentences
                    } else {
                        KeyboardCapitalization.None
                    },
                    autoCorrect = recipe.autocorrects,
                    keyboardType = when (recipe.keyboard) {
                        MeeshyFieldKeyboard.NumbersAndPunctuation -> KeyboardType.Decimal
                        MeeshyFieldKeyboard.Text, MeeshyFieldKeyboard.Search -> KeyboardType.Text
                    },
                    imeAction = when (recipe.returnKey) {
                        MeeshyFieldReturnKey.Done -> ImeAction.Done
                        MeeshyFieldReturnKey.Search -> ImeAction.Search
                        MeeshyFieldReturnKey.Newline -> ImeAction.Default
                    },
                ),
                keyboardActions = KeyboardActions(onDone = { submit() }, onSearch = { submit() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester)
                    .onFocusChanged { state ->
                        onFocusChange?.invoke(state.isFocused)
                        if (!state.isFocused) commitDraft()
                    }
                    .semantics {
                        contentDescription = label
                        if (limit != null) stateDescription = counterText
                        this.customActions = stepActions
                    },
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (showsPrompt && prompt != null) {
                            Text(text = prompt, color = muted, fontSize = recipe.valueSizeSp.sp)
                        }
                        inner()
                    }
                },
            )
        }
        if (limit != null && counter == MeeshyFieldCounterPlacement.Inline) {
            Text(
                text = counterText,
                color = if (nearLimit) alert else muted,
                fontSize = 12.sp,
                fontWeight = if (nearLimit) FontWeight.Bold else FontWeight.Medium,
                modifier = Modifier
                    .padding(start = MeeshySpacing.sm)
                    .alpha(counterAlpha)
                    .semantics { contentDescription = counterText },
            )
        }
        if (reservesClearCell) {
            Box(modifier = Modifier.size(MeeshyFieldRecipe.MIN_TOUCH_TARGET_DP.dp), contentAlignment = Alignment.Center) {
                if (isBusy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(MeeshyIconSize.md),
                        color = muted,
                        strokeWidth = 2.dp,
                    )
                } else {
                    IconButton(
                        onClick = clear,
                        enabled = showsClear,
                        modifier = Modifier.alpha(clearAlpha),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = clearLabel,
                            tint = muted,
                        )
                    }
                }
            }
        }
        trailing?.let {
            Box(modifier = Modifier.defaultMinSize(minWidth = MeeshyFieldRecipe.TAP_TARGET_DP.dp, minHeight = MeeshyFieldRecipe.TAP_TARGET_DP.dp)) {
                it()
            }
        }
    }
}

@Composable
private fun LeadingGlyph(leading: MeeshyFieldLeading, color: Color) {
    val modifier = Modifier
        .padding(end = MeeshySpacing.sm)
        .size(MeeshyIconSize.lg)
        .clearAndSetSemantics { }
    when (leading) {
        is MeeshyFieldLeading.Icon -> Icon(imageVector = leading.icon, contentDescription = null, tint = color, modifier = modifier)
        is MeeshyFieldLeading.Glyph -> Text(text = leading.glyph, color = color, fontSize = 15.sp, modifier = modifier)
    }
}

private fun inkColor(ink: MeeshyFieldInk, isDark: Boolean, themeInk: Color): Color = when (ink) {
    MeeshyFieldInk.OnMedia -> MeeshyMediaChromeColors.OnMedia
    MeeshyFieldInk.OnLight -> MeeshyAdaptiveColors.textPrimary(isDark = false)
    MeeshyFieldInk.ThemeInk -> themeInk
}

private fun alertColor(ink: MeeshyFieldInk, isDark: Boolean): Color = when (ink) {
    MeeshyFieldInk.OnMedia -> MeeshyPalette.Error
    MeeshyFieldInk.OnLight -> MeeshyPalette.ErrorStrong
    MeeshyFieldInk.ThemeInk -> if (isDark) MeeshyPalette.Error else MeeshyPalette.ErrorStrong
}
