package me.meeshy.app.conversations.links

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.launch
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.links.LinksHubEntry
import me.meeshy.sdk.model.links.LinksProfileLink
import me.meeshy.sdk.model.profile.MyAddress
import me.meeshy.sdk.model.profile.MyAddresses
import me.meeshy.ui.component.kit.MeeshyActionGrid
import me.meeshy.ui.component.kit.MeeshyCodeCard
import me.meeshy.ui.component.kit.MeeshyCodeCardSize
import me.meeshy.ui.component.kit.MeeshyCodeCardStyle
import me.meeshy.ui.component.kit.MeeshyCodeCardTilt
import me.meeshy.ui.component.kit.MeeshyLabeledAction
import me.meeshy.ui.component.kit.MeeshyLabeledActionSize
import me.meeshy.ui.component.kit.MeeshySectionHeader
import me.meeshy.ui.component.kit.MeeshyTicket
import me.meeshy.ui.component.kit.MeeshyTicketSize
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le billet « Mon lien de profil » de la face Liens : le lien, son QR (K31) et les trois gestes — copier, montrer le QR, envoyer —
 * en boutons ronds libellés (K32) dans le talon du billet (K30). Les trois gestes passent par [LinkActions], les mêmes que ceux
 * des autres écrans de liens : un seul lien, un seul texte copié, un seul texte envoyé.
 */
@Composable
internal fun LinksProfileTicket(link: LinksProfileLink, actions: LinkActions, onShowQr: () -> Unit, modifier: Modifier = Modifier) {
    val copy = stringResource(R.string.links_face_copy)
    val qr = stringResource(R.string.links_face_qr)
    val send = stringResource(R.string.links_face_send)
    val qrOpen = stringResource(R.string.links_face_qr_open_a11y)
    MeeshyTicket(
        title = stringResource(R.string.links_face_profile_tag),
        code = link.shown,
        modifier = modifier,
        tint = linkAccent(LinksHubEntry.TRACKING.accentHex),
        size = MeeshyTicketSize.Hero,
        figureCaption = stringResource(R.string.links_face_profile_hint),
        trailing = {
            MeeshyCodeCard(
                payload = link.webLink,
                label = qrOpen,
                size = MeeshyCodeCardSize.Mini,
                style = MeeshyCodeCardStyle.Plain,
                tilt = MeeshyCodeCardTilt.None,
                onPress = onShowQr,
            )
        },
        stub = {
            MeeshyActionGrid(
                actions = listOf<@Composable (MeeshyLabeledActionSize) -> Unit>(
                    { size -> MeeshyLabeledAction(title = copy, icon = MeeshyIcons.Copy, onClick = { actions.copy(link.webLink) }, size = size) },
                    { size -> MeeshyLabeledAction(title = qr, icon = MeeshyIcons.QrCode, onClick = onShowQr, size = size) },
                    { size -> MeeshyLabeledAction(title = send, icon = MeeshyIcons.Share, onClick = { actions.share(link.webLink) }, size = size) },
                ),
            )
        },
    )
}

/** Le QR du profil en grand, sur une plaque claire lisible de loin ; l'image du QR s'envoie hors de Meeshy. */
@Composable
internal fun LinksQrDialog(link: LinksProfileLink, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val shareTitle = stringResource(R.string.links_face_qr_share_image)
    Dialog(onDismissRequest = onDismiss) {
        Column(
            Modifier
                .clip(RoundedCornerShape(28.dp))
                .background(MeeshyTheme.tokens.backgroundPrimary)
                .padding(MeeshySpacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            MeeshyCodeCard(
                payload = link.webLink,
                label = stringResource(R.string.links_face_qr_a11y),
                caption = link.shown,
                size = MeeshyCodeCardSize.Large,
                style = MeeshyCodeCardStyle.Plain,
                tilt = MeeshyCodeCardTilt.None,
            )
            TextButton(onClick = {
                scope.launch {
                    QrLinkShare.render(link.webLink)?.let { QrLinkShare.share(context, it, QrFileName.of(link.handle), shareTitle) }
                }
            }) { Text(shareTitle) }
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.links_face_close)) }
        }
    }
}

/** Le nom du fichier du QR : le pseudo, réduit à ce que tout système de fichiers accepte. */
internal object QrFileName {
    fun of(handle: String): String = "meeshy-" + handle.replace(Regex("[^A-Za-z0-9_-]"), "_")
}

/**
 * « Mes adresses » : une rangée de billets compacts, chacun ouvre son site hors de Meeshy. La section n'est posée par l'hôte que
 * si le serveur en sert ; une adresse masquée sur la fiche reste ici, dite en toutes lettres — son propriétaire la retrouve.
 */
@Composable
internal fun LinksAddressesSection(addresses: List<MyAddress>, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val hidden = stringResource(R.string.links_face_address_hidden)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        MeeshySectionHeader(title = stringResource(R.string.links_face_addresses_title), count = addresses.size)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 4.dp)) {
            items(addresses, key = { it.id }) { address ->
                val host = MyAddresses.host(address.url)
                MeeshyTicket(
                    title = address.title,
                    code = host,
                    tint = linkAccent(LinksHubEntry.TRACKING.accentHex),
                    size = MeeshyTicketSize.Compact,
                    figureCaption = if (address.isShown) null else hidden,
                    statusLabel = if (address.isShown) null else hidden,
                    label = stringResource(R.string.links_face_address_a11y, address.title, host),
                    onPress = { openOutside(context, address.url) },
                )
            }
        }
    }
}

private fun openOutside(context: Context, url: String) {
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
