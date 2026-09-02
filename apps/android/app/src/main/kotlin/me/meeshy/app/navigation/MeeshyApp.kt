package me.meeshy.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddLink
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.DynamicFeed
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.DynamicFeed
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import androidx.compose.ui.res.stringResource
import me.meeshy.app.R
import android.net.Uri
import kotlinx.coroutines.delay
import me.meeshy.app.auth.AuthViewModel
import me.meeshy.app.auth.GuestJoinViewModel
import me.meeshy.app.auth.ShareLinkEntryScreen
import me.meeshy.app.auth.ForgotPasswordScreen
import me.meeshy.app.auth.LoginScreen
import me.meeshy.app.auth.MagicLinkScreen
import me.meeshy.app.auth.MagicLinkValidateScreen
import me.meeshy.app.auth.MagicLinkValidateViewModel
import me.meeshy.app.auth.RegistrationScreen
import me.meeshy.app.calls.CallHistoryScreen
import me.meeshy.app.calls.CallPill
import me.meeshy.app.calls.CallPillPresenter
import me.meeshy.app.calls.CallScreen
import me.meeshy.app.calls.CallStatus
import me.meeshy.app.calls.CallViewModel
import me.meeshy.app.calls.IncomingCallViewModel
import me.meeshy.sdk.model.chrome.FloatingButtonPosition
import me.meeshy.sdk.model.chrome.menuGrowsRightward
import me.meeshy.sdk.model.chrome.menuUnfoldsUpward
import me.meeshy.ui.component.chrome.MeeshyMenuFab
import me.meeshy.ui.component.chrome.RadialMenuItem
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import me.meeshy.app.chat.ChatScreen
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.chat.StarredMessagesScreen
import me.meeshy.app.contacts.ContactsScreen
import me.meeshy.app.conversations.ConversationListScreen
import me.meeshy.app.conversations.NewConversationScreen
import me.meeshy.app.conversations.GlobalSearchScreen
import me.meeshy.app.conversations.DashboardScreen
import me.meeshy.app.feed.BookmarksScreen
import me.meeshy.app.feed.UserPostsScreen
import me.meeshy.app.feed.FeedScreen
import me.meeshy.app.feed.NearbyScreen
import me.meeshy.app.feed.PostDetailScreen
import me.meeshy.app.feed.PostDetailViewModel
import me.meeshy.app.conversations.CreateShareLinkScreen
import me.meeshy.app.conversations.CreateShareLinkViewModel
import me.meeshy.app.conversations.MyShareLinksScreen
import me.meeshy.app.conversations.ShareLinkPickerScreen
import me.meeshy.app.conversations.ShareLinkDetailScreen
import me.meeshy.app.conversations.ShareLinkDetailViewModel
import me.meeshy.app.notifications.NotificationBannerHost
import me.meeshy.app.notifications.NotificationsScreen
import me.meeshy.app.reels.ReelsScreen
import me.meeshy.app.profile.ProfileScreen
import me.meeshy.app.profile.ReportUserScreen
import me.meeshy.app.profile.ReportUserViewModel
import me.meeshy.app.settings.AboutScreen
import me.meeshy.app.settings.AccountContactScreen
import me.meeshy.app.settings.ActiveSessionsScreen
import me.meeshy.app.settings.AccountDeletionScreen
import me.meeshy.app.settings.ChangePasswordScreen
import me.meeshy.app.settings.TwoFactorScreen
import me.meeshy.app.settings.CrashReportScreen
import me.meeshy.app.settings.DataExportScreen
import me.meeshy.app.settings.LegalDocumentScreen
import me.meeshy.app.settings.LicensesScreen
import me.meeshy.app.settings.MediaCacheScreen
import me.meeshy.sdk.model.ProfileShareLink
import me.meeshy.sdk.model.legal.LegalDocumentKind
import me.meeshy.app.settings.MediaDownloadScreen
import me.meeshy.app.settings.PrivacySettingsScreen
import me.meeshy.app.settings.SettingsScreen
import me.meeshy.app.settings.SupportScreen
import me.meeshy.app.stories.StoryComposerScreen
import me.meeshy.app.stories.StoryTray
import me.meeshy.app.stories.StoryViewerScreen
import me.meeshy.app.stories.StoryViewerViewModel
import androidx.compose.material3.Icon
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import me.meeshy.ui.component.chrome.MeeshyFloatingButtons
import me.meeshy.ui.component.chrome.MeeshySplashScreen
import kotlinx.coroutines.launch
import me.meeshy.app.BuildConfig
import me.meeshy.sdk.chrome.FloatingButtonPositionStore
import me.meeshy.sdk.net.SessionExpiryNotifier

object Routes {
    const val LOGIN = "login"
    const val REGISTRATION = "register"
    const val FORGOT_PASSWORD = "forgot-password"
    const val MAGIC_LINK = "magic-link"
    const val MAGIC_LINK_VALIDATE = "auth/magic-link?token={token}"
    const val GUEST_JOIN = "join/{${GuestJoinViewModel.IDENTIFIER_ARG}}"
    const val GUEST_JOIN_DEEP_LINK = "meeshy://$GUEST_JOIN"

