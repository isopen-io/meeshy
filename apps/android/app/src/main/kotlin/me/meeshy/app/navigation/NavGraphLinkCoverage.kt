package me.meeshy.app.navigation

import me.meeshy.app.navigation.graph.GameRoutes
import me.meeshy.app.navigation.graph.LinksRoutes

/**
 * **Les adresses que le graphe de navigation lit lui-même** (ses `navDeepLink`) : le `NavHost` les ouvre au
 * démarrage à froid, [WarmDeepLink] app ouverte. La racine ne rejoue pas ce que le graphe a déjà ouvert — un lien
 * rejoué deux fois empilerait deux fois son écran.
 */
internal object NavGraphLinkCoverage {
    val patterns: List<String> = listOf(
        Routes.GUEST_JOIN_DEEP_LINK,
        Routes.GUEST_JOIN_WEB_DEEP_LINK,
        Routes.GUEST_JOIN_CHAT_WEB_DEEP_LINK,
        Routes.WORLD_ENTRY_DEEP_LINK,
        Routes.WORLD_ENTRY_WEB_DEEP_LINK,
        Routes.CONVERSATIONS_DEEP_LINK,
        Routes.CHAT_DEEP_LINK,
        Routes.CONVERSATION_DEEP_LINK,
        Routes.CONVERSATION_SINGULAR_DEEP_LINK,
        Routes.CONVERSATION_DRAFT_DEEP_LINK,
        Routes.CONVERSATION_SHORT_DEEP_LINK,
        Routes.PACK_SHOP_DEEP_LINK,
        Routes.PROFILE_DEEP_LINK,
        Routes.PROFILE_SHARE_APP_DEEP_LINK,
        Routes.PROFILE_SHARE_WEB_DEEP_LINK,
        Routes.STORY_DEEP_LINK,
    ) + Routes.POST_SHARE_DEEP_LINKS + Routes.REEL_SHARE_DEEP_LINKS + Routes.STORY_SHARE_DEEP_LINKS +
        LinksRoutes.HUB_DEEP_LINKS + GameRoutes.PROGRESSION_DEEP_LINKS

    private val compiled: List<Regex> = patterns.map(::regexOf)

    fun covers(raw: String): Boolean {
        val address = raw.substringBefore('#').substringBefore('?').trimEnd('/')
        return compiled.any { it.matches(address) }
    }

    private fun regexOf(pattern: String): Regex {
        val path = pattern.substringBefore('?').trimEnd('/')
        val body = path.split(Regex("\\{[^}]*\\}")).joinToString("[^/?#]+") { Regex.escape(it) }
        return Regex(body, RegexOption.IGNORE_CASE)
    }
}
