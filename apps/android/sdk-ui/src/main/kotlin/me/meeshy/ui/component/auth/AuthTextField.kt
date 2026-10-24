@file:OptIn(ExperimentalComposeUiApi::class)

package me.meeshy.ui.component.auth

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.auth.AuthFieldBorder
import me.meeshy.sdk.model.auth.AuthFieldBorderRole
import me.meeshy.ui.modifier.autofill
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Ce que le champ attend, et donc ce que le système peut lui proposer (iOS
 * `UITextContentType`). C'est lui qui fait demander au gestionnaire de mots de passe
 * l'identifiant, l'adresse ou le code reçu par SMS plutôt que rien.
 *
 * `Password` : le mot de passe EXISTANT ; `NewPassword` : un mot de passe à DÉFINIR — celui
 * qui déclenche la proposition d'un mot de passe fort et la mise à jour de l'entrée du
 * gestionnaire, faute de quoi une réinitialisation laissait l'ancien enregistré.
 */
public enum class AuthContentType(
    internal val autofillTypes: List<AutofillType>,
    internal val keyboardType: KeyboardType,
) {
    None(emptyList(), KeyboardType.Text),
    Username(listOf(AutofillType.Username), KeyboardType.Text),
    Email(listOf(AutofillType.EmailAddress), KeyboardType.Email),
    OneTimeCode(listOf(AutofillType.SmsOtpCode), KeyboardType.Number),
    Password(listOf(AutofillType.Password), KeyboardType.Password),
    NewPassword(listOf(AutofillType.NewPassword), KeyboardType.Password),
}

/** Le liseré courant d'un champ, lisible par les témoins de test (jamais par l'accessibilité). */
internal val AuthFieldBorderKey: SemanticsPropertyKey<AuthFieldBorder> =
    SemanticsPropertyKey(name = "AuthFieldBorder")

private var SemanticsPropertyReceiver.authFieldBorder: AuthFieldBorder by AuthFieldBorderKey

private val ICON_SIZE = 18.dp
private val FIELD_MIN_HEIGHT = 52.dp

/**
 * Le champ de saisie des écrans d'accès (iOS `AuthTextField`) : une icône de tête, un champ,
 * un cadre arrondi dont le liseré passe à l'indigo de marque au focus et au rouge sur une
 * erreur de validation.
 *
 * Couleurs, rayon et espacements viennent UNIQUEMENT du thème — clair ou sombre, le champ
 * s'y plie. La valeur est tenue par l'hôte ([value] / [onValueChange]) : le champ ne garde
 * rien de ce qu'on y tape, et surtout rien qui survive à l'écran.
 *
 * @param contentType ce que le champ attend ; branche l'autofill du système et le clavier.
 * @param isSecure pose un champ de mot de passe ([MeeshyPasswordField]) dans le cadre : œil
 *   de bascule, texte masqué par défaut. [contentType] `NewPassword` en fait un champ de
 *   DÉFINITION, tout autre un champ de saisie du mot de passe existant.
 * @param errorText l'erreur de validation, affichée sous le champ et annoncée à TalkBack.
 * @param onImeAction appelée sur l'action du clavier (Suivant, OK) ; sans elle, le clavier
 *   garde son comportement par défaut.
 */
