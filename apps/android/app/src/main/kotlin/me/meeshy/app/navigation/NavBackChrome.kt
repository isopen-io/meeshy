package me.meeshy.app.navigation

import me.meeshy.app.navigation.graph.BirthDateDestinations
import me.meeshy.app.navigation.graph.CommunityRoutes
import me.meeshy.app.navigation.graph.FriendRequestsDestinations
import me.meeshy.app.navigation.graph.GameRoutes
import me.meeshy.app.navigation.graph.LinksRoutes

/**
 * Comment un écran quitte la pile, comme sur iOS (#13364).
 *
 *  - [ROOT]  : une racine, aucune flèche (liste des conversations, flux, connexion).
 *  - [ARROW] : un écran empilé, flèche « < » en haut à gauche ET glissé depuis le bord.
 *  - [MODAL] : plein écran immersif ou feuille (lecteurs, appel, signalement) : iOS les ferme par une croix, un
 *    bouton de feuille ou un glissé vers le bas, jamais par une flèche, et le glissé du bord y est fermé.
 */
internal enum class BackChrome { ROOT, ARROW, MODAL }

/**
 * Une route du graphe : son écriture dans les sources ([source], pour le témoin), sa valeur, son rôle, et le fichier
 * qui porte la flèche d'un [BackChrome.ARROW] ([evidence], relatif à `apps/android`).
 */
internal data class RouteChrome(
    val source: String,
    val route: String,
    val chrome: BackChrome,
    val evidence: String? = null,
)

/**
 * LE registre des routes du graphe. Une route déclarée dans un `composable(...)` sans entrée ici fait rougir
 * `NavBackChromeTest` : un écran futur ne peut plus oublier sa flèche. Le même registre ouvre ou ferme le glissé
 * depuis le bord ([edgeSwipeBackEnabled]), de sorte que flèche et geste ne divergent jamais.
 */
internal object NavBackChrome {

    private const val FEATURE = "feature"

    private fun root(source: String, route: String) = RouteChrome(source, route, BackChrome.ROOT)
    private fun modal(source: String, route: String) = RouteChrome(source, route, BackChrome.MODAL)
    private fun arrow(source: String, route: String, evidence: String) = RouteChrome(source, route, BackChrome.ARROW, evidence)

    private fun settings(file: String) = "$FEATURE/settings/src/main/kotlin/me/meeshy/app/settings/$file"
    private fun auth(file: String) = "$FEATURE/auth/src/main/kotlin/me/meeshy/app/auth/$file"
    private fun conversations(file: String) = "$FEATURE/conversations/src/main/kotlin/me/meeshy/app/conversations/$file"
    private fun community(file: String) = "$FEATURE/community/src/main/kotlin/me/meeshy/app/community/$file"
    private fun feed(file: String) = "$FEATURE/feed/src/main/kotlin/me/meeshy/app/feed/$file"
    private fun profile(file: String) = "$FEATURE/profile/src/main/kotlin/me/meeshy/app/profile/$file"
    private fun game(file: String) = "$FEATURE/game/src/main/kotlin/me/meeshy/app/game/$file"

    private val contacts = "$FEATURE/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsScreen.kt"
    private val linksChrome = conversations("links/LinksChrome.kt")
    private val gameScaffold = game("progression/GamePageScaffold.kt")

