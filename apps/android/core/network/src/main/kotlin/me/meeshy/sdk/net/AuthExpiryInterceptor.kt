package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Traduit une session expiree en evenement, au lieu de la laisser remonter comme une
 * erreur de chargement.
 *
 * Constate a l'usage : une session expiree produit 401/403 sur `/conversations`,
 * `/posts/feed/stories` et `/friend-requests`, et l'ecran affichait « Couldn't load
 * conversations — Check your connection and try again » alors que le reseau
 * fonctionnait parfaitement. Le message accusait le reseau, et rien n'indiquait a
 * l'utilisateur qu'il devait se reconnecter : il ne lui restait qu'a reessayer
 * indefiniment.
 *
 * Le traitement vit ICI et non dans chaque ecran : les trois routes echouent
 * independamment, et un traitement par ecran laisserait le prochain appelant
 * reproduire le defaut a l'identique.
 */
public class AuthExpiryInterceptor(
    private val onSessionExpired: () -> Unit,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        if (response.code in EXPIRY_CODES && !chain.request().url.encodedPath.isAuthEntryPoint()) {
            onSessionExpired()
        }
        // La reponse ressort INTACTE : l'appelant a toujours besoin de son code
        // pour composer son propre message.
        return response
    }

    private fun String.isAuthEntryPoint(): Boolean = AUTH_ENTRY_POINTS.any { contains(it) }

    private companion object {
        /**
         * 403 y figure aussi : la passerelle repond « Authentication required to
         * access conversations » avec ce code. 500 en est volontairement ABSENT —
         * un hoquet de la passerelle ne doit pas deconnecter l'utilisateur.
         */
        private val EXPIRY_CODES = setOf(401, 403)

        /**
         * Un 401 sur ces routes n'est pas une session expiree mais la reponse
         * NORMALE d'un identifiant refuse. Deconnecter la-dessus ferait boucler
         * l'application sur son propre ecran de connexion.
         *
         * `/me/account/deletion` y figure au meme titre : un mot de passe refuse
         * sur la suppression de compte rend 401 INVALID_PASSWORD, qui n'est pas
         * non plus une session expiree.
         */
        private val AUTH_ENTRY_POINTS = listOf("/auth/login", "/auth/register", "/me/account/deletion")
    }
}
