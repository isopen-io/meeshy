package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Vérification du numéro de sécurité (iOS `SecurityVerificationView`). Comme iOS aujourd'hui, aucun
 * numéro n'est calculé ni affiché : iOS passe `safetyNumber: nil` et dit « Vérification indisponible »
 * (« Pas encore disponible : vérifier les numéros de sécurité »). Android n'invente aucune empreinte ;
 * le calcul (libsignal `NumericFingerprintGenerator`) arrive avec l'identité libsignal de ce téléphone (#13015).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SecurityVerificationSheet(conversationName: String, onDismiss: () -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            SheetHeader(stringResource(R.string.security_verify_title), onDismiss)
            Icon(MeeshyIcons.ShieldFilled, contentDescription = null, tint = MeeshyPalette.Indigo400, modifier = Modifier.size(64.dp))
            Text(
                stringResource(R.string.security_verify_description, conversationName),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
            Icon(MeeshyIcons.Hourglass, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(40.dp))
            Text(
                stringResource(R.string.security_verify_unavailable_title),
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                stringResource(R.string.security_verify_unavailable_description),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
                textAlign = TextAlign.Center,
            )
        }
    }
}
