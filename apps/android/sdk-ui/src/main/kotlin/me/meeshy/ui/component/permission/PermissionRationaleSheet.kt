package me.meeshy.ui.component.permission

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.PermissionSurface
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La feuille qui explique AVANT que la boîte système n'apparaisse : le texte d'usage de la
 * permission (celui de l'iOS), « Continuer » pour passer à la demande système, « Pas
 * maintenant » pour y renoncer. Rien ne s'affiche si l'accès est déjà accordé.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun PermissionRationaleSheet(
    nature: PermissionNature,
    onContinue: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    accent: Color = MeeshyPalette.Indigo500,
) {
    val copy = MediaPermissionMessages.copy(nature, PermissionSurface.RATIONALE)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = modifier,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        PermissionPanel(
            nature = nature,
            title = stringResource(copy.title),
            body = stringResource(copy.body),
            primaryLabel = stringResource(copy.action),
            onPrimary = onContinue,
            secondaryLabel = stringResource(R.string.media_permission_not_now),
            onSecondary = onDismiss,
            accent = accent,
        )
    }
}
