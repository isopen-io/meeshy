package me.meeshy.app.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.ui.component.auth.AnimatedBrandLogo
import me.meeshy.ui.component.auth.BrandSignature
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.formColumnWidth

internal const val WELCOME_CREATE_ACCOUNT_TAG: String = "welcome.createAccount"
internal const val WELCOME_SIGN_IN_TAG: String = "welcome.signIn"

private val BUTTON_MIN_HEIGHT = 52.dp
private val LOGO_SIZE = 100.dp
private val LOGO_STROKE = 10.dp
private const val OUTLINE_ALPHA = 0.6f

/**
 * Le premier écran, au tout premier lancement : deux boutons, une promesse (iOS `WelcomeView`).
 * Sans état : l'hôte décide de sa présence et de ce que chaque bouton ouvre.
 */
@Composable
fun WelcomeScreen(
    onCreateAccount: () -> Unit,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    val tokens = MeeshyTheme.tokens
    MeeshyBackground(modifier.pointerInput(Unit) { detectTapGestures { } }) {
        Column(
            modifier = Modifier.fillMaxSize().systemBarsPadding().formColumnWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(1f))
            AnimatedBrandLogo(
                modifier = Modifier.size(LOGO_SIZE).semantics { contentDescription = "" },
                color = if (MeeshyTheme.isDark) MeeshyPalette.White else MeeshyPalette.Indigo950,
                lineWidth = LOGO_STROKE,
                continuous = false,
            )
            Text(
                text = stringResource(R.string.welcome_brand_name),
                style = MaterialTheme.typography.displaySmall.copy(brush = MeeshyGradients.brand),
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = MeeshySpacing.xxl).semantics { heading() },
            )
            Text(
                text = stringResource(R.string.welcome_tagline),
                style = MaterialTheme.typography.bodyLarge,
                color = tokens.textSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = MeeshySpacing.xxxl).padding(top = MeeshySpacing.md),
            )
            Spacer(Modifier.weight(1f))
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xxxl),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                CreateAccountButton(onClick = { haptics.medium(); onCreateAccount() })
                SignInButton(onClick = { haptics.light(); onSignIn() })
            }
            BrandSignature(modifier = Modifier.padding(vertical = MeeshySpacing.xl))
        }
    }
}

@Composable
private fun CreateAccountButton(onClick: () -> Unit) {
    val label = stringResource(R.string.welcome_createAccount)
    val hint = stringResource(R.string.welcome_createAccount_hint)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = BUTTON_MIN_HEIGHT)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyGradients.brand)
            .clickable(onClickLabel = hint, role = Role.Button, onClick = onClick)
            .testTag(WELCOME_CREATE_ACCOUNT_TAG),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MeeshyPalette.White,
            modifier = Modifier.padding(vertical = MeeshySpacing.md),
        )
    }
}

@Composable
private fun SignInButton(onClick: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val label = stringResource(R.string.welcome_signIn)
    val hint = stringResource(R.string.welcome_signIn_hint)
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = BUTTON_MIN_HEIGHT)
            .clip(shape)
            .border(BorderStroke(1.dp, tokens.inputBorder.copy(alpha = OUTLINE_ALPHA)), shape)
            .clickable(onClickLabel = hint, role = Role.Button, onClick = onClick)
            .testTag(WELCOME_SIGN_IN_TAG),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textPrimary,
            modifier = Modifier.padding(vertical = MeeshySpacing.md),
        )
    }
}