    val entries: List<RouteChrome> = listOf(
        // Authentification : la connexion est la racine ; le reste s'y empile.
        root("Routes.LOGIN", Routes.LOGIN),
        arrow("Routes.FORGOT_PASSWORD", Routes.FORGOT_PASSWORD, auth("AccountRecoveryScreens.kt")),
        arrow("Routes.MAGIC_LINK", Routes.MAGIC_LINK, auth("AccountRecoveryScreens.kt")),
        root("Routes.MAGIC_LINK_VALIDATE", Routes.MAGIC_LINK_VALIDATE),
        arrow("Routes.REGISTRATION", Routes.REGISTRATION, auth("SignupScreen.kt")),
        arrow("Routes.GUEST_JOIN", Routes.GUEST_JOIN, auth("ShareLinkEntryScreen.kt")),
        arrow("Routes.WORLD_ENTRY", Routes.WORLD_ENTRY, auth("WorldGuestEntryScreen.kt")),
        // Conversations.
        root("Routes.CONVERSATIONS", Routes.CONVERSATIONS),
        arrow("Routes.SHARE_LINK_PICKER", Routes.SHARE_LINK_PICKER, conversations("CreateShareLinkScreen.kt")),
        arrow("Routes.GLOBAL_SEARCH", Routes.GLOBAL_SEARCH, conversations("GlobalSearchScreen.kt")),
        arrow("Routes.DASHBOARD", Routes.DASHBOARD, conversations("DashboardScreen.kt")),
        arrow("Routes.CREATE_SHARE_LINK", Routes.CREATE_SHARE_LINK, conversations("CreateShareLinkScreen.kt")),
        arrow("Routes.MY_SHARE_LINKS", Routes.MY_SHARE_LINKS, conversations("MyShareLinksScreen.kt")),
        arrow("Routes.SHARE_LINK_DETAIL", Routes.SHARE_LINK_DETAIL, conversations("ShareLinkDetailScreen.kt")),
        arrow("Routes.NEW_CONVERSATION", Routes.NEW_CONVERSATION, conversations("NewConversationScreen.kt")),
        arrow("Routes.CHAT", Routes.CHAT, "$FEATURE/chat/src/main/kotlin/me/meeshy/app/chat/ChatConversationHeader.kt"),
        arrow("Routes.STARRED", Routes.STARRED, "$FEATURE/chat/src/main/kotlin/me/meeshy/app/chat/StarredMessagesScreen.kt"),
        // Flux, stories, reels : le flux est une racine ; lecteurs et compositeur sont immersifs.
        root("Routes.FEED", Routes.FEED),
        arrow("Routes.HASHTAG_RESULTS", Routes.HASHTAG_RESULTS, feed("HashtagResultsScreen.kt")),
        modal("Routes.MOOD_SPOTLIGHT", Routes.MOOD_SPOTLIGHT),
        arrow("Routes.MY_STORIES", Routes.MY_STORIES, "$FEATURE/stories/src/main/kotlin/me/meeshy/app/stories/MyStoriesScreen.kt"),
        arrow("Routes.SAVED_POSTS", Routes.SAVED_POSTS, feed("BookmarksScreen.kt")),
        arrow("Routes.NEARBY_DISCOVERY", Routes.NEARBY_DISCOVERY, feed("NearbyScreen.kt")),
        arrow("Routes.POST_DETAIL", Routes.POST_DETAIL, feed("PostDetailScreen.kt")),
        modal("Routes.REELS", Routes.REELS),
        modal("Routes.STORY_VIEWER", Routes.STORY_VIEWER),
        modal("Routes.STORY_COMPOSER_ROUTE", Routes.STORY_COMPOSER_ROUTE),
        // Réglages.
        arrow("Routes.SETTINGS", Routes.SETTINGS, settings("SettingsScreen.kt")),
        arrow("Routes.NOTIFICATION_SETTINGS", Routes.NOTIFICATION_SETTINGS, settings("NotificationSettingsScreen.kt")),
        arrow("Routes.CHANGE_PASSWORD", Routes.CHANGE_PASSWORD, settings("ChangePasswordScreen.kt")),
        arrow("Routes.TWO_FACTOR", "${Routes.TWO_FACTOR}?step={step}", settings("TwoFactorScreen.kt")),
        arrow("Routes.ACCOUNT_CONTACT", Routes.ACCOUNT_CONTACT, settings("SecurityScreen.kt")),
        arrow("Routes.SECURITY", Routes.SECURITY, settings("SecurityScreen.kt")),
        arrow("Routes.DELETE_ACCOUNT", Routes.DELETE_ACCOUNT, settings("AccountDeletionScreen.kt")),
        arrow("Routes.MEDIA_DOWNLOAD", Routes.MEDIA_DOWNLOAD, settings("MediaDownloadScreen.kt")),
        arrow("Routes.MEDIA_CACHE", Routes.MEDIA_CACHE, settings("MediaCacheScreen.kt")),
        arrow("Routes.DATA_EXPORT", Routes.DATA_EXPORT, settings("DataExportScreen.kt")),
        arrow("Routes.DIAGNOSTICS", Routes.DIAGNOSTICS, settings("CrashReportScreen.kt")),
        arrow("Routes.ABOUT", Routes.ABOUT, settings("AboutScreen.kt")),
        arrow("Routes.SUPPORT", Routes.SUPPORT, settings("SupportScreen.kt")),
        arrow("Routes.LICENSES", Routes.LICENSES, settings("LicensesScreen.kt")),
        arrow("Routes.LEGAL", Routes.LEGAL, settings("LegalDocumentScreen.kt")),
        arrow("Routes.PRIVACY", Routes.PRIVACY, settings("PrivacySettingsScreen.kt")),
        arrow("Routes.ACTIVE_SESSIONS", Routes.ACTIVE_SESSIONS, settings("ActiveSessionsScreen.kt")),
        arrow("Routes.ENCRYPTED_DEVICES", Routes.ENCRYPTED_DEVICES, settings("EncryptedDevicesScreen.kt")),
        arrow("BirthDateDestinations.ROUTE", BirthDateDestinations.ROUTE, settings("BirthDateDeclarationScreen.kt")),
        // Contacts, notifications, profils.
        arrow("Routes.CONTACTS", Routes.CONTACTS, contacts),
        arrow("Routes.CONTACTS_DISCOVER", Routes.CONTACTS_DISCOVER, contacts),
        arrow("Routes.BLOCKED_USERS", Routes.BLOCKED_USERS, contacts),
        arrow("FriendRequestsDestinations.ROUTE", FriendRequestsDestinations.ROUTE, contacts),
        arrow("Routes.NOTIFICATIONS", Routes.NOTIFICATIONS, "$FEATURE/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt"),
        arrow("ProfileRoutes.OWN", ProfileRoutes.OWN, profile("OwnProfileScreen.kt")),
        arrow("Routes.PROFILE_USER", Routes.PROFILE_USER, profile("ProfileScreen.kt")),
        arrow("Routes.USER_POSTS", Routes.USER_POSTS, feed("UserPostsScreen.kt")),
        modal("Routes.REPORT_USER", Routes.REPORT_USER),
        // Appels : l'historique s'empile, l'appel en cours est plein écran.
        arrow("Routes.CALLS", Routes.CALLS, "$FEATURE/calls/src/main/kotlin/me/meeshy/app/calls/CallHistoryScreen.kt"),
        modal("Routes.CALL", Routes.CALL),
        // Communautés : création, détail, membres s'empilent ; réglages et invitation sont des feuilles (Annuler / OK).
        arrow("CommunityRoutes.LIST", CommunityRoutes.LIST, community("CommunityListScreen.kt")),
        arrow("CommunityRoutes.CREATE", CommunityRoutes.CREATE, community("CommunityCreateScreen.kt")),
        modal("CommunityRoutes.SETTINGS", CommunityRoutes.SETTINGS),
        arrow("CommunityRoutes.MEMBERS", CommunityRoutes.MEMBERS, community("CommunityMembersScreen.kt")),
        modal("CommunityRoutes.INVITE", CommunityRoutes.INVITE),
        arrow("CommunityRoutes.DETAIL", CommunityRoutes.DETAIL, community("CommunityDetailScreen.kt")),
        // Jeu.
        arrow("GameRoutes.PROGRESSION", GameRoutes.PROGRESSION, gameScaffold),
        arrow("GameRoutes.PAGE", GameRoutes.PAGE, gameScaffold),
        arrow("GameRoutes.CONCEPT", GameRoutes.CONCEPT, gameScaffold),
        // Liens.
        arrow("LinksRoutes.HUB", LinksRoutes.HUB, linksChrome),
        arrow("LinksRoutes.TRACKING", LinksRoutes.TRACKING, linksChrome),
        arrow("LinksRoutes.TRACKING_DETAIL", LinksRoutes.TRACKING_DETAIL, linksChrome),
        arrow("LinksRoutes.COMMUNITY", LinksRoutes.COMMUNITY, linksChrome),
        arrow("LinksRoutes.COMMUNITY_DETAIL", LinksRoutes.COMMUNITY_DETAIL, linksChrome),
        arrow("LinksRoutes.AFFILIATE", LinksRoutes.AFFILIATE, linksChrome),
    )

    private val byRoute: Map<String, BackChrome> = entries.associate { it.route to it.chrome }

    fun of(route: String?): BackChrome? = route?.let(byRoute::get)

    /** Le glissé depuis le bord n'est armé que sur un écran empilé qui porte la flèche — jamais sur une racine ni une feuille. */
    fun edgeSwipeBackEnabled(route: String?): Boolean = of(route) == BackChrome.ARROW
}
