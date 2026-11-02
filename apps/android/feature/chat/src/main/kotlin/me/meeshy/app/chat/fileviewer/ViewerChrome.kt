package me.meeshy.app.chat.fileviewer

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La barre d'une feuille de visionneuse : la croix de fermeture à gauche (une feuille se ferme par sa croix ou en
 * glissant vers le bas), le titre au centre, les actions à droite — la disposition de la barre de navigation iOS.
 */
@Composable
internal fun ViewerBar(
    onClose: () -> Unit,
    accent: Color,
    title: @Composable () -> Unit,
    actions: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        BarButton(MeeshyIcons.Close, stringResource(R.string.share_close), accent, onClose)
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) { title() }
        actions()
    }
}

/** Un bouton de barre : cible de 48 dp, rôle bouton, description lue par TalkBack. */
@Composable
internal fun BarButton(icon: ImageVector, description: String, tint: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = tint, modifier = Modifier.size(22.dp)) }
}
