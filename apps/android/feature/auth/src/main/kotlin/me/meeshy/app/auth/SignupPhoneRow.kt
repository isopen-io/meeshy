@file:OptIn(ExperimentalComposeUiApi::class)

package me.meeshy.app.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.AuthFieldBorder
import me.meeshy.sdk.model.auth.AuthFieldBorderRole
import me.meeshy.sdk.model.auth.Country
import me.meeshy.sdk.model.auth.CountryCatalog
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.modifier.autofill
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val SIGNUP_PHONE_FIELD_TAG: String = "signup.phone.field"
internal const val SIGNUP_PHONE_COUNTRY_TAG: String = "signup.phone.country"
internal const val SIGNUP_PHONE_ERROR_TAG: String = "signup.phone.error"

private val ROW_MIN_HEIGHT = 56.dp
private val COUNTRY_MIN_HEIGHT = 48.dp
private val SEPARATOR_HEIGHT = 24.dp

/**
 * Le téléphone d'abord (iOS `SignupView+Phone.phoneField`) : le pays (drapeau, indicatif,
 * chevron) et le numéro dans UNE barre de verre au liseré qui passe à l'indigo au focus, le
 * refus en rouge dessous (avec secousse), puis le rappel de ce que le numéro ouvre.
 *
 * Le bouton pays mesure 48 dp au moins et s'annonce « France, +33 » ; son indice d'action est
 * « Changer de pays ». Le champ est piloté par l'état : [onPhoneChange] reçoit la saisie brute
 * (frappe, collage, remplissage), et c'est l'hôte qui épure — un numéro international collé y
 * perd l'indicatif déjà porté par le pays.
 */
@Composable
internal fun SignupPhoneRow(
    country: Country,
    phoneDigits: String,
    onPhoneChange: (String) -> Unit,
    onCountryClick: () -> Unit,
    onFieldLeft: () -> Unit,
    modifier: Modifier = Modifier,
    errorText: String? = null,
    enabled: Boolean = true,
) {
    val tokens = MeeshyTheme.tokens
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    var hadFocus by remember { mutableStateOf(false) }
    val border = AuthFieldBorder.resolve(isFocused = isFocused, hasError = errorText != null)
    val ringColor = when (border.role) {
        AuthFieldBorderRole.BRAND -> MeeshyPalette.Indigo500
        AuthFieldBorderRole.ERROR -> tokens.error
        AuthFieldBorderRole.INPUT -> tokens.inputBorder
    }.let { it.copy(alpha = it.alpha * border.alpha) }
    val shape = RoundedCornerShape(MeeshyRadius.xlPlus)
    val countryLabel = CountryCatalog.accessibilityLabel(country)
    val changeCountryHint = stringResource(R.string.signup_phone_country_hint)
    val phoneLabel = stringResource(R.string.signup_phone_label)
    val benefit = stringResource(R.string.signup_phone_benefit)

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            text = phoneLabel,
            style = MaterialTheme.typography.labelMedium,
            color = tokens.textMuted,
        )
        MeeshyGlassSurface(shape = shape, modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = ROW_MIN_HEIGHT)
                    .border(BorderStroke(if (isFocused) 1.5.dp else 1.dp, ringColor), shape)
                    .padding(start = MeeshySpacing.sm, end = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CountryButton(
                    country = country,
                    description = countryLabel,
                    changeHint = changeCountryHint,
                    enabled = enabled,
                    onChoose = onCountryClick,
                )
                Box(
                    Modifier
                        .padding(horizontal = MeeshySpacing.sm)
                        .size(width = 1.dp, height = SEPARATOR_HEIGHT)
                        .background(tokens.textMuted.copy(alpha = 0.3f)),
                )
                PhoneInput(
                    value = phoneDigits,
                    placeholder = stringResource(R.string.signup_phone_placeholder),
                    label = phoneLabel,
                    errorText = errorText,
                    enabled = enabled,
                    interactionSource = interactionSource,
                    onChange = onPhoneChange,
                    onFocusChange = { focused ->
                        if (hadFocus && !focused) onFieldLeft()
                        hadFocus = focused
                    },
                    modifier = Modifier.weight(1f),
                )
            }
        }
        if (errorText != null) {
            Text(
                text = errorText,
                style = MaterialTheme.typography.labelSmall,
                color = tokens.error,
                modifier = Modifier.testTag(SIGNUP_PHONE_ERROR_TAG),
            )
        }
        ErrorHaptic(errorText)
        Text(
            text = benefit,
            style = MaterialTheme.typography.bodySmall,
            color = tokens.textSecondary,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

@Composable
private fun CountryButton(
    country: Country,
    description: String,
    changeHint: String,
    enabled: Boolean,
    onChoose: () -> Unit,
) {
    Row(
        modifier = Modifier
            .testTag(SIGNUP_PHONE_COUNTRY_TAG)
            .heightIn(min = COUNTRY_MIN_HEIGHT)
            .clearAndSetSemantics {
                contentDescription = description
                role = Role.Button
                onClick(label = changeHint) {
                    if (enabled) onChoose()
                    enabled
                }
            }
            .clickable(enabled = enabled, onClick = onChoose)
            .padding(horizontal = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(text = country.flag, style = MaterialTheme.typography.bodyLarge)
        Text(
            text = country.dialCode,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Icon(
            imageVector = MeeshyIcons.ChevronDown,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.size(16.dp),
        )
    }
}

@Composable
private fun PhoneInput(
    value: String,
    placeholder: String,
    label: String,
    errorText: String?,
    enabled: Boolean,
    interactionSource: MutableInteractionSource,
    onChange: (String) -> Unit,
    onFocusChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    BasicTextField(
        value = value,
        onValueChange = onChange,
        modifier = modifier
            .testTag(SIGNUP_PHONE_FIELD_TAG)
            .autofill(listOf(AutofillType.PhoneNumber), onChange)
            .onFocusChanged { onFocusChange(it.isFocused) }
            .semantics { contentDescription = label; errorText?.let { error(it) } },
        enabled = enabled,
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = MeeshyTheme.tokens.textPrimary),
        cursorBrush = SolidColor(MeeshyPalette.Indigo500),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
        interactionSource = interactionSource,
        decorationBox = { inner ->
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
                if (value.isEmpty()) {
                    Text(
                        text = placeholder,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MeeshyTheme.tokens.textMuted,
                    )
                }
                inner()
            }
        },
    )
}
