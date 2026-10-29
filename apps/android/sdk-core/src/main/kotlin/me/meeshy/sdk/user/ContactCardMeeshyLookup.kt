package me.meeshy.sdk.user

import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope
import me.meeshy.sdk.net.api.PublicContactAccount
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket

/** Le compte inscrit qu'une carte désigne : de quoi dessiner la rangée « Sur Meeshy » sous la carte. */
data class ContactCardMeeshyAccount(val userId: String, val displayName: String, val avatarUrl: String?)

/**
 * « Cette carte de visite est-elle sur Meeshy ? », pour la rangée sous la bulle du fil (miroir de
 * `primaryAccount`, iOS). Ne fait QUE composer deux caches existants : la carte déjà sur l'appareil ([VCardCache]) et
 * les comptes rapprochés ([ContactCardAccountResolver], même cache et même ticket de compte que la fiche).
 *
 * **Échec fermé** (#13622) : hors d'un [ContactCardResolutionScope.mayResolveOnServer], ni lecture ni requête — la
 * réponse est « rien », sans rien dire de pourquoi. Et **aucun réseau pour lire la carte** : un fichier non
 * téléchargé n'a pas d'`uri` local, donc rien ne part. Une requête par jeu d'identifiants au plus : une carte vue deux fois à la fois, ou portée par deux pièces, partage le même vol — mais jamais d'un compte à l'autre : le vol est tenu par (ticket de compte, pièce), le compte qui arrive après une bascule ne rejoint pas celui du précédent.
 */
@Singleton
class ContactCardMeeshyLookup internal constructor(
    private val cards: VCardCache,
    private val resolver: ContactCardAccountResolver,
    private val fence: AccountFence? = null,
    private val defaultCountry: () -> String?,
) {
    @Inject
    constructor(cards: VCardCache, resolver: ContactCardAccountResolver, fence: AccountFence) :
        this(cards, resolver, fence, { Locale.getDefault().country.ifBlank { null } })

    private val flights = SingleFlight<Pair<AccountTicket?, String>, ContactCardMeeshyAccount?>()

    /** Le compte déjà connu, sans attendre ni toucher le réseau (une bulle qui revient à l'écran s'affiche d'emblée). */
    fun cached(key: String, scope: ContactCardResolutionScope): ContactCardMeeshyAccount? {
        if (!scope.mayResolveOnServer) return null
        val card = cards.cached(key) ?: return null
        return resolver.cached(card.request(defaultCountry()))?.primary()
    }

    suspend fun lookup(key: String, localUri: String, scope: ContactCardResolutionScope): ContactCardMeeshyAccount? {
        if (!scope.mayResolveOnServer) return null
        cached(key, scope)?.let { return it }
        val ticket = fence?.currentTicket()
        return flights.run(ticket to key) {
            val card = cards.load(key, localUri) ?: return@run null
            resolver.resolve(card.request(defaultCountry())).primary()
        }
    }

    private fun List<PublicContactAccount>.primary(): ContactCardMeeshyAccount? = firstOrNull()?.let {
        ContactCardMeeshyAccount(it.userId, it.displayName.ifBlank { it.username }, it.avatarUrl)
    }
}
