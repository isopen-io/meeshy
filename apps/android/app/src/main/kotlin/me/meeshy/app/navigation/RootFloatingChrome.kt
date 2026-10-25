package me.meeshy.app.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import kotlinx.coroutines.launch
import me.meeshy.app.R
import me.meeshy.sdk.chrome.FloatingButtonPositionStore
import me.meeshy.sdk.model.chrome.FloatingMenuLadder
import me.meeshy.ui.component.auth.AnimatedBrandLogo
import me.meeshy.ui.component.chrome.FloatingButtonSemantics
import me.meeshy.ui.component.chrome.FloatingButtonSize
import me.meeshy.ui.component.chrome.MeeshyFloatingButtons
import me.meeshy.ui.component.chrome.MeeshyMenuLadder
import me.meeshy.ui.component.chrome.MeeshyMenuVeil
import me.meeshy.ui.component.chrome.RadialMenuItem
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor

/**
 * Les deux boutons flottants (Flux a gauche, avatar a droite) et l'echelle du menu — portage de
 * `RootFloatingChrome.swift`. Isoles dans LEUR PROPRE scope de recomposition : avatar, badges,
 * positions et echelle sont lus ICI, jamais dans `MeeshyApp` — sinon une notification qui arrive
 * invaliderait le lambda `builder` du NavHost et reconstruirait tout le graphe. [hiltViewModel]
 * resout ici la MEME instance Activity-scopee de [ChromeViewModel] que celle hissee dans `MeeshyApp`.
 *
 * Gestes (parite iOS) : Flux tap = bascule Flux <-> Conversations, appui long = Reels ; avatar
 * tap = deplie l'echelle, second tap ou appui long = MA page de profil ([floatingAvatarProfileRoute]).
 * Un tap sur le voile, ou le retour systeme, referme l'echelle.
 */
@Composable
internal fun MeeshyFloatingChrome(
    navController: NavController,
    currentRoute: String?,
    floatingButtonPositions: FloatingButtonPositionStore,
) {
    val chromeViewModel: ChromeViewModel = hiltViewModel()
    val currentUser by chromeViewModel.currentUser.collectAsStateWithLifecycle()
    val unread by chromeViewModel.unreadNotifications.collectAsStateWithLifecycle()
    val pendingFriendRequests by chromeViewModel.pendingFriendRequests.collectAsStateWithLifecycle()
    val leftStorage by floatingButtonPositions.leftStorage.collectAsStateWithLifecycle()
    val rightStorage by floatingButtonPositions.rightStorage.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var menuExpanded by rememberSaveable { mutableStateOf(false) }
    val feedOpen = currentRoute == Routes.FEED
    val ladderItems = rememberMenuLadderItems(navController, unread, pendingFriendRequests)
    val navigateToProfile: () -> Unit = {
        floatingAvatarProfileRoute(currentUser?.id)?.let { route -> navController.navigateToTopLevel(route) }
    }

    BackHandler(enabled = menuExpanded) { menuExpanded = false }

    val itemHint = stringResource(R.string.a11y_menu_item_hint)
    MeeshyFloatingButtons(
        leftStorage = leftStorage,
        rightStorage = rightStorage,
        onLeftStorageChange = { scope.launch { floatingButtonPositions.setLeftStorage(it) } },
        onRightStorageChange = { scope.launch { floatingButtonPositions.setRightStorage(it) } },
        onLeftTap = { navController.navigateToTopLevel(leftButtonTapTarget(currentRoute)) },
        onLeftLongPress = { navController.navigate(Routes.reels()) },
        onRightTap = {
            if (menuExpanded) {
                menuExpanded = false
                navigateToProfile()
            } else {
                menuExpanded = true
            }
        },
        onRightLongPress = {
            menuExpanded = false
            navigateToProfile()
        },
        leftSemantics = FloatingButtonSemantics(
            label = stringResource(R.string.tab_feed),
            hint = stringResource(R.string.a11y_floating_feed_hint),
            value = if (feedOpen) stringResource(R.string.a11y_state_open) else null,
        ),
        rightSemantics = FloatingButtonSemantics(
            label = stringResource(R.string.a11y_floating_menu),
            hint = stringResource(R.string.a11y_floating_menu_hint),
            value = if (unread > 0) stringResource(R.string.a11y_floating_menu_notifications_value, unread) else null,
            actionName = stringResource(R.string.a11y_edit_profile),
        ),
        behindButtons = { MeeshyMenuVeil(expanded = menuExpanded, onDismiss = { menuExpanded = false }) },
        aboveButtons = { geometry, layout ->
            MeeshyMenuLadder(
                items = ladderItems,
                expanded = menuExpanded,
                menuCenter = layout.menu,
                opensDownward = geometry.menuOpensDownward(layout.menu, FloatingMenuLadder.extent(ladderItems.size)),
                itemHint = itemHint,
                onDismiss = { menuExpanded = false },
            )
        },
        leftContent = { FeedButtonFace(feedOpen = feedOpen) },
        rightContent = {
            ChromeAvatarButton(
                user = currentUser,
                avatarUrl = chromeViewModel.avatarModel(currentUser),
                unreadCount = unread,
                menuExpanded = menuExpanded,
            )
        },
    )
}

