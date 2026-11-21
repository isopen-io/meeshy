package me.meeshy.app.conversations.links

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.links.LinksHubEntry
import me.meeshy.sdk.model.links.LinksHubFigures
import me.meeshy.sdk.model.links.LinksHubSummary
import me.meeshy.ui.component.kit.MeeshyTicket
import me.meeshy.ui.component.kit.MeeshyTicketSize
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.staggeredAppear

/**
 * La face Liens (iOS `LinksHubView`, entrée du menu flottant) : le billet de mon lien de profil avec son QR et ses trois gestes,
 * « Mes adresses » quand le serveur en sert, puis les quatre familles de liens en billets avec leurs chiffres — chargés en
 * parallèle et animés. Tout se peint d'abord du cache ; un échec garde ce qui était là.
 */
@Composable
fun LinksHubScreen(
    onBack: () -> Unit,
    onOpen: (LinksHubEntry) -> Unit,
    onCreate: (LinksHubEntry) -> Unit,
    viewModel: LinksHubViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val accent = linkAccent(LinksHubEntry.COMMUNITY.accentHex)
    val actions = rememberLinkActions()
    var showsQr by rememberSaveable { mutableStateOf(false) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { viewModel.refresh() }

    LinksPage(
        title = stringResource(R.string.links_hub_title),
        accent = accent,
        onBack = onBack,
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
    ) {
        state.profileLink?.let { link ->
            item(key = "profile-link", contentType = "profile-link") {
                LinksProfileTicket(link = link, actions = actions, onShowQr = { showsQr = true }, modifier = Modifier.staggeredAppear(0))
            }
        }
        if (state.addresses.isNotEmpty()) {
            item(key = "addresses", contentType = "addresses") {
                LinksAddressesSection(addresses = state.addresses, modifier = Modifier.staggeredAppear(1))
            }
        }
        itemsIndexed(LinksHubEntry.entries, key = { _, entry -> entry.name }, contentType = { _, _ -> "card" }) { index, entry ->
            HubCard(
                entry = entry,
                figures = LinksHubSummary.figures(entry, state.figures),
                onOpen = { onOpen(entry) },
                onCreate = { onCreate(entry) },
                modifier = Modifier.staggeredAppear(index + 2),
            )
        }
    }
    val link = state.profileLink
    if (showsQr && link != null) LinksQrDialog(link = link, onDismiss = { showsQr = false })
}

@Composable
private fun HubCard(
    entry: LinksHubEntry,
    figures: LinksHubFigures?,
    onOpen: () -> Unit,
    onCreate: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent = linkAccent(entry.accentHex)
    val haptics = rememberMeeshyHaptics()
    val title = stringResource(entry.titleRes())
    val description = stringResource(entry.descriptionRes())
    val createLabel = entry.createLabelRes()?.let { stringResource(it) }
    val figuresText = figures?.let { figuresText(entry, it) }
    val openCard = { haptics.light(); onOpen() }
    val createCard = { haptics.medium(); onCreate() }

    val createButton: (@Composable () -> Unit)? = if (entry.canCreate) {
        {
            IconButton(onClick = createCard) {
                Icon(MeeshyIcons.AddCircleFilled, contentDescription = createLabel, tint = accent, modifier = Modifier.size(28.dp))
            }
        }
    } else {
        null
    }

    MeeshyTicket(
        title = title,
        code = figuresText ?: description,
        modifier = modifier.semantics {
            if (createLabel != null) customActions = listOf(CustomAccessibilityAction(createLabel) { createCard(); true })
        },
        tint = accent,
        size = MeeshyTicketSize.Row,
        figureCaption = description.takeIf { figuresText != null },
        label = listOfNotNull(title, figuresText, description).joinToString(", "),
        onPress = openCard,
        trailing = createButton,
    )
}

@Composable
private fun figuresText(entry: LinksHubEntry, figures: LinksHubFigures): String {
    val (firstLabel, secondLabel) = entry.figureLabels()
    return "${animatedCount(figures.count)} ${pluralStringResource(firstLabel, figures.count)}" +
        " · ${animatedCount(figures.engagement)} ${pluralStringResource(secondLabel, figures.engagement)}"
}

private fun LinksHubEntry.titleRes(): Int = when (this) {
    LinksHubEntry.SHARE -> R.string.links_hub_share_title
    LinksHubEntry.TRACKING -> R.string.links_hub_tracking_title
    LinksHubEntry.COMMUNITY -> R.string.links_hub_community_title
    LinksHubEntry.AFFILIATE -> R.string.links_hub_affiliate_title
}

private fun LinksHubEntry.descriptionRes(): Int = when (this) {
    LinksHubEntry.SHARE -> R.string.links_hub_share_description
    LinksHubEntry.TRACKING -> R.string.links_hub_tracking_description
    LinksHubEntry.COMMUNITY -> R.string.links_hub_community_description
    LinksHubEntry.AFFILIATE -> R.string.links_hub_affiliate_description
}

private fun LinksHubEntry.createLabelRes(): Int? = when (this) {
    LinksHubEntry.SHARE -> R.string.links_hub_share_create_a11y
    LinksHubEntry.TRACKING -> R.string.links_hub_tracking_create_a11y
    LinksHubEntry.COMMUNITY -> null
    LinksHubEntry.AFFILIATE -> R.string.links_hub_affiliate_create_a11y
}

private fun LinksHubEntry.figureLabels(): Pair<Int, Int> = when (this) {
    LinksHubEntry.SHARE -> R.plurals.links_count_links to R.plurals.links_count_joined
    LinksHubEntry.TRACKING -> R.plurals.links_count_links to R.plurals.links_count_clicks
    LinksHubEntry.COMMUNITY -> R.plurals.links_count_groups to R.plurals.links_count_members
    LinksHubEntry.AFFILIATE -> R.plurals.links_count_links to R.plurals.links_count_signups
}
