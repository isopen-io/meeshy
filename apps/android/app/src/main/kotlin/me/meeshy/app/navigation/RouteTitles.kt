package me.meeshy.app.navigation

import androidx.annotation.StringRes
import me.meeshy.app.R
import me.meeshy.app.navigation.graph.CommunityRoutes
import me.meeshy.app.navigation.graph.FriendRequestListDestinations
import me.meeshy.app.navigation.graph.FriendRequestsDestinations
import me.meeshy.app.navigation.graph.GameRoutes
import me.meeshy.app.navigation.graph.LinksRoutes

/**
 * Le titre de scène de chaque route (iOS `Route.displayTitle`, chaînes `route.title.*` du catalogue) : ce que
 * TalkBack annonce à l'arrivée et ce que la barre d'une fenêtre large affiche. Une route sans titre propre — une
 * conversation, dont le titre est son nom — rend `null` ; [sceneTitleRes] retombe alors sur « Conversations ».
 */
internal object RouteTitles {

    private val titles: Map<String, Int> = mapOf(
        Routes.SETTINGS to R.string.route_title_settings,
        Routes.PROFILE_USER to R.string.route_title_profile,
        Routes.CONTACTS_DISCOVER to R.string.route_title_discover,
        Routes.NEARBY_DISCOVERY to R.string.route_title_nearby,
        CommunityRoutes.LIST to R.string.route_title_communities,
        CommunityRoutes.DETAIL to R.string.route_title_community,
        CommunityRoutes.CREATE to R.string.route_title_community_create,
        CommunityRoutes.SETTINGS to R.string.route_title_community_settings,
        CommunityRoutes.MEMBERS to R.string.route_title_members,
        CommunityRoutes.INVITE to R.string.route_title_invite,
        Routes.NOTIFICATIONS to R.string.route_title_notifications,
        GameRoutes.PROGRESSION to R.string.route_title_progression,
        LinksRoutes.HUB to R.string.route_title_links,
        LinksRoutes.AFFILIATE to R.string.route_title_affiliate,
        LinksRoutes.TRACKING to R.string.route_title_tracking_links,
        Routes.MY_SHARE_LINKS to R.string.route_title_share_links,
        LinksRoutes.COMMUNITY to R.string.route_title_community_links,
        Routes.DATA_EXPORT to R.string.route_title_data_export,
        Routes.POST_DETAIL to R.string.route_title_post,
        Routes.SAVED_POSTS to R.string.route_title_bookmarks,
        Routes.STARRED to R.string.route_title_starred,
        FriendRequestsDestinations.ROUTE to R.string.route_title_friend_requests,
        FriendRequestListDestinations.ROUTE to R.string.route_title_friend_requests,
        Routes.STORY_VIEWER to R.string.route_title_story,
        Routes.MOOD_SPOTLIGHT to R.string.route_title_mood,
    ).mapKeys { (route, _) -> base(route) }

    /** Le titre de la route [route] (son motif de destination, requête comprise ou non), ou `null`. */
    @StringRes
    fun titleRes(route: String?): Int? = route?.let { titles[base(it)] }

    /** Le titre de la scène : celui de la route, sinon « Conversations » (iOS `Router.sceneTitle`). */
    @StringRes
    fun sceneTitleRes(route: String?): Int = titleRes(route) ?: R.string.route_title_conversations

    private fun base(route: String): String = route.substringBefore('?')
}
