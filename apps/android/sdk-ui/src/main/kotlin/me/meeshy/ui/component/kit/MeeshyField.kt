package me.meeshy.ui.component.kit

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
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
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.Dp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.AccessibilityAnnouncer
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.chrome.isHighContrastEnabled
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La tête optionnelle : une icône, ou un glyphe de texte. Décorative, masquée de l'accessibilité. */
@Immutable
public sealed interface MeeshyFieldLeading {
    public data class Icon(val icon: ImageVector) : MeeshyFieldLeading
    public data class Glyph(val glyph: String) : MeeshyFieldLeading
}

/** Vrai quand le système demande plus de contraste (texte à contraste élevé). Pendant iOS : `colorSchemeContrast`. */
@Composable
public fun rememberMeeshyIncreasedContrast(): Boolean {
    val context = LocalContext.current
    return remember(context) { isHighContrastEnabled(context) }
}

/**
 * Le compteur « 17 / 60 », posé par l'hôte ([MeeshyFieldCounterPlacement.Hosted] : en-tête de pilule, O9, S7). En alerte
 * à 80 % du plafond : couleur d'alerte ET gras. Dit « 17 caractères sur 60 ». Miroir de `MeeshyFieldCounter` (iOS).
 */
@Composable
public fun MeeshyFieldCounter(
    count: Int,
    limit: Int,
    modifier: Modifier = Modifier,
    tone: MeeshyGlassTone? = null,
) {
    MeeshyFieldCounterText(count = count, limit = limit, tone = tone, isHidden = false, modifier = modifier)
}