    /**
     * LEGACY receiver — `https://meeshy.me/join/{identifier}`, the shape the
     * `joinUrl` helpers built before 2026-08-20. Links of that shape are still
     * in the wild (old chats, old QR codes), so the app keeps claiming them ;
     * the web 308s them to `/chat/{identifier}`. Fresh links are received by
     * [GUEST_JOIN_CHAT_WEB_DEEP_LINK] below.
     */
    const val GUEST_JOIN_WEB_DEEP_LINK = "https://meeshy.me/$GUEST_JOIN"

    /**
     * The CANONICAL web share URL — `{webOrigin}/chat/{identifier}` — the shape
     * `CreatedShareLink.joinUrl` / `MyShareLink.joinUrl` build since 2026-08-20
     * (`/join/{identifier}` only survives as a 308 redirect on the web and as
     * [GUEST_JOIN_WEB_DEEP_LINK] here, for links already in the wild). Same
     * guest-join destination: the identifier resolves through the same
     * `/links/:identifier` gateway route whichever path carried it.
     */
    const val GUEST_JOIN_CHAT_WEB_DEEP_LINK =
        "https://meeshy.me/chat/{${GuestJoinViewModel.IDENTIFIER_ARG}}"
    fun guestJoin(identifier: String): String = "join/$identifier"
    const val CONVERSATIONS = "conversations"
    const val NEW_CONVERSATION = "conversations/new"
    const val GLOBAL_SEARCH = "search"
    const val DASHBOARD = "dashboard"
    const val CONVERSATIONS_DEEP_LINK = "meeshy://conversations"
    const val CREATE_SHARE_LINK =
        "conversations/{${CreateShareLinkViewModel.CONVERSATION_ID_ARG}}/share-link/new"
    fun createShareLink(conversationId: String): String =
        "conversations/$conversationId/share-link/new"
    const val SHARE_LINK_PICKER = "conversations/share-link/picker"
    const val MY_SHARE_LINKS = "share-links"
    const val SHARE_LINK_DETAIL = "share-links/{${ShareLinkDetailViewModel.LINK_ID_ARG}}"
    fun shareLinkDetail(linkId: String): String = "share-links/$linkId"
    const val CHAT = "chat/{${ChatViewModel.CONVERSATION_ID_ARG}}"
    const val CHAT_DEEP_LINK = "meeshy://$CHAT"
    const val CONVERSATION_DEEP_LINK = "meeshy://conversations/{${ChatViewModel.CONVERSATION_ID_ARG}}"
    const val CONVERSATION_SINGULAR_DEEP_LINK = "meeshy://conversation/{${ChatViewModel.CONVERSATION_ID_ARG}}"

    /**
     * Same destination as [CONVERSATION_SINGULAR_DEEP_LINK] plus an optional
     * `?draft=` query arg — e.g. a future Quick Reply widget/shortcut
     * (`ChatViewModel.DRAFT_ARG`/`initialDraft`). Kept as its own pattern (rather
     * than appended to every conversation deep link) since it is the one shape a
     * canned-reply tap would actually construct.
     */
    const val CONVERSATION_DRAFT_DEEP_LINK =
        "meeshy://conversation/{${ChatViewModel.CONVERSATION_ID_ARG}}?${ChatViewModel.DRAFT_ARG}={${ChatViewModel.DRAFT_ARG}}"
    const val CONVERSATION_SHORT_DEEP_LINK = "meeshy://c/{${ChatViewModel.CONVERSATION_ID_ARG}}"
    const val FEED = "feed"
    const val SAVED_POSTS = "feed/saved"
    const val NEARBY_DISCOVERY = "feed/nearby"
    const val POST_DETAIL = "feed/post/{${PostDetailViewModel.POST_ID_ARG}}"
    const val CALLS = "calls"
    const val CONTACTS = "contacts"
    const val CONTACTS_DISCOVER = "contacts/discover"
    const val NOTIFICATIONS = "notifications"
    const val SETTINGS = "settings"
    const val CHANGE_PASSWORD = "settings/change-password"
    const val TWO_FACTOR = "settings/two-factor"
    const val ACCOUNT_CONTACT = "settings/account-contact"
    const val MEDIA_DOWNLOAD = "settings/media-download"
    const val MEDIA_CACHE = "settings/media-cache"
    const val PRIVACY = "settings/privacy"
    const val ACTIVE_SESSIONS = "settings/sessions"
    const val BLOCKED_USERS = "contacts/blocked"
    const val DATA_EXPORT = "settings/data-export"
    const val DIAGNOSTICS = "settings/diagnostics"
    const val ABOUT = "settings/about"
    const val SUPPORT = "settings/support"
    const val LICENSES = "settings/licenses"
    const val LEGAL_DOC_ARG = "doc"
    const val LEGAL = "settings/legal/{$LEGAL_DOC_ARG}"
    const val DELETE_ACCOUNT = "settings/delete-account"
    const val STARRED = "starred"
    const val PROFILE_USER = "profile/{userId}"
    const val PROFILE_DEEP_LINK = "meeshy://$PROFILE_USER"

