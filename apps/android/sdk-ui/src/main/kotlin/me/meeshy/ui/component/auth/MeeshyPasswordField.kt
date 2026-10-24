@file:OptIn(ExperimentalComposeUiApi::class)

package me.meeshy.ui.component.auth

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.password
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.auth.PasswordReveal
import me.meeshy.sdk.model.auth.PasswordRevealAction
import me.meeshy.sdk.model.auth.PasswordRevealState
import me.meeshy.ui.R
import me.meeshy.ui.modifier.autofill
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Ce que le champ attend : le mot de passe EXISTANT (le gestionnaire le pré-remplit) ou un
 * NOUVEAU (il propose un mot de passe fort et met à jour son entrée).
 */
public enum class MeeshyPasswordRole(internal val autofillType: AutofillType) {
    Current(AutofillType.Password),
    New(AutofillType.NewPassword),
}

/** Cible tactile du bouton œil : 48 dp, le minimum d'accessibilité. */
private val EYE_TARGET = 48.dp

/**
 * LE champ de mot de passe de l'app (iOS `MeeshyPasswordField`, #8054) — seul site autorisé à
 * écrire une saisie masquée. Un bouton œil bascule affiché / masqué sans perdre ni le texte
 * ni la position du curseur ni le focus : c'est le même champ, seule sa transformation visuelle
 * change.
 *
 * - **Masqué par défaut.** Le champ se déclare « mot de passe » à l'accessibilité tant qu'il
 *   est masqué.
 * - **Le bouton œil s'annonce en deux informations** (loi de [PasswordReveal]) : l'ACTION dans
 *   son libellé (« Afficher le mot de passe ») et l'ÉTAT dans sa description d'état
 *   (« Masqué » / « Affiché »). Cible de 48 dp.
 * - **Rien n'est conservé.** La valeur est tenue par l'hôte ; l'état de la bascule vit en
 *   mémoire de composition, jamais dans l'état sauvegardé : après une rotation prolongée, un
 *   retour de l'arrière-plan ou une restauration de processus, le champ se REMASQUE.
 *
 * @param placeholder le texte indicatif ; lu par TalkBack tant que le champ est vide.
 * @param interactionSource partagé avec le cadre qui entoure le champ (liseré au focus).
 */
@Composable
public fun MeeshyPasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    role: MeeshyPasswordRole = MeeshyPasswordRole.Current,
    enabled: Boolean = true,
    imeAction: ImeAction = ImeAction.Done,
    onImeAction: (() -> Unit)? = null,
    interactionSource: MutableInteractionSource? = null,
    errorText: String? = null,
    eyeTint: Color = MeeshyTheme.tokens.textMuted,
) {
    var reveal by remember { mutableStateOf(PasswordReveal()) }

    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .weight(1f)
                .autofill(listOf(role.autofillType), onValueChange)
                .semantics(mergeDescendants = true) {
                    if (!reveal.isRevealed) password()
                    errorText?.let { error(it) }
                },
            enabled = enabled,
            singleLine = true,
            textStyle = authInputTextStyle(),
            cursorBrush = SolidColor(MeeshyPalette.Indigo500),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.None,
                autoCorrectEnabled = false,
                keyboardType = KeyboardType.Password,
                imeAction = imeAction,
            ),
            keyboardActions = authKeyboardActions(onImeAction),
            visualTransformation = if (reveal.isRevealed) VisualTransformation.None else PasswordVisualTransformation(),
            interactionSource = interactionSource,
            decorationBox = { innerTextField -> AuthInputDecoration(value, placeholder, innerTextField) },
        )
        PasswordEyeButton(
            reveal = reveal,
            tint = eyeTint,
            enabled = enabled,
            onToggle = { reveal = reveal.toggled() },
        )
    }
}

/**
 * Le bouton œil seul, pour un champ Material qui le pose en `trailingIcon` (écran de connexion).
 * Même loi et mêmes annonces que celui de [MeeshyPasswordField].
 */
@Composable
public fun PasswordEyeButton(
    reveal: PasswordReveal,
    tint: Color,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    val label = stringResource(
        when (reveal.action) {
            PasswordRevealAction.SHOW -> R.string.password_reveal_show
            PasswordRevealAction.HIDE -> R.string.password_reveal_hide
        },
    )
    val state = stringResource(
        when (reveal.state) {
            PasswordRevealState.MASKED -> R.string.password_reveal_state_masked
            PasswordRevealState.REVEALED -> R.string.password_reveal_state_revealed
        },
    )
    Box(
        modifier = Modifier
            .size(EYE_TARGET)
            .clip(CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onToggle)
            .semantics {
                contentDescription = label
                stateDescription = state
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (reveal.isRevealed) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
            contentDescription = null,
            tint = tint,
        )
    }
}
