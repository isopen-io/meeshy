package me.meeshy.sdk.session

import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.AuthStorageKeys
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.droppingDataUriImages
import me.meeshy.sdk.model.security.SecureStore
import timber.log.Timber

/**
 * Le profil d'un compte dans le coffre de l'appareil (`meeshy_user_<id>`, pendant de `AuthProfileKeychainStore` iOS) :
 * un démarrage à froid, hors ligne compris, peint l'entête et l'écran profil avant la réponse de `/auth/me`.
 *
 * Le profil est écrit SANS image `data:` (taille bornée) et rangé dans l'espace du compte : celui d'un compte n'est
 * jamais lu pour un autre. Un échec est journalisé avec l'identifiant public seulement — jamais le contenu.
 */
class AuthProfileVault(
    private val store: SecureStore,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    fun save(user: MeeshyUser) {
        if (user.id.isBlank()) return
        try {
            val payload = json.encodeToString(MeeshyUser.serializer(), user.droppingDataUriImages())
            if (!store.put(AuthStorageKeys.user(user.id), payload, user.id)) {
                Timber.e("Profil non écrit dans le coffre pour userId %s", user.id)
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (_: Exception) {
            Timber.e("Profil non sérialisé pour userId %s", user.id)
        }
    }

    /** Le profil gardé pour [userId] ; `null` s'il est absent, illisible ou n'est pas celui de ce compte. */
    fun load(userId: String): MeeshyUser? {
        if (userId.isBlank()) return null
        val raw = store.get(AuthStorageKeys.user(userId), userId) ?: return null
        return try {
            json.decodeFromString(MeeshyUser.serializer(), raw).takeIf { it.id == userId }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (_: Exception) {
            Timber.e("Profil du coffre illisible pour userId %s", userId)
            null
        }
    }

    fun clear(userId: String) {
        if (userId.isBlank()) return
        store.remove(AuthStorageKeys.user(userId), userId)
    }
}