/**
 * Le champ de saisie de feuille de K08 : une boîte arrondie à 8 % de l'encre, sans bord ni verre, une tête optionnelle,
 * une invite, une légende, un compteur, la croix de `Search`, la roue d'occupation et un [trailing] dans une cellule de
 * 48 dp au bord de fin. Il ne décide ni de la valeur du plafond ni de ce que la saisie signifie : l'hôte reçoit du texte.
 *
 * État : un brouillon local garde le curseur ; [onChange] part à chaque frappe, après troncature au plafond ; [onCommit]
 * une fois par valeur changée, au Retour, à la perte de focus et au démontage ; un [text] venu de l'hôte remplace le
 * brouillon. Le champ ne ferme jamais le clavier de lui-même. Miroir de `MeeshyField` (iOS).
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
    tone: MeeshyGlassTone? = null,
    haptic: MeeshyFieldHaptic = MeeshyFieldHaptic.Standard,
    increasedContrast: Boolean = rememberMeeshyIncreasedContrast(),
    onSubmit: ((String) -> Unit)? = null,
    onCommit: ((String) -> Unit)? = null,
    onFocusChange: ((Boolean) -> Unit)? = null,
    onLimitReached: (() -> Unit)? = null,
    onStep: ((Int) -> Unit)? = null,
    focusRequester: FocusRequester = remember { FocusRequester() },
    haptics: MeeshyHaptics = rememberMeeshyHaptics(),
    announcer: AccessibilityAnnouncer = rememberMeeshyFieldAnnouncer(),
    trailing: (@Composable () -> Unit)? = null,
) {
    require(label.isNotBlank()) { "MeeshyField: label must not be blank" }
    val effectiveTone = tone ?: LocalMeeshyGlassTone.current
    val hasCaption = caption != null
    val recipe = remember(input, hasCaption, effectiveTone, enabled, increasedContrast) {
        MeeshyFieldRecipe.resolve(input, hasCaption, effectiveTone, enabled, increasedContrast)
    }
    val ink = recipe.inkColor(MeeshyTheme.isDark)
    val muted = ink.copy(alpha = MeeshyFieldRecipe.MUTED_ALPHA)
    val resources = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val stacksCounter = MeeshyFieldRecipe.stacksCounter(LocalDensity.current.fontScale)
    val reduceMotion = LocalReduceMotion.current

    var field by remember { mutableStateOf(TextFieldValue(text, TextRange(text.length))) }
    var ledger by remember { mutableStateOf(MeeshyFieldLedger.of(text)) }
    var wasFocused by remember { mutableStateOf(false) }
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

    val onTextChange: (TextFieldValue) -> Unit = { next ->
        val (newLedger, edit) = ledger.receive(next.text, limit)
        ledger = newLedger
        field = edit?.takeIf { it.wasTruncated }?.let { TextFieldValue(it.value, TextRange(it.value.length)) } ?: next
        if (edit != null && edit.emits) {
            currentOnChange(edit.value)
            val ceiling = limit
            val crossing = edit.crossing
            if (ceiling != null && crossing != null) {
                announcer.announce(
                    MeeshyFieldWords.announcement(resources, crossing, MeeshyFieldLimit.count(edit.value), ceiling, locale),
                )
                if (crossing == MeeshyFieldLimitCrossing.Reached) {
                    currentOnLimitReached?.invoke()
                    if (haptic == MeeshyFieldHaptic.Standard && enabled) haptics.warning()
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
        MeeshyGlassButtonTrigger.perform(
            isEnabled = enabled,
            haptic = if (haptic == MeeshyFieldHaptic.Standard) MeeshyGlassButtonHaptic.Light else MeeshyGlassButtonHaptic.None,
            play = { haptics.light() },
        ) {
            onTextChange(TextFieldValue(""))
            focusRequester.requestFocus()
        }
    }

    val draft = field.text
    val showsClear = MeeshyFieldRecipe.showsClear(input, draft, isBusy, enabled)
    val counterVisible = MeeshyFieldRecipe.showsInlineCounter(limit, draft, counter)
    val fade = meeshyFieldFade(reduceMotion)
    val clearAlpha = animateFloatAsState(if (showsClear) 1f else 0f, fade, label = "meeshy-field-clear")
    val busyAlpha = animateFloatAsState(if (isBusy) 1f else 0f, fade, label = "meeshy-field-busy")
    val counterAlpha = animateFloatAsState(if (counterVisible) 1f else 0f, fade, label = "meeshy-field-counter")

    val stepActions = remember(onStep, resources) {
        onStep?.takeIf { input == MeeshyFieldInput.Numeric }?.let { step ->
            listOf(
                CustomAccessibilityAction(resources.getString(R.string.a11y_kit_increase)) { step(1); true },
                CustomAccessibilityAction(resources.getString(R.string.a11y_kit_decrease)) { step(-1); true },
            )
        }.orEmpty()
    }
    val textStyle = remember(ink, recipe, input) { valueStyle(recipe, input, ink) }
    val shape = RoundedCornerShape(MeeshyRadius.md)
    val hairline = recipe.hairlineAlpha

    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = recipe.minimumHeight)
            .graphicsLayer { alpha = recipe.contentAlpha }
            .background(ink.copy(alpha = recipe.fillAlpha), shape)
            .then(if (hairline != null) Modifier.border(MeeshyBorder.regular, ink.copy(alpha = hairline), shape) else Modifier)
            .pointerInput(enabled, focusRequester) {
                if (enabled) detectTapGestures { focusRequester.requestFocus() }
            }
            .padding(horizontal = recipe.horizontalPadding),
        verticalAlignment = if (recipe.isMultiline) Alignment.Top else Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        leading?.let { MeeshyFieldLeadingMark(it, muted, recipe.verticalPadding, recipe.isMultiline) }
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(vertical = recipe.verticalPadding),
        ) {
            caption?.let { MeeshyFieldCaption(it, muted, recipe.captionSpacing) }
            BasicTextField(
                value = field,
                onValueChange = onTextChange,
                enabled = enabled,
                textStyle = textStyle,
                cursorBrush = SolidColor(MeeshyPalette.Indigo400),
                singleLine = !recipe.isMultiline,
                minLines = recipe.lineRange.first,
                maxLines = recipe.lineRange.last,
                keyboardOptions = keyboardOptions(recipe),
                keyboardActions = KeyboardActions(onDone = { submit() }, onSearch = { submit() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester)
                    .onFocusChanged { state ->
                        if (state.isFocused != wasFocused) {
                            wasFocused = state.isFocused
                            onFocusChange?.invoke(state.isFocused)
                            if (!state.isFocused) commitDraft()
                        }
                    }
                    .semantics {
                        contentDescription = label
                        caption?.let { stateDescription = it }
                        if (stepActions.isNotEmpty()) customActions = stepActions
                    },
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (prompt != null && MeeshyFieldRecipe.showsPrompt(draft, caption)) {
                            Text(text = prompt, style = textStyle.copy(color = muted), maxLines = recipe.lineRange.last)
                        }
                        inner()
                    }
                },
            )
            if (stacksCounter && limit != null && counter == MeeshyFieldCounterPlacement.Inline) {
                MeeshyFieldCounterText(
                    count = MeeshyFieldLimit.count(draft),
                    limit = limit,
                    tone = effectiveTone,
                    isHidden = !counterVisible,
                    modifier = Modifier
                        .align(Alignment.End)
                        .padding(top = MeeshySpacing.xxs)
                        .graphicsLayer { alpha = counterAlpha.value },
                )
            }
        }
        if (!stacksCounter && limit != null && counter == MeeshyFieldCounterPlacement.Inline) {
            MeeshyFieldCounterText(
                count = MeeshyFieldLimit.count(draft),
                limit = limit,
                tone = effectiveTone,
                isHidden = !counterVisible,
                modifier = Modifier
                    .padding(vertical = recipe.verticalPadding)
                    .graphicsLayer { alpha = counterAlpha.value },
            )
        }
        if (recipe.offersClear || isBusy) {
            MeeshyFieldEndCell(
                showsClear = showsClear,
                isBusy = isBusy,
                tint = muted,
                clearAlpha = clearAlpha,
                busyAlpha = busyAlpha,
                onClear = clear,
            )
        }
        trailing?.let { MeeshyFieldTrailingCell(it) }
    }
}

@Composable
private fun rememberMeeshyFieldAnnouncer(): AccessibilityAnnouncer {
    val view = LocalView.current
    return remember(view) { AccessibilityAnnouncer.forView(view) }
}

@Composable
internal fun MeeshyFieldCounterText(
    count: Int,
    limit: Int,
    tone: MeeshyGlassTone?,
    isHidden: Boolean,
    modifier: Modifier = Modifier,
) {
    val effectiveTone = tone ?: LocalMeeshyGlassTone.current
    val recipe = MeeshyFieldRecipe.resolve(MeeshyFieldInput.Sentence, false, effectiveTone, true, false)
    val isDark = MeeshyTheme.isDark
    val isNear = MeeshyFieldLimit.isNear(count, limit)
    val locale = LocalConfiguration.current.locales[0]
    val resources = LocalContext.current.resources
    val spoken = MeeshyFieldWords.spokenCount(resources, count, limit, locale)
    Text(
        text = MeeshyFieldWords.counter(count, limit, locale),
        color = if (isNear) recipe.alertColor(isDark) else recipe.inkColor(isDark).copy(alpha = MeeshyFieldRecipe.MUTED_ALPHA),
        style = TextStyle(
            fontSize = MeeshyFontSize.small,
            fontWeight = if (isNear) FontWeight.Bold else FontWeight.Medium,
            fontFeatureSettings = TABULAR_DIGITS,
        ),
        maxLines = 1,
        modifier = modifier.clearAndSetSemantics { if (!isHidden) contentDescription = spoken },
    )
}

/** La cellule de fin : la croix de `Search` ou la roue d'occupation, dans 48 dp réservés ; leur fondu ne bouge rien. */
@Composable
private fun MeeshyFieldEndCell(
    showsClear: Boolean,
    isBusy: Boolean,
    tint: Color,
    clearAlpha: State<Float>,
    busyAlpha: State<Float>,
    onClear: () -> Unit,
) {
    val resources = LocalContext.current.resources
    Box(modifier = Modifier.size(MeeshyControlSize.minTouchTarget), contentAlignment = Alignment.Center) {
        if (isBusy) {
            val busyLabel = MeeshyFieldWords.busy(resources)
            CircularProgressIndicator(
                color = tint,
                strokeWidth = MeeshyBorder.strong,
                modifier = Modifier
                    .size(MeeshyIconSize.lg)
                    .graphicsLayer { alpha = busyAlpha.value }
                    .clearAndSetSemantics { contentDescription = busyLabel },
            )
        }
        val clearModifier = if (showsClear) {
            val clearLabel = MeeshyFieldWords.clear(resources)
            Modifier
                .clickable(role = Role.Button, onClick = onClear)
                .semantics { contentDescription = clearLabel }
        } else {
            Modifier.clearAndSetSemantics { }
        }
        Box(
            modifier = Modifier
                .size(MeeshyControlSize.minTouchTarget)
                .then(clearModifier),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = MeeshyIcons.CloseCircleFilled,
                contentDescription = null,
                tint = tint,
                modifier = Modifier
                    .size(MeeshyIconSize.lg)
                    .graphicsLayer { alpha = clearAlpha.value },
            )
        }
    }
}

