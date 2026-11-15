package me.meeshy.sdk.net

import me.meeshy.sdk.model.game.GameWire
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Pose `X-Meeshy-Game-Version: 2` sur les routes du jeu et sur elles seules : `/me/engagement`, `/me/game/…`,
 * `/me/meesh/…` et `/users/:id/game` (avec sa vitrine). Sans l'en-tête, la passerelle sert l'ancien comportement ; le
 * client déclare donc la vague qu'il sait lire, jamais davantage, et ne l'envoie pas aux autres routes.
 * Un en-tête déjà posé n'est jamais écrasé.
 */
class GameVersionInterceptor : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!isGameRoute(request.url) || request.header(GameWire.versionHeader) != null) return chain.proceed(request)
        return chain.proceed(request.newBuilder().header(GameWire.versionHeader, GameWire.waveVersion.toString()).build())
    }

    companion object {
        private val apiPrefix = listOf("api", "v1")

        fun isGameRoute(url: HttpUrl): Boolean {
            val all = url.pathSegments
            val segments = if (all.take(2) == apiPrefix) all.drop(2) else all
            return when (segments.firstOrNull()) {
                "me" -> segments.getOrNull(1).let { it == "engagement" && segments.size == 2 || it == "game" && segments.size > 2 || it == "meesh" && segments.size > 2 }
                "users" -> segments.size >= 3 && segments[1].isNotEmpty() && segments[2] == "game" && (segments.size == 3 || segments[3] == "showcase" && segments.size == 4)
                else -> false
            }
        }
    }
}
