package me.meeshy.ui.component.permission

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.PermissionSurface
import me.meeshy.ui.R
import me.meeshy.ui.component.chrome.MeeshyCard
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La carte d'un refus définitif : elle dit QUELLE permission activer (« Accès au micro
 * refusé ») et propose « Ouvrir les Réglages », qui ouvre les détails de l'application. Elle
 * remplace le « accès refusé » générique qui n'apprend rien à l'utilisateur.
 */
@Composable
public fun PermissionDeniedCard(
    nature: PermissionNature,
    onOpenSettings: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    accent: Color = MeeshyPalette.Indigo500,
) {
    val copy = MediaPermissionMessages.copy(nature, PermissionSurface.DENIED)
    MeeshyCard(modifier = modifier.fillMaxWidth()) {
        PermissionPanel(
            nature = nature,
            title = stringResource(copy.title),
            body = stringResource(copy.body),
            primaryLabel = stringResource(copy.action),
            onPrimary = onOpenSettings,
            secondaryLabel = stringResource(R.string.media_permission_close),
            onSecondary = onDismiss,
            accent = accent,
        )
    }
}
