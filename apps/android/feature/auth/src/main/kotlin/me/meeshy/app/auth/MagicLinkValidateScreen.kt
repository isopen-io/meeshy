package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Atterrissage du deep link magic link (`meeshy://auth/magic-link?token=` /
 * `https://meeshy.me/auth/magic-link?token=`) : valide le token aupres du
 * gateway et ouvre la session. Trois etats, rien d'autre : validation en cours,
 * connecte (bascule automatique), lien invalide/expire (retour au login).
 */
@Composable
fun MagicLinkValidateScreen(
    onAuthenticated: () -> Unit,
    onBackToLogin: () -> Unit,
    viewModel: MagicLinkValidateViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.isAuthenticated) {
        if (state.isAuthenticated) onAuthenticated()
    }

    MeeshyBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                // Cet ecran n'a pas de Scaffold : depuis que le Scaffold racine ne
                // reserve plus les barres systeme (MeeshyApp.kt, contentWindowInsets
                // a zero), il pose lui-meme son inset. Le fond reste PLEIN ECRAN,
                // seul le CONTENU est retreci — c'est exactement la geometrie
                // d'avant, le degrade en plus.
                .systemBarsPadding()
                .padding(horizontal = MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            when {
                state.isValidating -> {
                    CircularProgressIndicator(color = MeeshyPalette.Indigo500)
                    Text(
                        text = stringResource(R.string.auth_magic_validating),
                        style = MaterialTheme.typography.titleMedium,
                        color = MeeshyTheme.tokens.textPrimary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = MeeshySpacing.lg),
                    )
                }
                state.isAuthenticated -> {
                    Icon(
                        imageVector = Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = MeeshyPalette.Success,
                        modifier = Modifier.size(56.dp),
                    )
                    Text(
                        text = stringResource(R.string.auth_magic_success),
                        style = MaterialTheme.typography.titleMedium,
                        color = MeeshyTheme.tokens.textPrimary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = MeeshySpacing.lg),
                    )
                }
                else -> {
                    Icon(
                        imageVector = Icons.Filled.ErrorOutline,
                        contentDescription = null,
                        tint = MeeshyPalette.Error,
                        modifier = Modifier.size(56.dp),
                    )
                    Text(
                        text = state.errorMessage ?: stringResource(R.string.auth_magic_invalid),
                        style = MaterialTheme.typography.titleMedium,
                        color = MeeshyTheme.tokens.textPrimary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = MeeshySpacing.lg),
                    )
                    TextButton(onClick = onBackToLogin, modifier = Modifier.padding(top = MeeshySpacing.md)) {
                        Text(stringResource(R.string.auth_back_to_login))
                    }
                }
            }
        }
    }
}
