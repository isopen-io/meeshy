package me.meeshy.sdk.game

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.link.AffiliateReferralRepository
import me.meeshy.sdk.link.AffiliateRepository
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.game.ReferralLinkRule

/** Le lien de parrainage de l'utilisateur, tel que la carte partagée le porte. */
public interface ReferralLinkProviding {
    /** Le lien d'un jeton qui EXISTE déjà (cache d'abord, puis la liste), ou `null`. Ne crée RIEN, jamais. */
    public suspend fun existingLink(): String?

    /** Le lien à partager : celui d'un jeton existant, sinon celui du jeton que ce geste crée. `null` sur un refus. */
    public suspend fun shareableLink(): String?
}

/** Ce que le service lit et écrit : les jetons du lecteur et leur cache. Chaque panne rend `null`. */
public interface ReferralTokenGateway {
    public fun cachedTokens(): List<AffiliateToken>
    public suspend fun listTokens(): List<AffiliateToken>?
    public suspend fun createToken(name: String): AffiliateToken?
    public fun store(tokens: List<AffiliateToken>)
}

/** La passerelle réelle : l'affiliation, et le cache que l'écran « Parrainage » lit déjà (une seule liste). */
@Singleton
public class AffiliateTokenGateway @Inject constructor(
    private val reading: AffiliateRepository,
    private val writing: AffiliateReferralRepository,
    private val cache: LinksCache,
) : ReferralTokenGateway {
    override fun cachedTokens(): List<AffiliateToken> = cache.affiliateTokens().orEmpty()

    override suspend fun listTokens(): List<AffiliateToken>? = reading.listTokens().getOrNull()

    override suspend fun createToken(name: String): AffiliateToken? = writing.createToken(name).getOrNull()

    override fun store(tokens: List<AffiliateToken>) {
        cache.putAffiliateTokens(tokens)
    }
}

/**
 * LE LIEN DE PARRAINAGE DE L'UTILISATEUR (#7742), cache-first, miroir d'iOS `ReferralLinkService` :
 *
 *  1. un jeton utilisable déjà en cache donne le lien SUR-LE-CHAMP ;
 *  2. sinon la liste se lit au réseau, et le premier jeton utilisable sert ;
 *  3. sinon — et SEULEMENT à [shareableLink], le toucher de « Partager » — le geste CRÉE le jeton
 *     (« Invitation Meeshy »).
 *
 * **Échouer ne partage rien** : une lecture en panne ne crée pas de jeton à l'aveugle, et chaque échec rend
 * `null` — la carte part alors sans bandeau.
 */
@Singleton
public class ReferralLinkService internal constructor(
    private val gateway: ReferralTokenGateway,
    private val now: () -> Long,
) : ReferralLinkProviding {

    @Inject
    public constructor(gateway: ReferralTokenGateway) : this(gateway, System::currentTimeMillis)

    private sealed interface Lookup {
        data class Found(val link: String) : Lookup

        /** La liste a été LUE et ne porte aucun jeton utilisable : seul cas où créer a un sens. */
        data class None(val listed: List<AffiliateToken>) : Lookup

        /** La lecture a échoué : on ne sait pas, donc on ne crée pas. */
        data object Unreadable : Lookup
    }

    private suspend fun lookup(): Lookup {
        ReferralLinkRule.link(gateway.cachedTokens(), now())?.let { return Lookup.Found(it) }
        val tokens = gateway.listTokens() ?: return Lookup.Unreadable
        gateway.store(tokens)
        val listed = ReferralLinkRule.link(tokens, now()) ?: return Lookup.None(tokens)
        return Lookup.Found(listed)
    }

    override suspend fun existingLink(): String? = (lookup() as? Lookup.Found)?.link

    override suspend fun shareableLink(): String? = when (val found = lookup()) {
        is Lookup.Found -> found.link
        Lookup.Unreadable -> null
        is Lookup.None -> {
            val created = gateway.createToken(ReferralLinkRule.TOKEN_NAME)
            if (created == null) {
                null
            } else {
                gateway.store(listOf(created) + found.listed)
                created.takeIf { ReferralLinkRule.isUsable(it, now()) }?.affiliateLink
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ReferralLinkModule {
    @Binds
    abstract fun bindGateway(gateway: AffiliateTokenGateway): ReferralTokenGateway

    @Binds
    abstract fun bindProvider(service: ReferralLinkService): ReferralLinkProviding
}
