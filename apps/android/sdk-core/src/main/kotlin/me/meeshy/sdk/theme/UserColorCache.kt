package me.meeshy.sdk.theme

import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.session.PerAccountCache

/**
 * Cache de couleurs d'utilisateur (miroir d'iOS `UserColorCache`) : l'accent d'une conversation
 * fondu à 30 % dans l'indigo de marque à 70 %, et la couleur déterministe d'un nom. Vidé à la
 * déconnexion (PerAccountCache) pour qu'un second compte n'hérite de rien.
 */
@Singleton
public class UserColorCache @Inject constructor() : PerAccountCache {

    private val blended = ConcurrentHashMap<String, String>()
    private val users = ConcurrentHashMap<String, String>()

    public fun blendedColor(conversationAccent: String): String {
        val key = conversationAccent.uppercase()
        return blended.getOrPut(key) {
            DynamicColorGenerator.blendTwo(key, ACCENT_WEIGHT, BRAND_INDIGO, INDIGO_WEIGHT)
        }
    }

    public fun colorForUser(name: String): String =
        users.getOrPut(name) { DynamicColorGenerator.colorForName(name) }

    override suspend fun clear() {
        blended.clear()
        users.clear()
    }

    private companion object {
        const val BRAND_INDIGO = "6366F1"
        const val ACCENT_WEIGHT = 0.30
        const val INDIGO_WEIGHT = 0.70
    }
}
