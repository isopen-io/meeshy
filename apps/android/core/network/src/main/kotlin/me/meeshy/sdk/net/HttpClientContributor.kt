package me.meeshy.sdk.net

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor

/**
 * LE point d'extension du client HTTP : un lot qui a besoin d'un intercepteur, d'un
 * authenticator ou d'un écouteur d'événements le CONTRIBUE par un
 * `@IntoSet HttpClientContributor` (module Hilt de son lot) au lieu d'éditer
 * [MeeshyApi.create].
 *
 * L'ordre est déterministe : [priority] croissante, puis [id] alphabétique pour départager
 * deux contributeurs de même priorité. Un intercepteur d'une priorité plus basse est plus
 * EXTÉRIEUR (il voit la requête en premier et la réponse en dernier). Un seul
 * authenticator vaut : le dernier contribué gagne.
 */
interface HttpClientContributor {
    val id: String
    val priority: Int
    fun contribute(builder: OkHttpClient.Builder)

    companion object {
        fun of(id: String, priority: Int, block: (OkHttpClient.Builder) -> Unit): HttpClientContributor =
            FunctionContributor(id, priority, block)
    }
}

private class FunctionContributor(
    override val id: String,
    override val priority: Int,
    private val block: (OkHttpClient.Builder) -> Unit,
) : HttpClientContributor {
    override fun contribute(builder: OkHttpClient.Builder) = block(builder)
}

/** Les priorités du socle ; un lot ultérieur choisit une valeur ENTRE elles. */
object HttpPriority {
    const val URL_GUARD = 100
    const val ENDPOINT_POLICY = 200
    const val RETRY = 300
    const val PROACTIVE_REFRESH = 900
    const val AUTH = 1_000
    const val CLIENT_CAPABILITIES = 1_100
    const val DEVICE_LOCALE = 1_200
    const val AUTH_EXPIRY = 1_300
    const val AUTHENTICATOR = 1_400
    const val SLOW_REQUEST = 1_500
    const val LOGGING = 9_000
}

object HttpClientAssembler {

    fun ordered(contributors: Collection<HttpClientContributor>): List<HttpClientContributor> =
        contributors.sortedWith(compareBy({ it.priority }, { it.id }))

    fun build(
        contributors: Collection<HttpClientContributor>,
        base: OkHttpClient.Builder = OkHttpClient.Builder(),
    ): OkHttpClient {
        ordered(contributors).forEach { it.contribute(base) }
        return base.build()
    }
}

/** Le socle historique de [MeeshyApi.create], décomposé en contributeurs ordonnés. */
internal fun builtInContributors(
    config: MeeshyConfig,
    tokenStore: TokenStore,
    onSessionExpired: () -> Unit,
    refresher: SessionRefresher,
    transition: SessionTransitionFlags = SessionTransitionFlags(),
): List<HttpClientContributor> = listOfNotNull(
    HttpClientContributor.of("url-guard", HttpPriority.URL_GUARD) { it.addInterceptor(UrlGuardInterceptor()) },
    HttpClientContributor.of("endpoint-policy", HttpPriority.ENDPOINT_POLICY) {
        it.addInterceptor(EndpointPolicyInterceptor())
    },
    HttpClientContributor.of("retry", HttpPriority.RETRY) { it.addInterceptor(RetryInterceptor()) },
    HttpClientContributor.of("proactive-refresh", HttpPriority.PROACTIVE_REFRESH) {
        it.addInterceptor(ProactiveRefreshInterceptor(tokenStore, refresher))
    },
    HttpClientContributor.of("auth", HttpPriority.AUTH) { it.addInterceptor(AuthInterceptor(tokenStore, transition)) },
    // Annonce ce que ce binaire sait LIRE. Ne se pose qu'apres que la lecture v3 existe :
    // l'inverse echangerait une sentinelle lisible contre un ecran vide.
    HttpClientContributor.of("client-capabilities", HttpPriority.CLIENT_CAPABILITIES) {
        it.addInterceptor(ClientCapabilitiesInterceptor())
    },
    // Signal Prisme 4e priorite : la locale de l'appareil (X-Device-Locale).
    HttpClientContributor.of("device-locale", HttpPriority.DEVICE_LOCALE) {
        it.addInterceptor(DeviceLocaleInterceptor())
    },
    HttpClientContributor.of("auth-expiry", HttpPriority.AUTH_EXPIRY) {
        it.addInterceptor(AuthExpiryInterceptor(signalsExpiry = refresher::signalsExpiry, onSessionExpired = onSessionExpired))
    },
    HttpClientContributor.of("refresh-authenticator", HttpPriority.AUTHENTICATOR) {
        it.authenticator(RefreshAuthenticator(tokenStore, refresher))
    },
    HttpClientContributor.of("slow-request", HttpPriority.SLOW_REQUEST) {
        it.eventListenerFactory(SlowRequestEventListener.factory())
    },
    if (config.enableLogging) {
        // Le garde REMPLACE le logger (#4811) : niveau BODY par defaut, BASIC des qu'un
        // mot de passe est au corps — voir `SensitiveBodyLoggingGuard`.
        HttpClientContributor.of("logging", HttpPriority.LOGGING) {
            it.addInterceptor(SensitiveBodyLoggingGuard.atLevel(HttpLoggingInterceptor.Level.BODY))
        }
    } else {
        null
    },
)
