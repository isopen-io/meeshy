package me.meeshy.app.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddLink
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.DynamicFeed
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.DynamicFeed
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import me.meeshy.app.R
import me.meeshy.sdk.model.chrome.FloatingButtonPosition
import me.meeshy.sdk.model.chrome.menuGrowsRightward
import me.meeshy.sdk.model.chrome.menuUnfoldsUpward
import me.meeshy.ui.component.chrome.MeeshyFloatingButtons
import me.meeshy.ui.component.chrome.MeeshyMenuFab
import me.meeshy.ui.component.chrome.RadialMenuItem
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor

/**
 * Les entrees de l'echelle deployee, dans l'ordre, par cle de libelle.
 *
 * Extrait de [rememberMenuLadderItems] — qui est @Composable, donc hors de portee
 * d'un test JVM — pour que la regle « 6 barreaux » soit verifiable. Communautes
 * est differee (aucune destination Android n'existe encore) ; Reels et les
 * autres sections a bouton dedie (Feed, Conversations) n'y figurent plus.
 * Contacts (`menu_contacts`) reste ici : c'est le SEUL acces restant a l'onglet
 * Contacts par defaut depuis que l'icone People a quitte l'en-tete Conversations
 * (§ doc du composant appelant) — le retirer des deux endroits a la fois
 * rendrait l'onglet inatteignable en moins de trois gestes.
 */
internal fun menuLadderLabelKeys(): List<String> = listOf(
    "menu_my_links",
    "menu_notifications",
    "tab_calls",
    "menu_discover",
    "menu_contacts",
    "menu_settings",
)

/**
 * Ou mene un tap sur le bouton gauche flottant, etant donne la route courante.
 *
 * Parite iOS : `RootView.draggableFloatingButtons.onLeftTap` fait
 * `showFeed.toggle()` — un aller-retour Flux <-> Conversations sur le MEME
 * bouton. Avant ce fix, le bouton Android naviguait TOUJOURS vers [Routes.FEED],
 * quelle que soit la route courante : un tap depuis le Flux ne ramenait jamais
 * aux Conversations (seul le bouton retour systeme le faisait). Extrait de
 * `MeeshyApp` — qui est @Composable, donc hors de portee d'un test JVM — pour
 * que la regle de bascule soit verifiable.
 */
internal fun leftButtonTapTarget(currentRoute: String?): String =
    if (currentRoute == Routes.FEED) Routes.CONVERSATIONS else Routes.FEED

/**
 * Parite iOS : la barre d'onglets est remplacee par DEUX boutons flottants
 * deplacables. Cette echelle est le contenu deploye du bouton DROIT ; le bouton
 * gauche mene au Flux (tap) et aux Reels (appui long).
 *
 * Sort des barreaux retires (Loi 4 — aucune fonction perdue) : « Nouvelle
 * conversation » est une action de l'en-tete de l'ecran Conversations
 * (`ConversationHeaderAction.NEW_CONVERSATION`, le FAB a ete retire) ;
 * « Conversations » est l'ecran d'accueil, deja atteint par le bouton gauche ;
 * « Contacts » (onglet par defaut) est CE barreau (`menu_contacts` ->
 * [Routes.CONTACTS]) — l'icone People a quitte le TopAppBar de l'ecran
 * Conversations, redondante avec un acces deja a portee d'un tap sur tout
 * ecran ; il reste aussi joignable depuis le Dashboard (bouton People de la
 * barre de recherche -> `DashboardScreen.onContacts`) et depuis le barreau
 * Decouvrir (onglet `ContactsTab.Discover` du meme `ContactsScreen`), mais ce
 * barreau-ci est le chemin nominal a un geste ; « Reels » n'est plus
 * atteignable QUE par appui long sur le bouton gauche, parite iOS stricte.
 * « Communautes » est differe : aucune destination Android n'existe encore
 * (§ constat racine du lot).
 */
