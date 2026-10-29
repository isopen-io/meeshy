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
 *  - [MODAL] : une feuille ou un plein écran : boutons texte (Annuler / OK / Valider) ou croix, jamais de flèche,
 *    et le glissé du bord y est fermé.
 */
internal enum class BackChrome { ROOT, ARROW, MODAL }

/**
 * Comment iOS PRÉSENTE l'écran jumeau — c'est elle qui décide du retour (règle porteur 2026-10-27) :
 *  - [PUSH]       : `navigationDestination` / `router.push` / `NavigationLink` ⇒ écran empilé, flèche + glissé du bord.
 *  - [PUSH_CLOSE] : poussé mais barre masquée et croix (`MoodSpotlightView`) ⇒ croix, pas de glissé du bord.
 *  - [SHEET]      : `.sheet` ⇒ feuille, boutons texte ou croix, glissé vers le bas.
 *  - [COVER]      : `.fullScreenCover` (ou couche plein écran) ⇒ croix ou bouton de fin.
 *  - [NONE]       : racine iOS, ou écran sans jumeau iOS.
 */
internal enum class IosPresentation { PUSH, PUSH_CLOSE, SHEET, COVER, NONE }

/**
 * Une route du graphe : son écriture dans les sources ([source], pour le témoin), sa valeur, son rôle, la
 * présentation de son jumeau iOS, et le fichier qui porte la flèche (ARROW) ou la croix / les boutons (MODAL)
 * ([evidence], relatif à `apps/android`).
 */
internal data class RouteChrome(
    val source: String,
    val route: String,
    val chrome: BackChrome,
    val ios: IosPresentation,
    val evidence: String? = null,
    /** Vrai quand la route est déclarée par `sheetComposable` : une feuille animée, glissée vers le bas, qui laisse l'écran dessous. */
    val viaSheetHost: Boolean = false,
)

/**
 * LE registre des routes du graphe. Une route déclarée dans un `composable(...)` sans entrée ici fait rougir
 * `NavBackChromeTest` : un écran futur ne peut plus oublier sa flèche. Le même registre ouvre ou ferme le glissé
 * depuis le bord ([edgeSwipeBackEnabled]), de sorte que flèche et geste ne divergent jamais.
 */
internal object NavBackChrome {

    private const val FEATURE = "feature"

    private fun root(source: String, route: String) = RouteChrome(source, route, BackChrome.ROOT, IosPresentation.NONE)

    /** Écran empilé sur iOS : flèche + glissé du bord. */
    private fun arrow(source: String, route: String, evidence: String, ios: IosPresentation = IosPresentation.PUSH) =
        RouteChrome(source, route, BackChrome.ARROW, ios, evidence)

    /** Feuille ou plein écran sur iOS, présenté comme tel sur Android : croix ou boutons, pas de flèche. */
    private fun modal(source: String, route: String, ios: IosPresentation, evidence: String) =
        RouteChrome(source, route, BackChrome.MODAL, ios, evidence)

