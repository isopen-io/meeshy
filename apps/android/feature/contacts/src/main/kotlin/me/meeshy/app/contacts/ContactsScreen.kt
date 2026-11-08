package me.meeshy.app.contacts

import androidx.annotation.StringRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.component.chrome.MeeshyBackground
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.contacts.circles.CirclesTab
import me.meeshy.feature.contacts.R
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.component.chrome.leadingNavigationIcon
import me.meeshy.ui.component.chrome.leadingNavigationLabel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactsScreen(
    onBack: () -> Unit,
    initialTab: ContactsTab? = null,
    onOpenProfile: (userId: String) -> Unit = {},
    viewModel: ContactsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Ouverture ciblee (Reglages -> Utilisateurs bloques) : selectionner l'onglet
    // demande UNE fois a l'entree, sans voler la main a la navigation interne.
    androidx.compose.runtime.LaunchedEffect(initialTab) {
        initialTab?.let(viewModel::selectTab)
    }
    val tabs = ContactsTab.entries
    val selectedIndex = tabs.indexOf(state.selectedTab)

    MeeshyBackground {
    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    scrolledContainerColor = Color.Transparent,
                    titleContentColor = MeeshyTheme.tokens.textPrimary,
                    navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                ),
                title = { Text(stringResource(R.string.contacts_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            leadingNavigationIcon(),
                            contentDescription = leadingNavigationLabel(stringResource(R.string.contacts_back)),
                        )
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            ScrollableTabRow(
                selectedTabIndex = selectedIndex,
                containerColor = Color.Transparent,
                edgePadding = 0.dp,
            ) {
                tabs.forEachIndexed { index, tab ->
                    val badge = if (tab == ContactsTab.Requests) state.pendingReceivedCount else 0
                    Tab(
                        selected = index == selectedIndex,
                        onClick = { viewModel.selectTab(tab) },
                        text = {
                            BadgedBox(badge = { RequestsCountBadge(count = badge) }) {
                                Text(stringResource(tab.labelRes), maxLines = 1, softWrap = false)
                            }
                        },
                    )
                }
            }
            when (state.selectedTab) {
                ContactsTab.Contacts -> ContactsListTab(onOpenProfile = onOpenProfile)
                ContactsTab.Circles -> CirclesTab(onFindContacts = { viewModel.selectTab(ContactsTab.Discover) })
                ContactsTab.Requests -> RequestsTab(onOpenProfile = onOpenProfile)
                ContactsTab.Discover -> DiscoverTab(onOpenProfile = onOpenProfile)
                ContactsTab.Blocked -> BlockedTab(onOpenProfile = onOpenProfile)
            }
        }
    }
    }
}

/** The pending-requests count pops in and out instead of snapping (a request received live, the last one answered). */
@Composable
private fun RequestsCountBadge(count: Int) {
    val lastShown = remember { intArrayOf(count) }
    if (count > 0) lastShown[0] = count
    AnimatedVisibility(visible = count > 0, enter = scaleIn() + fadeIn(), exit = scaleOut() + fadeOut()) {
        Badge { Text(lastShown[0].toString()) }
    }
}

@get:StringRes
private val ContactsTab.labelRes: Int
    get() = when (this) {
        ContactsTab.Contacts -> R.string.contacts_tab_contacts
        ContactsTab.Circles -> R.string.contacts_tab_circles
        ContactsTab.Requests -> R.string.contacts_tab_requests
        ContactsTab.Discover -> R.string.contacts_tab_discover
        ContactsTab.Blocked -> R.string.contacts_tab_blocked
    }