/** Le degrade du disque Flux : erreur -> indigo300, du haut-gauche au bas-droite. */
internal fun feedButtonGradientColors(): List<Color> = listOf(MeeshyPalette.Error, MeeshyPalette.Indigo300)

/** Le disque Flux : cercle plein degrade, pile blanche — le logo anime quand le Flux est ouvert. */
@Composable
private fun FeedButtonFace(feedOpen: Boolean) {
    Box(
        modifier = Modifier
            .size(FloatingButtonSize)
            .background(Brush.linearGradient(feedButtonGradientColors()), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (feedOpen) {
            AnimatedBrandLogo(
                modifier = Modifier.size(MeeshyIconSize.xxxl),
                color = MeeshyPalette.White,
                lineWidth = 3.dp,
                continuous = true,
            )
        } else {
            Icon(
                imageVector = FeedButtonIcon,
                contentDescription = null,
                tint = MeeshyPalette.White,
                modifier = Modifier.size(MeeshyIconSize.xxl),
            )
        }
    }
}

/** Les destinations de premier niveau gardent leur etat (meme semantique que les onglets d'avant). */
private fun NavController.navigateToTopLevel(route: String) {
    navigate(route) {
        popUpTo(graph.startDestinationId) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

@Composable
private fun RootMenuLadderEntry.label(): String = stringResource(
    when (this) {
        RootMenuLadderEntry.LINKS -> R.string.menu_my_links
        RootMenuLadderEntry.NOTIFICATIONS -> R.string.menu_notifications
        RootMenuLadderEntry.CALLS -> R.string.tab_calls
        RootMenuLadderEntry.DISCOVER -> R.string.menu_discover
        RootMenuLadderEntry.COMMUNITIES -> R.string.menu_communities
        RootMenuLadderEntry.CONTACTS -> R.string.menu_contacts
        RootMenuLadderEntry.SETTINGS -> R.string.menu_settings
    },
)

private fun NavController.openLadderEntry(entry: RootMenuLadderEntry) {
    when (entry) {
        RootMenuLadderEntry.LINKS -> navigate(Routes.MY_SHARE_LINKS)
        RootMenuLadderEntry.NOTIFICATIONS -> navigateToTopLevel(Routes.NOTIFICATIONS)
        RootMenuLadderEntry.CALLS -> navigateToTopLevel(Routes.CALLS)
        RootMenuLadderEntry.DISCOVER -> navigate(Routes.CONTACTS_DISCOVER)
        // Aucune destination tant que COMMUNITIES_AVAILABLE est faux (le barreau n'est pas monte).
        RootMenuLadderEntry.COMMUNITIES -> Unit
        RootMenuLadderEntry.CONTACTS -> navigate(Routes.CONTACTS)
        RootMenuLadderEntry.SETTINGS -> navigateToTopLevel(Routes.SETTINGS)
    }
}

/** Les barreaux de l'echelle, resolus depuis les descripteurs purs de [rootMenuLadderEntries]. */
@Composable
private fun rememberMenuLadderItems(
    navController: NavController,
    unreadNotifications: Int,
    pendingFriendRequests: Int,
): List<RadialMenuItem> {
    val entries = remember { rootMenuLadderEntries() }
    val labels = entries.map { it.label() }
    return remember(labels, unreadNotifications, pendingFriendRequests) {
        entries.mapIndexed { index, entry ->
            RadialMenuItem(
                icon = entry.icon(),
                label = labels[index],
                color = hexColor(entry.colorHex),
                badgeCount = entry.badgeCount(unreadNotifications, pendingFriendRequests),
                onSelect = { navController.openLadderEntry(entry) },
            )
        }
    }
}