    /**
     * The receiving half of [ProfileShareLink] — its generated
     * `meeshy://u/{username}` / `https://meeshy.me/u/{username}` links had no
     * matching intent-filter (manifest) or `navDeepLink` (here) until this pair,
     * so a shared/QR profile link opened nothing on Android. `{userId}` doubles
     * as the argument name for a username value: `ProfileViewModel.loadProfile`
     * already forwards it verbatim to `UserApi.getPerson(handle)`, which
     * resolves either — no new resolution step needed on this route.
     */
    const val PROFILE_SHARE_APP_DEEP_LINK =
        "${ProfileShareLink.APP_SCHEME}://${ProfileShareLink.USER_SEGMENT}/{userId}"
    const val PROFILE_SHARE_WEB_DEEP_LINK =
        "https://${ProfileShareLink.WEB_HOST}/${ProfileShareLink.USER_SEGMENT}/{userId}"
    const val USER_POSTS = "profile/{userId}/posts"
    const val REPORT_USER = "report/{${ReportUserViewModel.USER_ID_ARG}}?${ReportUserViewModel.USERNAME_ARG}={${ReportUserViewModel.USERNAME_ARG}}"
    const val STORY_VIEWER = "story/{${StoryViewerViewModel.USER_ID_ARG}}"
    const val STORY_DEEP_LINK = "meeshy://$STORY_VIEWER"
    const val STORY_COMPOSER = "story_composer"
    const val STORY_COMPOSER_REPOST_ARG = "repostOfId"
    const val STORY_COMPOSER_ROUTE = "story_composer?$STORY_COMPOSER_REPOST_ARG={$STORY_COMPOSER_REPOST_ARG}"
    const val REELS = "reels?seed={seed}"
    val CALL = CallRoute.PATTERN

    fun reels(seed: String? = null): String = if (seed == null) "reels" else "reels?seed=$seed"

    /** Opens the story composer as a repost of [storyId] — the source id rides as an optional arg. */
    fun storyComposerRepost(storyId: String): String =
        "story_composer?$STORY_COMPOSER_REPOST_ARG=${Uri.encode(storyId)}"

    fun postDetail(postId: String): String = "feed/post/$postId"
    fun chat(conversationId: String): String = "chat/$conversationId"
    fun profile(userId: String): String = "profile/$userId"
    fun userPosts(userId: String): String = "profile/$userId/posts"
    fun reportUser(userId: String, username: String): String =
        "report/$userId?${ReportUserViewModel.USERNAME_ARG}=${Uri.encode(username)}"
    fun story(userId: String): String = "story/$userId"
    fun legal(kind: LegalDocumentKind): String = "settings/legal/${kind.arg}"
    fun call(conversationId: String, peerName: String, isVideo: Boolean): String =
        CallRoute.path(conversationId, peerName, isVideo)
}

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
private fun MeeshyFloatingChrome(
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
                    ChromeAvatarButton(user = chromeCurrentUser, unreadCount = chromeUnread, menuExpanded = expanded)
                },
                onAnchorTapWhileExpanded = navigateToProfile,
            )
        },
    )
}

private val tabRoutes = setOf(Routes.CONVERSATIONS, Routes.FEED, Routes.CALLS, Routes.NOTIFICATIONS, Routes.SETTINGS)

/**
 * A call that ends while minimised leaves the full-screen [CallScreen] un-composed,
 * so its own auto-dismiss never fires. This app-level settle window brings the
 * Activity-scoped [CallViewModel] back to idle after the ended beat, so the next
 * call can start (parity with [CallScreen]'s CALL_ENDED_AUTO_DISMISS_MS).
 */
private const val CALL_ENDED_MINIMISED_SETTLE_MS = 1500L

/**
 * Floor duration the branded [MeeshySplashScreen] stays up on cold start — parity with iOS
 * `MeeshyApp.swift`'s `minSplashDuration` (1.2s), which exists so the animation never flashes
 * away before it can register on a hot-cache launch. Android's `AuthViewModel.isAuthenticated`
 * is resolved synchronously at construction (no async "session check" phase to additionally
 * gate on the way iOS's `.task` block does — cache hydration + socket handshake), so this is a
 * pure minimum-display-duration floor, not a readiness gate; deferred as a documented follow-up
 * once Android grows an equivalent async boot sequence worth waiting on.
 */
private const val SPLASH_MIN_DURATION_MS = 1200L

