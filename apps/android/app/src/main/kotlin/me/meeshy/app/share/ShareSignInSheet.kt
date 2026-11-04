package me.meeshy.app.share

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.app.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Sans session : « Connectez-vous pour envoyer »** (iOS : `ShareSignInPrompt`, fragment 3 de la planche). Android n'a pas de
 * reprise après connexion : rien n'est copié sans session, la feuille le dit (« partagez à nouveau »), et « Ouvrir Meeshy » mène
 * à la connexion.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareSignInSheet(onOpenApp: () -> Unit, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        modifier = modifier,
    ) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.lg),
        ) {
            Text(
                text = stringResource(R.string.share_sheet_sign_in_title),
                style = MaterialTheme.typography.titleMedium,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Spacer(Modifier.height(MeeshySpacing.sm))
            Text(
                text = stringResource(R.string.share_sheet_sign_in_body_reshare),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Spacer(Modifier.height(MeeshySpacing.lg))
            Button(onClick = onOpenApp, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.share_sheet_sign_in_open))
            }
        }
    }
}