@Composable
public fun AuthTextField(
    value: String,
    onValueChange: (String) -> Unit,
    title: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    isSecure: Boolean = false,
    contentType: AuthContentType = AuthContentType.None,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
    enabled: Boolean = true,
    errorText: String? = null,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val border = AuthFieldBorder.resolve(isFocused = isFocused, hasError = errorText != null)
    val tokens = MeeshyTheme.tokens
    val borderColor by animateColorAsState(
        targetValue = when (border.role) {
            AuthFieldBorderRole.BRAND -> MeeshyPalette.Indigo500
            AuthFieldBorderRole.ERROR -> tokens.error
            AuthFieldBorderRole.INPUT -> tokens.inputBorder
        }.withAlphaScaledBy(border.alpha),
        label = "authFieldBorder",
    )
    val shape = RoundedCornerShape(MeeshyRadius.md)

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = FIELD_MIN_HEIGHT)
                .background(tokens.inputBackground, shape)
                .border(BorderStroke(1.dp, borderColor), shape)
                .padding(horizontal = MeeshySpacing.lg)
                .semantics { authFieldBorder = border },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (AuthFieldBorder.iconIsBrand(isFocused)) MeeshyPalette.Indigo500 else tokens.textMuted,
                modifier = Modifier.size(ICON_SIZE),
            )
            if (isSecure) {
                MeeshyPasswordField(
                    value = value,
                    onValueChange = onValueChange,
                    placeholder = title,
                    modifier = Modifier.weight(1f),
                    role = if (contentType == AuthContentType.NewPassword) {
                        MeeshyPasswordRole.New
                    } else {
                        MeeshyPasswordRole.Current
                    },
                    enabled = enabled,
                    imeAction = imeAction,
                    onImeAction = onImeAction,
                    interactionSource = interactionSource,
                    errorText = errorText,
                )
            } else {
                AuthInput(
                    value = value,
                    onValueChange = onValueChange,
                    placeholder = title,
                    contentType = contentType,
                    imeAction = imeAction,
                    onImeAction = onImeAction,
                    enabled = enabled,
                    errorText = errorText,
                    interactionSource = interactionSource,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        if (errorText != null) {
            Text(
                text = errorText,
                style = MaterialTheme.typography.labelSmall,
                color = tokens.error,
                modifier = Modifier.padding(start = MeeshySpacing.xs),
            )
        }
    }
}

@Composable
private fun AuthInput(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    contentType: AuthContentType,
    imeAction: ImeAction,
    onImeAction: (() -> Unit)?,
    enabled: Boolean,
    errorText: String?,
    interactionSource: MutableInteractionSource,
    modifier: Modifier = Modifier,
) {
    val autofillModifier = if (contentType.autofillTypes.isEmpty()) {
        Modifier
    } else {
        Modifier.autofill(contentType.autofillTypes, onValueChange)
    }
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .then(autofillModifier)
            .semantics(mergeDescendants = true) { errorText?.let { error(it) } },
        enabled = enabled,
        singleLine = true,
        textStyle = authInputTextStyle(),
        cursorBrush = SolidColor(MeeshyPalette.Indigo500),
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.None,
            autoCorrectEnabled = false,
            keyboardType = contentType.keyboardType,
            imeAction = imeAction,
        ),
        keyboardActions = authKeyboardActions(onImeAction),
        visualTransformation = VisualTransformation.None,
        interactionSource = interactionSource,
        decorationBox = { innerTextField -> AuthInputDecoration(value, placeholder, innerTextField) },
    )
}

@Composable
internal fun authInputTextStyle() =
    MaterialTheme.typography.bodyLarge.copy(color = MeeshyTheme.tokens.textPrimary)

/** Le texte indicatif, dans la teinte atténuée du thème, tant que le champ est vide. */
@Composable
internal fun AuthInputDecoration(value: String, placeholder: String, innerTextField: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) {
            Text(
                text = placeholder,
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
        innerTextField()
    }
}

/** L'action du clavier, quelle qu'en soit la forme (Suivant, OK, Aller…) : une seule consigne. */
internal fun authKeyboardActions(onImeAction: (() -> Unit)?): KeyboardActions =
    if (onImeAction == null) {
        KeyboardActions.Default
    } else {
        KeyboardActions(
            onDone = { onImeAction() },
            onGo = { onImeAction() },
            onNext = { onImeAction() },
            onSearch = { onImeAction() },
            onSend = { onImeAction() },
        )
    }

private fun Color.withAlphaScaledBy(factor: Float): Color = copy(alpha = alpha * factor)