@Composable
fun MeeshyApp(
    floatingButtonPositions: FloatingButtonPositionStore,
    sessionExpiry: SessionExpiryNotifier,
    launchRoute: String? = null,
    onLaunchRouteConsumed: () -> Unit = {},
) {
    val navController = rememberNavController()
    val authViewModel: AuthViewModel = hiltViewModel()
    val incomingCallViewModel: IncomingCallViewModel = hiltViewModel()
    // Hoisted to the MeeshyApp root → resolved against the Activity's ViewModelStore
    // (like [authViewModel] above), NOT the CALL destination's back-stack entry. This
    // is what lets the call survive minimisation: leaving the CALL screen clears only
    // that entry's store, never this Activity-scoped instance, so the WebRTC session
    // and every collector in [CallViewModel] stay alive while the conversation shows.
    val callViewModel: CallViewModel = hiltViewModel()
    // Ne collecte QUE la reference : les StateFlow eux-memes (badges, avatar) sont
    // lus a l'interieur de [MeeshyFloatingChrome], pas ici — sinon toute variation
    // d'un badge invaliderait TOUT MeeshyApp, y compris le lambda `builder` du
    // NavHost ci-dessous, qui perdrait alors son identite et reconstruirait le
    // graphe de navigation entier a chaque notification.
    val chromeViewModel: ChromeViewModel = hiltViewModel()
    val authState by authViewModel.state.collectAsStateWithLifecycle()
    val callState by callViewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(authState.isAuthenticated) {
        chromeViewModel.warmUpIfAuthenticated(authState.isAuthenticated)
    }

    val navBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStack?.destination?.route
    val showMenuFab = currentRoute in tabRoutes
    val leftButtonPosition by floatingButtonPositions.leftPosition.collectAsStateWithLifecycle()
    val rightButtonPosition by floatingButtonPositions.rightPosition.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val onCallScreen = currentRoute == CallRoute.PATTERN

    // Branded splash: shown ALWAYS on cold start (parity iOS `MeeshyApp.swift`'s
    // `showSplash`), for a minimum floor duration so it never flashes away — see
    // SPLASH_MIN_DURATION_MS. `rememberSaveable` would survive process death into a
    // fresh cold start showing no splash at all, which defeats the purpose, so this
    // stays a plain `remember`: a configuration change (rotation) keeps it, a real
    // process restart correctly shows it again.
    var showSplash by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        delay(SPLASH_MIN_DURATION_MS)
        showSplash = false
    }

    // Settle a call that ended while minimised: [CallScreen]'s own auto-dismiss only
    // runs while it is composed, so an ended call left in the pill would strand the
    // Activity-scoped FSM in ENDED and block the next call. The pill has already
    // vanished (ENDED is not a pill status); this only resets the state machine.
    LaunchedEffect(callState.status, onCallScreen) {
        if (callState.status == CallStatus.ENDED && !onCallScreen) {
            delay(CALL_ENDED_MINIMISED_SETTLE_MS)
            callViewModel.dismiss()
        }
    }

    val startDestination = remember(authState.isAuthenticated) { if (authState.isAuthenticated) Routes.CONVERSATIONS else Routes.LOGIN }

    // Deep-link from a notification tap / full-screen call intent: navigate once
    // the graph is live and the user is authenticated, then mark it consumed so a
    // recomposition never re-navigates. An unauthenticated launch defers until
    // sign-in resolves (the route survives in Activity state across the login gate).
    LaunchedEffect(launchRoute, authState.isAuthenticated) {
        // La validation d'un magic link est la SEULE destination de lancement
        // legitime hors session : c'est precisement elle qui en ouvre une. Tout le
        // reste (chat, appel) attend l'authentification.
        val isMagicLink = launchRoute?.startsWith("auth/magic-link") == true
        if (launchRoute != null && (authState.isAuthenticated || isMagicLink)) {
            navController.navigate(launchRoute)
            onLaunchRouteConsumed()
        }
    }

    // App-level ring: a foreground `call:initiated` socket offer navigates into the
    // incoming-call screen (the Android analogue of iOS CallManager.shared observed
    // at RootView). Reads the live destination per offer so a second offer mid-call
    // yields no route (call-waiting stays with CallViewModel's banner).
    // Session expiree: la passerelle a refuse l'identite hors route d'auth. Sans
    // ceci, l'ecran affichait « verifiez votre connexion » alors que le reseau
    // fonctionnait, et l'utilisateur n'avait aucun moyen de comprendre qu'il devait
    // se reconnecter. La deconnexion vide la session, donc `startDestination`
    // bascule sur LOGIN.
    LaunchedEffect(Unit) {
        sessionExpiry.expirations.collect { authViewModel.logout() }
    }

    LaunchedEffect(Unit) {
        incomingCallViewModel.incomingOffers.collect { offer ->
            LaunchRouter.routeIncomingSocketOffer(offer, navController.currentDestination?.route)
                ?.let(navController::navigate)
        }
    }

    // Outer Box: the branded splash (below) draws OVER the whole Scaffold — app chrome,
    // system-bar padding included — the same "boot overlay on top of the still-mounted
    // real UI" shape as iOS's ZStack (`MeeshyApp.swift`'s `showSplash` branch), rather
    // than gating the NavHost's own composition on it.
    Box(modifier = Modifier.fillMaxSize()) {
    Scaffold(
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        // Pas de floatingActionButton ici : ce slot positionne LUI-MEME son contenu,
        // ce qui est incompatible avec des boutons deplacables. Ils sont poses dans
        // le Box ci-dessous, par-dessus le NavHost.
    ) { padding ->
      Box(modifier = Modifier.fillMaxSize()) {
        NavHost(
            navController = navController,
            startDestination = startDestination,
            modifier = Modifier.padding(padding),
        ) {
            composable(Routes.LOGIN) {
                LoginScreen(
                    viewModel = authViewModel,
                    onAuthenticated = {
                        navController.navigate(Routes.CONVERSATIONS) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    },
                    onSignUp = { navController.navigate(Routes.REGISTRATION) },
                    onForgotPassword = { navController.navigate(Routes.FORGOT_PASSWORD) },
                    onMagicLink = { navController.navigate(Routes.MAGIC_LINK) },
                )
            }
            composable(Routes.FORGOT_PASSWORD) {
                ForgotPasswordScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.MAGIC_LINK) {
                MagicLinkScreen(onBack = { navController.popBackStack() })
            }
            composable(
                route = Routes.MAGIC_LINK_VALIDATE,
                arguments = listOf(
                    navArgument(MagicLinkValidateViewModel.TOKEN_ARG) {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    },
                ),
            ) {
                MagicLinkValidateScreen(
                    onAuthenticated = {
                        authViewModel.onExternalSessionOpened()
                        navController.navigate(Routes.CONVERSATIONS) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                    onBackToLogin = {
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                )
            }
            composable(Routes.REGISTRATION) {
                RegistrationScreen(
                    onClose = { navController.popBackStack() },
                    onRegistered = {
                        navController.navigate(Routes.CONVERSATIONS) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    },
                )
            }
            composable(
                route = Routes.GUEST_JOIN,
                deepLinks = listOf(
                    navDeepLink { uriPattern = Routes.GUEST_JOIN_DEEP_LINK },
                    navDeepLink { uriPattern = Routes.GUEST_JOIN_WEB_DEEP_LINK },
                    navDeepLink { uriPattern = Routes.GUEST_JOIN_CHAT_WEB_DEEP_LINK },
                ),
            ) {
                ShareLinkEntryScreen(
                    onOpenConversation = { conversationId ->
                        navController.navigate(Routes.chat(conversationId)) {
                            popUpTo(Routes.GUEST_JOIN) { inclusive = true }
                        }
                    },
                    onJoined = {
                        navController.navigate(Routes.CONVERSATIONS) {
                            popUpTo(Routes.GUEST_JOIN) { inclusive = true }
                        }
                    },
                    onBack = { navController.popBackStack() },
                    onSignIn = {
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(Routes.GUEST_JOIN) { inclusive = true }
                        }
                    },
                )
            }
            composable(
                route = Routes.CONVERSATIONS,
                deepLinks = listOf(
                    navDeepLink { uriPattern = Routes.CONVERSATIONS_DEEP_LINK },
                ),
            ) {
                ConversationListScreen(
                    onConversationClick = { conversationId ->
                        navController.navigate(Routes.chat(conversationId))
                    },
                    onNewConversation = { navController.navigate(Routes.NEW_CONVERSATION) },
                    onOpenShareLinkPicker = { navController.navigate(Routes.SHARE_LINK_PICKER) },
                    onDashboard = { navController.navigate(Routes.DASHBOARD) },
                    onGlobalSearch = { navController.navigate(Routes.GLOBAL_SEARCH) },
                    onLogout = {
                        authViewModel.logout()
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(Routes.CONVERSATIONS) { inclusive = true }
                        }
                    },
                    header = {
                        StoryTray(
                            onOpenStory = { userId -> navController.navigate(Routes.story(userId)) },
                            onAddStory = { navController.navigate(Routes.STORY_COMPOSER) },
                        )
                    },
                )
            }
            composable(Routes.SHARE_LINK_PICKER) {
                ShareLinkPickerScreen(
                    onBack = { navController.popBackStack() },
                    onNewConversation = { navController.navigate(Routes.NEW_CONVERSATION) },
                    onSelectConversation = { conversationId ->
                        navController.navigate(Routes.createShareLink(conversationId)) {
                            popUpTo(Routes.SHARE_LINK_PICKER) { inclusive = true }
                        }
                    },
                )
            }
            composable(Routes.GLOBAL_SEARCH) {
                GlobalSearchScreen(
                    onBack = { navController.popBackStack() },
                    onOpenConversation = { conversationId ->
                        navController.navigate(Routes.chat(conversationId))
                    },
                    onOpenUser = { userId ->
                        navController.navigate(Routes.profile(userId))
                    },
                )
            }
            composable(Routes.DASHBOARD) {
                DashboardScreen(
                    onBack = { navController.popBackStack() },
                    onOpenConversation = { conversationId ->
                        navController.navigate(Routes.chat(conversationId))
                    },
                    onNewConversation = { navController.navigate(Routes.NEW_CONVERSATION) },
                    onGlobalSearch = { navController.navigate(Routes.GLOBAL_SEARCH) },
                    onShareLinks = { navController.navigate(Routes.MY_SHARE_LINKS) },
                    onContacts = { navController.navigate(Routes.CONTACTS) },
                )
            }
            composable(
                route = Routes.CREATE_SHARE_LINK,
                arguments = listOf(
                    navArgument(CreateShareLinkViewModel.CONVERSATION_ID_ARG) { type = NavType.StringType },
                ),
            ) {
                CreateShareLinkScreen(
                    onBack = { navController.popBackStack() },
                    onCreated = { navController.popBackStack() },
                )
            }
            composable(Routes.MY_SHARE_LINKS) {
                MyShareLinksScreen(
                    onBack = { navController.popBackStack() },
                    onOpenLink = { link ->
                        navController.navigate(Routes.shareLinkDetail(link.linkId))
                    },
                )
            }
            composable(
                route = Routes.SHARE_LINK_DETAIL,
                arguments = listOf(
                    navArgument(ShareLinkDetailViewModel.LINK_ID_ARG) { type = NavType.StringType },
                ),
            ) {
                ShareLinkDetailScreen(
                    onBack = { navController.popBackStack() },
                    onDeleted = { navController.popBackStack() },
                )
            }
            composable(Routes.NEW_CONVERSATION) {
                NewConversationScreen(
                    onBack = { navController.popBackStack() },
                    onConversationCreated = { conversationId ->
                        navController.navigate(Routes.chat(conversationId)) {
                            popUpTo(Routes.CONVERSATIONS)
                        }
                    },
                )
            }
            composable(
                route = Routes.CHAT,
                arguments = listOf(
                    navArgument(ChatViewModel.CONVERSATION_ID_ARG) { type = NavType.StringType },
                    navArgument(ChatViewModel.DRAFT_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
                ),
                deepLinks = listOf(
                    navDeepLink { uriPattern = Routes.CHAT_DEEP_LINK },
                    navDeepLink { uriPattern = Routes.CONVERSATION_DEEP_LINK },
                    navDeepLink { uriPattern = Routes.CONVERSATION_SINGULAR_DEEP_LINK },
                    navDeepLink { uriPattern = Routes.CONVERSATION_SHORT_DEEP_LINK },
                    navDeepLink { uriPattern = Routes.CONVERSATION_DRAFT_DEEP_LINK },
                ),
            ) { entry ->
                val conversationId = entry.arguments
                    ?.getString(ChatViewModel.CONVERSATION_ID_ARG)
                    .orEmpty()
                ChatScreen(
                    onBack = { navController.popBackStack() },
                    onStartCall = { peerName, isVideo ->
                        navController.navigate(Routes.call(conversationId, peerName, isVideo))
                    },
                    onRejoinCall = { call, peerName ->
                        // Rejoin an existing, still-live call: reuse the incoming
                        // deep-link with autoAnswer so the shared join path adopts
                        // the server callId and connects straight away — never a
                        // new outgoing call.
                        navController.navigate(
                            CallRoute.incoming(
                                callId = call.id,
                                conversationId = conversationId,
                                callerName = peerName,
                                isVideo = call.isVideo,
                                autoAnswer = true,
                            ),
                        )
                    },
                    onCreateShareLink = {
                        navController.navigate(Routes.createShareLink(conversationId))
                    },
                    // A live local call (minimised/floating) suppresses the rejoin
                    // pill — don't offer to rejoin the call this device is in.
                    hasLocalLiveCall = CallPillPresenter.isMinimizable(callState.status),
                )
            }
            composable(Routes.FEED) {
                FeedScreen(
                    onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
                    onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
                    onOpenReels = { navController.navigate(Routes.reels()) },
                    onOpenNearby = { navController.navigate(Routes.NEARBY_DISCOVERY) },
                )
            }
            composable(Routes.SAVED_POSTS) {
                BookmarksScreen(
                    onBack = { navController.popBackStack() },
                    onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
                    onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
                )
            }
            composable(Routes.NEARBY_DISCOVERY) {
                NearbyScreen(
                    onBack = { navController.popBackStack() },
                    onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
                    onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
                )
            }
            composable(
                route = Routes.POST_DETAIL,
                arguments = listOf(
                    navArgument(PostDetailViewModel.POST_ID_ARG) { type = NavType.StringType },
                ),
            ) {
                PostDetailScreen(
                    onBack = { navController.popBackStack() },
                    onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
                )
            }
            composable(Routes.CALLS) {
                CallHistoryScreen(
                    onOpenCall = { record ->
                        navController.navigate(CallRoute.redial(record))
                    },
                )
            }
            composable(Routes.CONTACTS) {
                ContactsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.CONTACTS_DISCOVER) {
                ContactsScreen(
                    onBack = { navController.popBackStack() },
                    initialTab = me.meeshy.app.contacts.ContactsTab.Discover,
                )
            }
            composable(Routes.NOTIFICATIONS) {
                NotificationsScreen()
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    onBack = { navController.popBackStack() },
                    onLogout = {
                        authViewModel.logout()
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(Routes.CONVERSATIONS) { inclusive = true }
                        }
                    },
                    onOpenProfile = { userId -> navController.navigate(Routes.profile(userId)) },
                    onOpenStarred = { navController.navigate(Routes.STARRED) },
                    onOpenSaved = { navController.navigate(Routes.SAVED_POSTS) },
                    onOpenShareLinks = { navController.navigate(Routes.MY_SHARE_LINKS) },
                    onOpenChangePassword = { navController.navigate(Routes.CHANGE_PASSWORD) },
                    onOpenTwoFactor = { navController.navigate(Routes.TWO_FACTOR) },
                    onOpenAccountContact = { navController.navigate(Routes.ACCOUNT_CONTACT) },
                    onOpenAutoDownload = { navController.navigate(Routes.MEDIA_DOWNLOAD) },
                    onOpenMediaCache = { navController.navigate(Routes.MEDIA_CACHE) },
                    onOpenPrivacy = { navController.navigate(Routes.PRIVACY) },
                    onOpenActiveSessions = { navController.navigate(Routes.ACTIVE_SESSIONS) },
                    onOpenBlockedUsers = { navController.navigate(Routes.BLOCKED_USERS) },
                    onOpenDataExport = { navController.navigate(Routes.DATA_EXPORT) },
                    onOpenDiagnostics = { navController.navigate(Routes.DIAGNOSTICS) },
                    onOpenAbout = { navController.navigate(Routes.ABOUT) },
                    onOpenSupport = { navController.navigate(Routes.SUPPORT) },
                    onOpenLicenses = { navController.navigate(Routes.LICENSES) },
                    onOpenTerms = {
                        navController.navigate(Routes.legal(LegalDocumentKind.TERMS_OF_SERVICE))
                    },
                    onOpenPrivacyPolicy = {
                        navController.navigate(Routes.legal(LegalDocumentKind.PRIVACY_POLICY))
                    },
                    onOpenDeleteAccount = { navController.navigate(Routes.DELETE_ACCOUNT) },
                )
            }
            composable(Routes.CHANGE_PASSWORD) {
                ChangePasswordScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.TWO_FACTOR) {
                TwoFactorScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.ACCOUNT_CONTACT) {
                AccountContactScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.DELETE_ACCOUNT) {
                AccountDeletionScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.MEDIA_DOWNLOAD) {
                MediaDownloadScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.MEDIA_CACHE) {
                MediaCacheScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.DATA_EXPORT) {
                DataExportScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.DIAGNOSTICS) {
                CrashReportScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.ABOUT) {
                AboutScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.SUPPORT) {
                SupportScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.LICENSES) {
                LicensesScreen(onBack = { navController.popBackStack() })
            }
            composable(
                route = Routes.LEGAL,
                arguments = listOf(navArgument(Routes.LEGAL_DOC_ARG) { type = NavType.StringType }),
            ) { backStackEntry ->
                val kind = LegalDocumentKind.fromArg(
                    backStackEntry.arguments?.getString(Routes.LEGAL_DOC_ARG),
                ) ?: LegalDocumentKind.TERMS_OF_SERVICE
                LegalDocumentScreen(kind = kind, onBack = { navController.popBackStack() })
            }
            composable(Routes.PRIVACY) {
                PrivacySettingsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.ACTIVE_SESSIONS) {
                ActiveSessionsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.BLOCKED_USERS) {
                ContactsScreen(
                    onBack = { navController.popBackStack() },
                    initialTab = me.meeshy.app.contacts.ContactsTab.Blocked,
                )
            }
            composable(Routes.STARRED) {
                StarredMessagesScreen(
                    onBack = { navController.popBackStack() },
                    onOpenConversation = { conversationId ->
                        navController.navigate(Routes.chat(conversationId))
                    },
                )
            }
            composable(
                route = Routes.PROFILE_USER,
                arguments = listOf(navArgument("userId") { type = NavType.StringType }),
                deepLinks = listOf(
                    navDeepLink { uriPattern = Routes.PROFILE_DEEP_LINK },
                    navDeepLink { uriPattern = Routes.PROFILE_SHARE_APP_DEEP_LINK },
                    navDeepLink { uriPattern = Routes.PROFILE_SHARE_WEB_DEEP_LINK },
                ),
            ) {
                ProfileScreen(
                    onBack = { navController.popBackStack() },
                    onReport = { userId, username ->
                        navController.navigate(Routes.reportUser(userId, username))
                    },
                    onViewPosts = { userId -> navController.navigate(Routes.userPosts(userId)) },
                )
            }
            composable(
                route = Routes.USER_POSTS,
                arguments = listOf(navArgument("userId") { type = NavType.StringType }),
            ) {
                UserPostsScreen(
                    onBack = { navController.popBackStack() },
                    onPostClick = { postId -> navController.navigate(Routes.reels(seed = postId)) },
                    onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
                )
            }
            composable(
                route = Routes.REPORT_USER,
                arguments = listOf(
                    navArgument(ReportUserViewModel.USER_ID_ARG) { type = NavType.StringType },
                    navArgument(ReportUserViewModel.USERNAME_ARG) {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    },
                ),
            ) {
                ReportUserScreen(onDone = { navController.popBackStack() })
            }
            composable(
                route = Routes.STORY_VIEWER,
                arguments = listOf(navArgument(StoryViewerViewModel.USER_ID_ARG) { type = NavType.StringType }),
                deepLinks = listOf(
                    navDeepLink { uriPattern = Routes.STORY_DEEP_LINK },
                ),
            ) {
                StoryViewerScreen(
                    onClose = { navController.popBackStack() },
                    onRepost = { storyId -> navController.navigate(Routes.storyComposerRepost(storyId)) },
                )
            }
            composable(
                route = Routes.STORY_COMPOSER_ROUTE,
                arguments = listOf(
                    navArgument(Routes.STORY_COMPOSER_REPOST_ARG) {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    },
                ),
            ) { entry ->
                StoryComposerScreen(
                    onClose = { navController.popBackStack() },
                    repostOfId = entry.arguments?.getString(Routes.STORY_COMPOSER_REPOST_ARG),
                )
            }
            composable(
                route = Routes.REELS,
                arguments = listOf(
                    navArgument("seed") { type = NavType.StringType; nullable = true; defaultValue = null },
                ),
            ) { entry ->
                ReelsScreen(
                    seed = entry.arguments?.getString("seed"),
                    onClose = { navController.popBackStack() },
                    onOpenPost = { postId -> navController.navigate(Routes.postDetail(postId)) },
                )
            }
            composable(
                route = Routes.CALL,
                arguments = listOf(
                    navArgument(CallRoute.CONVERSATION_ID_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument(CallRoute.PEER_NAME_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument(CallRoute.VIDEO_ARG) { type = NavType.BoolType; defaultValue = false },
                    navArgument(CallRoute.CALL_ID_ARG) { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument(CallRoute.INCOMING_ARG) { type = NavType.BoolType; defaultValue = false },
                    navArgument(CallRoute.ANSWER_ARG) { type = NavType.BoolType; defaultValue = false },
                ),
            ) { entry ->
                val args = entry.arguments
                CallScreen(
                    config = CallRoute.config(
                        conversationId = args?.getString(CallRoute.CONVERSATION_ID_ARG)?.let(Uri::decode),
                        peerName = args?.getString(CallRoute.PEER_NAME_ARG)?.let(Uri::decode),
                        isVideo = args?.getBoolean(CallRoute.VIDEO_ARG),
                        callId = args?.getString(CallRoute.CALL_ID_ARG)?.let(Uri::decode),
                        incoming = args?.getBoolean(CallRoute.INCOMING_ARG) ?: false,
                    ),
                    autoAnswer = args?.getBoolean(CallRoute.ANSWER_ARG) ?: false,
                    // Activity-scoped instance (see the hoist above) → the CALL
                    // destination re-attaches to the live call instead of spinning
                    // up a nav-scoped one that would die on the next pop.
                    viewModel = callViewModel,
                    // Minimise → open the DM with the call still running. popUpTo the
                    // CALL entry (inclusive) so the back stack never accumulates stale
                    // call screens that a Back press could re-enter (and re-initiate).
                    onMinimize = {
                        navController.navigate(Routes.chat(callViewModel.activeConfig.conversationId)) {
                            popUpTo(CallRoute.PATTERN) { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                    onClose = { navController.popBackStack() },
                )
            }
        }

        // Minimised-call pill: a full-width banner pinned under the status bar,
        // shown only for a live, non-incoming call while off the CALL screen. A tap
        // rebuilds the CALL route from the live config and re-opens the full screen;
        // the Activity-scoped [callViewModel] is reused, so `start()` is inert.
        if (CallPillPresenter.shouldShow(callState.status, onCallScreen)) {
            CallPill(
                state = callState,
                onClick = {
                    navController.navigate(CallRoute.reopen(callViewModel.activeConfig)) {
                        launchSingleTop = true
                    }
                },
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(padding)
                    .padding(top = MeeshySpacing.sm),
            )
        }

        // Les deux boutons flottants qui pilotent le routage (parite iOS
        // RootView.draggableFloatingButtons). Ils vivent ICI, par-dessus le NavHost,
        // et non dans le slot floatingActionButton du Scaffold : ce slot positionne
        // lui-meme son contenu, donc un bouton deplacable ne peut pas y tenir.
        if (showMenuFab) {
            MeeshyFloatingChrome(
                navController = navController,
                currentRoute = currentRoute,
                leftButtonPosition = leftButtonPosition,
                rightButtonPosition = rightButtonPosition,
                onLeftPositionChange = { scope.launch { floatingButtonPositions.setLeftPosition(it) } },
                onRightPositionChange = { scope.launch { floatingButtonPositions.setRightPosition(it) } },
            )
        }
      }
    }

        // #4457 — la bannière in-app se monte UNE fois, ICI, par-dessus la navigation.
        // `NotificationToastPolicy` portait sa décision depuis des mois SANS aucun appelant
        // de production : un `notification:new` reçu app ouverte ne produisait rien de
        // visible sur Android, pendant qu'iOS et le web affichaient les sept cadrages.
        // Montée à la racine et non par écran : une bannière SUIT le lecteur, et une
        // instance par écran en ferait autant de rivales. Sous le splash, qui couvre tout au
        // démarrage à froid.
        NotificationBannerHost(
            activeConversationId = navBackStack?.arguments?.getString(ChatViewModel.CONVERSATION_ID_ARG),
            activePostId = navBackStack?.arguments?.getString(PostDetailViewModel.POST_ID_ARG),
            onOpenConversation = { navController.navigate(Routes.chat(it)) },
            onOpenPost = { navController.navigate(Routes.postDetail(it)) },
        )

        if (showSplash) {
            MeeshySplashScreen(
                tagline = stringResource(R.string.splash_tagline),
                versionLabel = stringResource(
                    R.string.splash_version_label,
                    BuildConfig.VERSION_NAME,
                    BuildConfig.VERSION_CODE.toString(),
                ),
                credit = stringResource(R.string.brand_signature_credit),
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

// [ChromeAvatarButton] (bouton droit au repos : avatar photo/initiales, anneau,
// badge) et ses fonctions pures [chromeAvatarUsesPhoto]/[chromeAvatarRingColors]
// vivent dans ChromeAvatarButton.kt — extrait pour respecter le budget de taille
// (directive 2026-08-28).