@Composable
private fun MeeshyFieldTrailingCell(content: @Composable () -> Unit) {
    Box(
        modifier = Modifier.defaultMinSize(
            minWidth = MeeshyControlSize.minTouchTarget,
            minHeight = MeeshyControlSize.minTouchTarget,
        ),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

/** La légende d'O9 et d'O10 : une ligne fine au-dessus de la saisie, lue par le champ comme indication. */
@Composable
private fun MeeshyFieldCaption(caption: String, color: Color, spacing: Dp) {
    Text(
        text = caption,
        color = color,
        style = TextStyle(fontSize = MeeshyFontSize.small, fontWeight = FontWeight.Medium),
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = spacing)
            .clearAndSetSemantics { },
    )
}

/** La tête : une loupe, un « # »… décorative, masquée au lecteur. */
@Composable
private fun MeeshyFieldLeadingMark(
    leading: MeeshyFieldLeading,
    color: Color,
    verticalPadding: Dp,
    isMultiline: Boolean,
) {
    val modifier = Modifier
        .padding(vertical = if (isMultiline) verticalPadding else MeeshySpacing.none)
        .clearAndSetSemantics { }
    when (leading) {
        is MeeshyFieldLeading.Icon -> Icon(
            imageVector = leading.icon,
            contentDescription = null,
            tint = color,
            modifier = modifier.size(MeeshyIconSize.lg),
        )
        is MeeshyFieldLeading.Glyph -> Text(
            text = leading.glyph,
            color = color,
            style = TextStyle(fontSize = MeeshyFontSize.body),
            modifier = modifier,
        )
    }
}

private const val TABULAR_DIGITS: String = "tnum"

/** Le fondu de la croix, de la roue et du compteur : 150 ms, immédiat sous « réduire les animations ». */
internal fun meeshyFieldFade(reduceMotion: Boolean): AnimationSpec<Float> =
    if (reduceMotion) snap() else tween(MeeshyFieldRecipe.FADE_MILLIS)

private fun valueStyle(recipe: MeeshyFieldRecipe, input: MeeshyFieldInput, ink: Color): TextStyle {
    val numeric = input == MeeshyFieldInput.Numeric
    return TextStyle(
        color = ink,
        fontSize = recipe.valueSize,
        fontWeight = if (recipe.valueIsBold) FontWeight.Bold else FontWeight.Normal,
        fontFeatureSettings = if (numeric) TABULAR_DIGITS else null,
        textDirection = if (numeric) TextDirection.Ltr else TextDirection.Content,
    )
}

private fun keyboardOptions(recipe: MeeshyFieldRecipe): KeyboardOptions = KeyboardOptions(
    capitalization = when (recipe.capitalization) {
        MeeshyFieldCapitalization.Sentences -> KeyboardCapitalization.Sentences
        MeeshyFieldCapitalization.None -> KeyboardCapitalization.None
    },
    autoCorrectEnabled = recipe.autocorrects,
    keyboardType = when (recipe.keyboard) {
        MeeshyFieldKeyboard.NumbersAndPunctuation -> KeyboardType.Decimal
        MeeshyFieldKeyboard.Text, MeeshyFieldKeyboard.Search -> KeyboardType.Text
    },
    imeAction = when (recipe.returnKey) {
        MeeshyFieldReturnKey.Done -> ImeAction.Done
        MeeshyFieldReturnKey.Search -> ImeAction.Search
        MeeshyFieldReturnKey.Newline -> ImeAction.Default
    },
)
