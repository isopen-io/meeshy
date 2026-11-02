package me.meeshy.sdk.net

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Singleton
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import me.meeshy.sdk.model.guest.GuestSessionEnd
import okhttp3.Interceptor
import okhttp3.Response

/** La passerelle a termine une session d'invite ; [refusedToken] nomme la session refusee (REST), jamais une session ouverte depuis. */
public data class GuestSessionEndSignal(val end: GuestSessionEnd, val refusedToken: String?)

/** Le canal de fin de session d'invite (iOS `Notification.Name.meeshyGuestSessionEnded`), emis sans bloquer le reseau. */
public class GuestSessionEndNotifier {
    private val _ends = MutableSharedFlow<GuestSessionEndSignal>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    public val ends: SharedFlow<GuestSessionEndSignal> = _ends.asSharedFlow()

    public fun notifyEnded(signal: GuestSessionEndSignal) {
        _ends.tryEmit(signal)
    }
}

/**
 * Lit les refus qui terminent la session d'un invite de lien (`403 SHARE_LINK_EXPIRED`, `410 GUEST_ACCESS_REVOKED`) et les
 * signale : retenter ne peut pas aboutir, l'ecran doit le dire (iOS `GuestSessionEnd.signal`). Seule une requete partie
 * SOUS le jeton de la session invitee detenue compte — jamais celle d'un compte, ni la cle anonyme d'un visiteur ; la
 * reponse ressort intacte.
 */
internal class GuestSessionEndInterceptor(
    private val tokenStore: TokenStore,
    private val onEnded: (GuestSessionEndSignal) -> Unit,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        if (response.code != 403 && response.code != 410) return response
        val sent = (chain.request().sentCredential()?.credential as? RequestCredential.AnonymousSession)?.token ?: return response
        if (tokenStore.jwt != null || tokenStore.sessionToken != sent) return response
        val body = runCatching { response.peekBody(MAX_BODY_BYTES).string() }.getOrNull() ?: return response
        val envelope = runCatching { Json.parseToJsonElement(body) as? JsonObject }.getOrNull() ?: return response
        val end = GuestSessionEnd.from(response.code, envelope.text("code"), envelope.text("error")) ?: return response
        onEnded(GuestSessionEndSignal(end, refusedToken = sent))
        return response
    }

    private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

    private companion object {
        const val MAX_BODY_BYTES = 4_096L
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal object GuestSessionEndModule {
    @Provides
    @Singleton
    fun providesGuestSessionEndNotifier(): GuestSessionEndNotifier = GuestSessionEndNotifier()

    @Provides
    @IntoSet
    fun providesGuestSessionEndContributor(tokenStore: TokenStore, notifier: GuestSessionEndNotifier): HttpClientContributor =
        HttpClientContributor.of("guest-session-end", HttpPriority.GUEST_SESSION_END) {
            it.addInterceptor(GuestSessionEndInterceptor(tokenStore, notifier::notifyEnded))
        }
}