@Composable
private fun rememberMenuLadderItems(
    navController: NavController,
    unreadNotifications: Int,
    pendingFriendRequests: Int,
): List<RadialMenuItem> {
    val myLinks = stringResource(R.string.menu_my_links)
    val notifications = stringResource(R.string.menu_notifications)
    val calls = stringResource(R.string.tab_calls)
    val discover = stringResource(R.string.menu_discover)
    val contacts = stringResource(R.string.menu_contacts)
    val settings = stringResource(R.string.menu_settings)
    return remember(
        myLinks,
        notifications,
        calls,
        discover,
        contacts,
        settings,
        unreadNotifications,
        pendingFriendRequests,
    ) {
        fun tab(route: String): () -> Unit = {
            navController.navigate(route) {
                popUpTo(navController.graph.startDestinationId) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        }
        listOf(
            RadialMenuItem(Icons.Filled.AddLink, myLinks, hexColor("#F8B500")) {
                navController.navigate(Routes.MY_SHARE_LINKS)
            },
            RadialMenuItem(
                icon = Icons.Filled.Notifications,
                label = notifications,
                color = hexColor("#FF6B6B"),
                badgeCount = unreadNotifications,
                onSelect = tab(Routes.NOTIFICATIONS),
            ),
            RadialMenuItem(Icons.Filled.Call, calls, MeeshyPalette.Indigo500, onSelect = tab(Routes.CALLS)),
            RadialMenuItem(
                icon = Icons.Filled.PersonSearch,
                label = discover,
                color = hexColor("#8B5CF6"),
                badgeCount = pendingFriendRequests,
            ) { navController.navigate(Routes.CONTACTS_DISCOVER) },
            RadialMenuItem(Icons.Filled.People, contacts, MeeshyPalette.PinnedBlue) {
                navController.navigate(Routes.CONTACTS)
            },
            RadialMenuItem(Icons.Filled.Settings, settings, hexColor("#64748B"), onSelect = tab(Routes.SETTINGS)),
        )
    }
}

/**
 * Les deux boutons flottants ET tout ce qui derive du [ChromeViewModel] (avatar,
 * badges, echelle) — isoles dans LEUR PROPRE scope de recomposition, pas celui de
 * [MeeshyApp]. Sans cette isolation, `chromeUnread`/`chromeCurrentUser` etaient lus
 * au niveau racine de MeeshyApp : toute variation (une notification qui arrive)
 * invalidait le corps ENTIER de la fonction, y compris le lambda `builder` passe a
 * `NavHost` — qui perd alors son identite et force Compose a reconstruire tout le
 * graphe de navigation (30 destinations) pour un changement qui ne concerne qu'une
 * pastille de 18dp. [hiltViewModel] resout ICI la MEME instance Activity-scopee
 * que celle deja hoistee dans [MeeshyApp] (l'amorçage y reste, lui, inconditionnel
 * — voir le commentaire sur `chromeViewModel` la-bas) : appeler `hiltViewModel()`
 * une seconde fois pour la meme classe, sous le meme [androidx.lifecycle.ViewModelStoreOwner],
 * rend l'instance DEJA existante, jamais une nouvelle.
 */
@Composable
internal fun MeeshyFloatingChrome(
    navController: NavController,
    currentRoute: String?,
    leftButtonPosition: FloatingButtonPosition,
    rightButtonPosition: FloatingButtonPosition,
    onLeftPositionChange: (FloatingButtonPosition) -> Unit,
    onRightPositionChange: (FloatingButtonPosition) -> Unit,
) {
    val chromeViewModel: ChromeViewModel = hiltViewModel()
    val chromeCurrentUser by chromeViewModel.currentUser.collectAsStateWithLifecycle()
    val chromeUnread by chromeViewModel.unreadNotifications.collectAsStateWithLifecycle()
    val chromePendingFriendRequests by chromeViewModel.pendingFriendRequests.collectAsStateWithLifecycle()
    var menuExpanded by rememberSaveable { mutableStateOf(false) }
    val ladderItems = rememberMenuLadderItems(navController, chromeUnread, chromePendingFriendRequests)
    val navigateToProfile: () -> Unit = {
        chromeCurrentUser?.id?.let { userId ->
            navController.navigate(Routes.profile(userId)) {
                popUpTo(navController.graph.startDestinationId) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        }
    }

    MeeshyFloatingButtons(
        leftPosition = leftButtonPosition,
        rightPosition = rightButtonPosition,
        onLeftPositionChange = onLeftPositionChange,
        onRightPositionChange = onRightPositionChange,
        // Tap : bascule Flux <-> Conversations (parite iOS
        // `showFeed.toggle()`) via le NavHost, avec la meme semantique
        // save/restore que les autres destinations de premier niveau.
        onLeftTap = {
            navController.navigate(leftButtonTapTarget(currentRoute)) {
                popUpTo(navController.graph.startDestinationId) { saveState = true }
                launchSingleTop = true
                restoreState = true
            }
        },
        // Appui long : les Reels. Geste identique a celui d'iOS.
        onLeftLongPress = { navController.navigate(Routes.reels()) },
        // Tap 1 (menu ferme) : ouvre l'echelle — c'est le SEUL etat ou ce
        // lambda peut s'executer : [MeeshyMenuFab] intercepte lui-meme le tap 2
        // via [onAnchorTapWhileExpanded] ci-dessous pendant que l'echelle est
        // deployee (son Popup, touch-modal, ne laisse plus jamais ce
        // combinedClickable recevoir l'evenement dans cet etat).
        onRightTap = { menuExpanded = true },
        // Appui long sur l'avatar : raccourci direct vers le profil, sans
        // passer par le menu.
        onRightLongPress = {
            menuExpanded = false
            navigateToProfile()
        },
        leftContentDescription = stringResource(R.string.tab_feed),
        leftStateDescription = if (currentRoute == Routes.FEED) stringResource(R.string.a11y_state_open) else null,
        rightContentDescription = if (chromeUnread > 0) {
            stringResource(R.string.a11y_floating_menu_unread, chromeUnread)
        } else {
            stringResource(R.string.a11y_floating_menu)
        },
        rightAccessibilityActions = listOf(
            stringResource(R.string.a11y_edit_profile) to navigateToProfile,
        ),
        leftContent = {
            // Icone de FLUX, pas de maison : ce bouton mene au Feed (et aux
            // Reels par appui long), une maison promettait un "home" qui
            // n'existe pas. Filled quand le Flux est la destination active
            // (on peut taper pour en repartir), outline sinon (un tap y
            // mene) — le seul signal visuel de bascule que ce bouton porte.
            Icon(
                imageVector = if (currentRoute == Routes.FEED) Icons.Filled.DynamicFeed else Icons.Outlined.DynamicFeed,
                contentDescription = null,
                tint = MeeshyPalette.Success,
            )
        },
        rightContent = {
            // Etat HISSE: le menu s'ouvre du premier tap, comme sur iOS.
            // Direction et cote de deploiement suivent la POSITION de la
            // pastille (geometrie pure core:model) : vers le haut si elle
            // est en bas, libelles tournes vers l'interieur de l'ecran.
            MeeshyMenuFab(
                items = ladderItems,
                expanded = menuExpanded,
                onExpandedChange = { menuExpanded = it },
                unfoldUpward = menuUnfoldsUpward(rightButtonPosition),
                growRightward = menuGrowsRightward(rightButtonPosition),
                collapsedContent = { expanded ->
                    ChromeAvatarButton(
                        user = chromeCurrentUser,
                        avatarUrl = chromeViewModel.avatarModel(chromeCurrentUser),
                        unreadCount = chromeUnread,
                        menuExpanded = expanded,
                    )
                },
                onAnchorTapWhileExpanded = navigateToProfile,
            )
        },
    )
}

internal val tabRoutes = setOf(Routes.CONVERSATIONS, Routes.FEED, Routes.CALLS, Routes.NOTIFICATIONS, Routes.SETTINGS)