    /** Feuille ou plein écran iOS rendu par l'hôte de feuilles (`sheetComposable`, #13369) : croix à la place de la flèche, glissé vers le bas. */
    private fun sheet(source: String, route: String, ios: IosPresentation, evidence: String) =
        RouteChrome(source, route, BackChrome.MODAL, ios, evidence, viaSheetHost = true)

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
        sheet("Routes.FORGOT_PASSWORD", Routes.FORGOT_PASSWORD, IosPresentation.SHEET, auth("AccountRecoveryScreens.kt")),
        sheet("Routes.MAGIC_LINK", Routes.MAGIC_LINK, IosPresentation.SHEET, auth("AccountRecoveryScreens.kt")),
        root("Routes.MAGIC_LINK_VALIDATE", Routes.MAGIC_LINK_VALIDATE),
        root("Routes.VERIFY_EMAIL_LINK", Routes.VERIFY_EMAIL_LINK),
        sheet("Routes.RESET_PASSWORD", Routes.RESET_PASSWORD, IosPresentation.SHEET, auth("NewPasswordScreen.kt")),
        sheet("Routes.REGISTRATION", Routes.REGISTRATION, IosPresentation.COVER, auth("SignupScreen.kt")),
        sheet("Routes.GUEST_JOIN", Routes.GUEST_JOIN, IosPresentation.COVER, auth("ShareLinkEntryScreen.kt")),
        sheet("Routes.WORLD_ENTRY", Routes.WORLD_ENTRY, IosPresentation.COVER, auth("WorldGuestEntryScreen.kt")),
        // Conversations.
        root("Routes.CONVERSATIONS", Routes.CONVERSATIONS),
        sheet("Routes.SHARE_LINK_PICKER", Routes.SHARE_LINK_PICKER, IosPresentation.SHEET, conversations("CreateShareLinkScreen.kt")),
        sheet("Routes.GLOBAL_SEARCH", Routes.GLOBAL_SEARCH, IosPresentation.COVER, conversations("GlobalSearchScreen.kt")),
        sheet("Routes.DASHBOARD", Routes.DASHBOARD, IosPresentation.SHEET, conversations("DashboardScreen.kt")),
        sheet("Routes.CREATE_SHARE_LINK", Routes.CREATE_SHARE_LINK, IosPresentation.SHEET, conversations("CreateShareLinkScreen.kt")),
        arrow("Routes.MY_SHARE_LINKS", Routes.MY_SHARE_LINKS, conversations("MyShareLinksScreen.kt")),
        arrow("Routes.SHARE_LINK_DETAIL", Routes.SHARE_LINK_DETAIL, conversations("ShareLinkDetailScreen.kt")),
        arrow("Routes.SHARE_LINK_ARRIVALS", Routes.SHARE_LINK_ARRIVALS, conversations("ShareLinkArrivalsScreen.kt")),
        sheet("Routes.NEW_CONVERSATION", Routes.NEW_CONVERSATION, IosPresentation.SHEET, conversations("NewConversationScreen.kt")),
        arrow("Routes.CHAT", Routes.CHAT, "$FEATURE/chat/src/main/kotlin/me/meeshy/app/chat/ChatConversationHeader.kt"),
        arrow("Routes.STARRED", Routes.STARRED, "$FEATURE/chat/src/main/kotlin/me/meeshy/app/chat/StarredMessagesScreen.kt"),
        // Flux, stories, reels : le flux est une racine ; lecteurs et compositeur sont immersifs.
        root("Routes.FEED", Routes.FEED),
        arrow("Routes.HASHTAG_RESULTS", Routes.HASHTAG_RESULTS, feed("HashtagResultsScreen.kt")),
        modal("Routes.MOOD_SPOTLIGHT", Routes.MOOD_SPOTLIGHT, IosPresentation.PUSH_CLOSE, feed("MoodSpotlightScreen.kt")),
        sheet("Routes.MY_STORIES", Routes.MY_STORIES, IosPresentation.SHEET, "$FEATURE/stories/src/main/kotlin/me/meeshy/app/stories/MyStoriesScreen.kt"),
        arrow("Routes.SAVED_POSTS", Routes.SAVED_POSTS, feed("BookmarksScreen.kt")),
        arrow("Routes.NEARBY_DISCOVERY", Routes.NEARBY_DISCOVERY, feed("NearbyScreen.kt")),
        arrow("Routes.POST_DETAIL", Routes.POST_DETAIL, feed("PostDetailScreen.kt")),
        modal("Routes.REELS", Routes.REELS, IosPresentation.COVER, "$FEATURE/reels/src/main/kotlin/me/meeshy/app/reels/ReelsScreen.kt"),
        modal("Routes.STORY_VIEWER", Routes.STORY_VIEWER, IosPresentation.COVER, "$FEATURE/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt"),
        modal("Routes.STORY_COMPOSER_ROUTE", Routes.STORY_COMPOSER_ROUTE, IosPresentation.COVER, "$FEATURE/stories/src/main/kotlin/me/meeshy/app/stories/StoryComposerScreen.kt"),
        modal("Routes.COMPOSER", Routes.COMPOSER, IosPresentation.COVER, "app/src/main/kotlin/me/meeshy/app/composer/host/ComposerHostScreen.kt"),
        // Réglages.
        arrow("Routes.SETTINGS", Routes.SETTINGS, settings("SettingsScreen.kt")),
        sheet("Routes.NOTIFICATION_SETTINGS", Routes.NOTIFICATION_SETTINGS, IosPresentation.SHEET, settings("NotificationSettingsScreen.kt")),
        sheet("Routes.CHANGE_PASSWORD", Routes.CHANGE_PASSWORD, IosPresentation.SHEET, settings("ChangePasswordScreen.kt")),
        sheet("Routes.TWO_FACTOR", "${Routes.TWO_FACTOR}?step={step}", IosPresentation.SHEET, settings("TwoFactorScreen.kt")),
        sheet("Routes.ACCOUNT_CONTACT", Routes.ACCOUNT_CONTACT, IosPresentation.SHEET, settings("SecurityScreen.kt")),
        sheet("Routes.SECURITY", Routes.SECURITY, IosPresentation.SHEET, settings("SecurityScreen.kt")),
        sheet("Routes.DELETE_ACCOUNT", Routes.DELETE_ACCOUNT, IosPresentation.SHEET, settings("AccountDeletionScreen.kt")),
        sheet("Routes.MEDIA_DOWNLOAD", Routes.MEDIA_DOWNLOAD, IosPresentation.SHEET, settings("MediaDownloadScreen.kt")),
        sheet("Routes.MEDIA_CACHE", Routes.MEDIA_CACHE, IosPresentation.SHEET, settings("MediaCacheScreen.kt")),
        sheet("Routes.PACK_SHOP", "${Routes.PACK_SHOP}?domain={domain}&pack={pack}", IosPresentation.SHEET, settings("PackShopScreen.kt")),
        sheet("Routes.DATA_EXPORT", Routes.DATA_EXPORT, IosPresentation.SHEET, settings("DataExportScreen.kt")),
        sheet("Routes.DIAGNOSTICS", Routes.DIAGNOSTICS, IosPresentation.SHEET, settings("CrashReportScreen.kt")),
        sheet("Routes.ABOUT", Routes.ABOUT, IosPresentation.SHEET, settings("AboutScreen.kt")),
        sheet("Routes.SUPPORT", Routes.SUPPORT, IosPresentation.SHEET, settings("SupportScreen.kt")),
        sheet("Routes.LICENSES", Routes.LICENSES, IosPresentation.SHEET, settings("LicensesScreen.kt")),
        sheet("Routes.LEGAL", Routes.LEGAL, IosPresentation.SHEET, settings("LegalDocumentScreen.kt")),
        sheet("Routes.PRIVACY", Routes.PRIVACY, IosPresentation.SHEET, settings("PrivacySettingsScreen.kt")),
        sheet("Routes.ACTIVE_SESSIONS", Routes.ACTIVE_SESSIONS, IosPresentation.SHEET, settings("ActiveSessionsScreen.kt")),
        sheet("Routes.ENCRYPTED_DEVICES", Routes.ENCRYPTED_DEVICES, IosPresentation.SHEET, settings("EncryptedDevicesScreen.kt")),
        arrow("BirthDateDestinations.ROUTE", BirthDateDestinations.ROUTE, settings("BirthDateDeclarationScreen.kt"), IosPresentation.NONE),
        // Contacts, notifications, profils.
        arrow("Routes.CONTACTS", Routes.CONTACTS, contacts),
        arrow("Routes.CONTACTS_DISCOVER", Routes.CONTACTS_DISCOVER, contacts),
        sheet("Routes.BLOCKED_USERS", Routes.BLOCKED_USERS, IosPresentation.SHEET, contacts),
        arrow("FriendRequestsDestinations.ROUTE", FriendRequestsDestinations.ROUTE, contacts),
        arrow("Routes.NOTIFICATIONS", Routes.NOTIFICATIONS, "$FEATURE/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt"),
        arrow("ProfileRoutes.OWN", ProfileRoutes.OWN, profile("OwnProfileScreen.kt")),
        sheet("ProfileRoutes.STATS", ProfileRoutes.STATS, IosPresentation.SHEET, profile("UserStatsScreen.kt")),
        sheet("ProfileRoutes.DECOR", ProfileRoutes.DECOR, IosPresentation.SHEET, profile("ProfileDecorSheet.kt")),
        // La route n'a plus d'écran : elle ouvre la fiche (`UserProfileSheet`, une feuille Material) par l'ouvreur global, puis se retire.
        modal("Routes.PROFILE_USER", Routes.PROFILE_USER, IosPresentation.SHEET, profile("UserProfileSheet.kt")),
        sheet("Routes.USER_POSTS", Routes.USER_POSTS, IosPresentation.SHEET, feed("UserPostsScreen.kt")),
        sheet("Routes.REPORT_USER", Routes.REPORT_USER, IosPresentation.SHEET, profile("ReportUserScreen.kt")),
        // Appels : l'historique s'empile, l'appel en cours est plein écran.
        arrow("Routes.CALLS", Routes.CALLS, "$FEATURE/calls/src/main/kotlin/me/meeshy/app/calls/CallHistoryScreen.kt"),
        modal("Routes.CALL", Routes.CALL, IosPresentation.COVER, "$FEATURE/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt"),
        // Communautés : iOS les POUSSE toutes (`router.push(.communitySettings / .communityInvite)`), réglages et invitation compris.
        arrow("CommunityRoutes.LIST", CommunityRoutes.LIST, community("CommunityListScreen.kt")),
        arrow("CommunityRoutes.CREATE", CommunityRoutes.CREATE, community("CommunityCreateScreen.kt")),
        arrow("CommunityRoutes.SETTINGS", CommunityRoutes.SETTINGS, community("CommunitySettingsScreen.kt")),
        arrow("CommunityRoutes.MEMBERS", CommunityRoutes.MEMBERS, community("CommunityMembersScreen.kt")),
        arrow("CommunityRoutes.INVITE", CommunityRoutes.INVITE, community("CommunityInviteScreen.kt")),
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
