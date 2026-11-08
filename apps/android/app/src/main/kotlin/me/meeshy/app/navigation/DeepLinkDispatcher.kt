package me.meeshy.app.navigation

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.navigation.NavDeepLinkRequest
import androidx.navigation.NavHostController
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CompletableDeferred
import me.meeshy.sdk.auth.PendingReferralStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.link.ConversationListEntryRequests
import me.meeshy.sdk.link.TrackedLinkResolution
import me.meeshy.sdk.link.TrackedLinkResolver
import me.meeshy.sdk.model.link.ConversationListEntry
import me.meeshy.sdk.model.link.TrackedLinkOutcome
import me.meeshy.sdk.model.deeplink.DeepLinkDestination

/**
 * **L'exécuteur des liens que le graphe de navigation ne lit pas** (iOS `RootView` : `pendingDeepLink`). Avant
 * d'afficher la destination, les surfaces présentées se ferment ([PresentedSurfaceRegistry]) ; la pile revient à
 * la liste, puis l'écran s'empile — les écrans de premier niveau ne s'empilent jamais sur un autre écran.
 */
@Singleton
class DeepLinkDispatcher @Inject constructor(
    @ApplicationContext private val context: Context,
    private val surfaces: PresentedSurfaceRegistry,
    private val opener: ConversationOpenerHost,
    private val trackedLinks: TrackedLinkResolver,
    private val referrals: PendingReferralStore,
    private val listEntries: ConversationListEntryRequests,
    private val conversations: ConversationRepository,
) {
    fun rememberReferral(code: String) = referrals.remember(code)

    suspend fun dispatch(raw: String, navController: NavHostController) {
        perform(DeepLinkRouter.action(raw), navController)
    }

    internal suspend fun perform(action: DeepLinkAction, navController: NavHostController) {
        when (action) {
            is DeepLinkAction.Navigate -> navigate(navController, action.route)
            is DeepLinkAction.OpenConversation -> {
                surfacesClosed()
                opener.open(action.conversationId)
            }
            is DeepLinkAction.OpenDraft -> navigateUri(navController, draftUri(action))
            DeepLinkAction.OpenRecentConversation -> openRecent(navController)
            DeepLinkAction.OpenUnreadConversations -> {
                listEntries.request(ConversationListEntry.unreadFilter)
                navigate(navController, Routes.CONVERSATIONS)
            }
            is DeepLinkAction.ResolveTrackedLink -> resolveTracked(action.token, navController)
            is DeepLinkAction.RememberReferral -> referrals.remember(action.code)
            is DeepLinkAction.OpenInBrowser -> openInBrowser(action.url)
            DeepLinkAction.HandledAtLaunch -> Unit
        }
    }

    /** Rend la main quand les surfaces présentées sont fermées (celles qui retiennent un travail l'attendent). */
    private suspend fun surfacesClosed() {
        val closed = CompletableDeferred<Unit>()
        surfaces.clearForConversation { closed.complete(Unit) }
        closed.await()
    }

    private fun navigate(navController: NavHostController, route: String) {
        surfaces.clearForConversation { navController.navigateOverConversations(route) }
    }

    private fun draftUri(action: DeepLinkAction.OpenDraft): Uri =
        Uri.parse("meeshy://conversation/${Uri.encode(action.conversationId)}?draft=${Uri.encode(action.draft)}")

    private fun navigateUri(navController: NavHostController, uri: Uri) {
        surfaces.clearForConversation {
            runCatching { navController.navigateOverConversations(NavDeepLinkRequest.Builder.fromUri(uri).build()) }
        }
    }

    private suspend fun openRecent(navController: NavHostController) {
        val id = ConversationListEntry.recentConversationId(conversations.recentCachedConversations())
        if (id == null) navigate(navController, Routes.CONVERSATIONS) else perform(DeepLinkAction.OpenConversation(id), navController)
    }

    private suspend fun resolveTracked(token: String, navController: NavHostController) {
        when (val resolution = trackedLinks.resolve(token, DeepLinkRouter.WEB_ORIGIN)) {
            is TrackedLinkResolution.Failed -> toast(ShareLinkErrorMessages.resFor(resolution.httpStatus))
            is TrackedLinkResolution.Resolved -> when (val outcome = resolution.outcome) {
                is TrackedLinkOutcome.Open -> perform(DeepLinkRouter.action(outcome.destination), navController)
                is TrackedLinkOutcome.Referral -> referrals.remember(outcome.code)
                is TrackedLinkOutcome.External -> openInBrowser(outcome.url)
                is TrackedLinkOutcome.Unresolved -> toast(ShareLinkErrorMessages.resFor(null))
            }
        }
    }

    private fun toast(messageRes: Int) {
        Toast.makeText(context, messageRes, Toast.LENGTH_SHORT).show()
    }

    /** Le NAVIGATEUR, jamais l'app elle-même : l'intention porte le sélecteur « navigateur » du système. */
    private fun openInBrowser(url: String) {
        val uri = Uri.parse(url)
        if (uri.scheme?.lowercase() !in setOf("http", "https")) return
        val intent = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_BROWSER)
            .setData(uri)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }
    }
}
