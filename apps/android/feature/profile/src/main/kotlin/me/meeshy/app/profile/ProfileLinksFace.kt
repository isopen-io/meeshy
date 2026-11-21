package me.meeshy.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.ui.component.kit.MeeshyActionGrid
import me.meeshy.ui.component.kit.MeeshyLabeledAction
import me.meeshy.ui.component.kit.MeeshyLabeledActionSize
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La face Liens d'un autre (loi 1) : son lien de profil — celui qui ouvre sa vitrine en vue Public —, copié, montré en QR ou
 * envoyé. Sans lien partageable (pseudo vide) la face le dit au lieu de rester muette. Le lien vient de [ProfileSharePresentation],
 * le même que celui de ma propre fiche : le QR, le texte copié et le texte partagé ne peuvent pas diverger.
 */
@Composable
internal fun ProfileLinksFace(
    share: ProfileSharePresentation?,
    level: RelationLevel?,
    onOpenCircle: () -> Unit,
    onOpenShare: () -> Unit,
) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxl)) {
        FaceHeader(title = stringResource(R.string.fiche_face_links), level = level, onOpenCircle = onOpenCircle)
        if (share == null) {
            Text(
                text = stringResource(R.string.fiche_links_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
            return@Column
        }
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            SectionHeading(stringResource(R.string.fiche_links_title))
            Text(
                text = share.webLink,
                style = MaterialTheme.typography.titleMedium,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                text = stringResource(R.string.fiche_links_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        LinkActions(webLink = share.webLink, onOpenShare = onOpenShare)
    }
}

@Composable
private fun LinkActions(webLink: String, onOpenShare: () -> Unit) {
    val clipboard = LocalClipboardManager.current
    val copy = stringResource(R.string.fiche_links_copy)
    val qr = stringResource(R.string.fiche_links_qr)
    val send = stringResource(R.string.fiche_links_send)
    MeeshyActionGrid(
        actions = listOf<@Composable (MeeshyLabeledActionSize) -> Unit>(
            { size -> MeeshyLabeledAction(title = copy, icon = MeeshyIcons.Copy, onClick = { clipboard.setText(AnnotatedString(webLink)) }, size = size) },
            { size -> MeeshyLabeledAction(title = qr, icon = MeeshyIcons.QrCode, onClick = onOpenShare, size = size) },
            { size -> MeeshyLabeledAction(title = send, icon = MeeshyIcons.Share, onClick = onOpenShare, size = size) },
        ),
    )
}
