package me.meeshy.app.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddLink
import androidx.compose.material.icons.filled.AutoAwesomeMotion
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.sdk.model.chrome.RootChromeVisibility

/** Compteur vivant affiche en pastille sur un barreau — miroir de `RootMenuBadge` iOS. */
internal enum class RootMenuBadge { UNREAD_NOTIFICATIONS, PENDING_FRIEND_REQUESTS }

/**
 * Un barreau de l'echelle du bouton avatar — description PURE (cle de libelle, couleur,
 * pastille), miroir de `RootMenuLadderEntry.swift`, donc testable sans Compose.
 *
 * Le profil n'a PAS de barreau : il s'ouvre par le second tap (ou l'appui long) sur l'avatar.
 * Le DERNIER barreau est la roue dentee. [CONTACTS] ne tient la place de [COMMUNITIES] que si
 * la destination Communautes n'est pas montee (`communitiesAvailable = false`).
 */
internal enum class RootMenuLadderEntry(val labelKey: String, val colorHex: String, val badge: RootMenuBadge?) {
    LINKS("menu_my_links", "#F8B500", null),
    NOTIFICATIONS("menu_notifications", "#FF6B6B", RootMenuBadge.UNREAD_NOTIFICATIONS),
    CALLS("tab_calls", "#6366F1", null),
    DISCOVER("menu_discover", "#8B5CF6", RootMenuBadge.PENDING_FRIEND_REQUESTS),
    COMMUNITIES("menu_communities", "#2ECC71", null),
    CONTACTS("menu_contacts", "#3B82F6", null),
    SETTINGS("menu_settings", "#64748B", null),
    ;

    /** La valeur de la pastille, resolue au rendu ; 0 = pas de pastille. */
    fun badgeCount(unreadNotifications: Int, pendingFriendRequests: Int): Int = when (badge) {
        RootMenuBadge.UNREAD_NOTIFICATIONS -> unreadNotifications.coerceAtLeast(0)
        RootMenuBadge.PENDING_FRIEND_REQUESTS -> pendingFriendRequests.coerceAtLeast(0)
        null -> 0
    }
}

/** L'icone du barreau — pendant Material des SF Symbols de `RootMenuLadderEntry.icon` iOS. */
internal fun RootMenuLadderEntry.icon(): ImageVector = when (this) {
    RootMenuLadderEntry.LINKS -> Icons.Filled.AddLink
    RootMenuLadderEntry.NOTIFICATIONS -> Icons.Filled.Notifications
    RootMenuLadderEntry.CALLS -> Icons.Filled.Call
    RootMenuLadderEntry.DISCOVER -> Icons.Filled.PersonSearch
    RootMenuLadderEntry.COMMUNITIES -> Icons.Filled.Groups
    RootMenuLadderEntry.CONTACTS -> Icons.Filled.People
    RootMenuLadderEntry.SETTINGS -> Icons.Filled.Settings
}

/** La pile blanche du disque Flux (`square.stack.fill` iOS). */
internal val FeedButtonIcon: ImageVector get() = Icons.Filled.AutoAwesomeMotion

/**
 * Android a son ecran Communautes (`:feature:community`) : le barreau Communautes prend la place de
 * Contacts, comme sur iOS. Contacts reste a un geste par Decouvrir, dont l'ecran porte ses onglets.
 */
internal const val COMMUNITIES_AVAILABLE: Boolean = true

/** L'ordre de l'echelle : Mes liens, Notifications, Appels, Decouvrir, Communautes (ou Contacts), Reglages. */
internal fun rootMenuLadderEntries(communitiesAvailable: Boolean = COMMUNITIES_AVAILABLE): List<RootMenuLadderEntry> =
    listOf(
        RootMenuLadderEntry.LINKS,
        RootMenuLadderEntry.NOTIFICATIONS,
        RootMenuLadderEntry.CALLS,
        RootMenuLadderEntry.DISCOVER,
        if (communitiesAvailable) RootMenuLadderEntry.COMMUNITIES else RootMenuLadderEntry.CONTACTS,
        RootMenuLadderEntry.SETTINGS,
    )

/** Les cles de libelle de l'echelle deployee, dans l'ordre. */
internal fun menuLadderLabelKeys(): List<String> = rootMenuLadderEntries().map { it.labelKey }

/**
 * Ou menent le second tap et l'appui long sur l'avatar flottant, et l'action TalkBack « Modifier
 * le profil » : MA page, par la regle unique [ProfileRoutes.own] — jamais la route d'un tiers.
 * `null` sans session (rien a ouvrir).
 */
internal fun floatingAvatarProfileRoute(selfId: String?): String? = ProfileRoutes.own(selfId)

/**
 * Ou mene un tap sur le bouton gauche flottant, etant donne la route courante.
 *
 * Parite iOS : `RootFloatingChrome.onLeftTap` fait `showFeed.toggle()` — un aller-retour
 * Flux <-> Conversations sur le MEME bouton. Extrait du composable pour que la regle de
 * bascule soit verifiable en JVM.
 */
internal fun leftButtonTapTarget(currentRoute: String?): String =
    if (currentRoute == Routes.FEED) Routes.CONVERSATIONS else Routes.FEED

/**
 * Les destinations de premier niveau, sur lesquelles le chrome flottant reste monte. Appels,
 * Notifications et Reglages n'ont pas encore de bouton retour sur Android : ils gardent les
 * boutons flottants pour rester a un geste du reste de l'app.
 */
internal val tabRoutes = setOf(Routes.CONVERSATIONS, Routes.FEED, Routes.CALLS, Routes.NOTIFICATIONS, Routes.SETTINGS)

/** Masques sur toute route profonde, pendant les Reels (une route profonde) et l'onboarding. */
internal fun floatingChromeVisible(currentRoute: String?): Boolean =
    RootChromeVisibility.showsFloatingChrome(currentRoute, tabRoutes)
