package me.meeshy.sdk.net

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Singleton
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.auth.AccountDeletedSignal
import me.meeshy.sdk.model.auth.AgeGateSignal
import okhttp3.Interceptor
import okhttp3.Response
import okio.Buffer

/**
 * Les deux refus de session que la couche réseau annonce sans savoir ce qu'est une déconnexion (iOS
 * `AccountDeletedSignal.signal`, `AgeGateSignal.signal`) : un compte supprimé (le propriétaire du jeton présenté seul) et
 * un compte de moins de 13 ans. Émettre ne bloque jamais le fil réseau.
 *
 * Le compte supprimé est posé « en attente de retrait » AVANT que la notification ne parte, depuis n'importe quel fil :
 * aucun refus arrivé entre-temps n'invite à se reconnecter à ce compte ([isAwaitingRetirement]).
 */
public class SessionRefusalNotifier {
    private val awaiting: MutableSet<String> = ConcurrentHashMap.newKeySet()
    private val _accountDeleted = MutableSharedFlow<String>(extraBufferCapacity = BUFFER, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    private val _ageRefused = MutableStateFlow(false)

    /** Chaque compte nommé et possédé, après sa mise en attente de retrait. */
    public val accountDeleted: SharedFlow<String> = _accountDeleted.asSharedFlow()

    /** COLLANT : un refus d'âge arrivé avant que l'hôte écoute ne se perd pas ; seul « J'ai compris » le lève. */
    public val ageRefused: StateFlow<Boolean> = _ageRefused.asStateFlow()

    public fun isAwaitingRetirement(accountId: String): Boolean = accountId in awaiting

    /** Un retrait est-il en cours, pour un compte quelconque ? */
    public val hasPendingRetirement: Boolean get() = awaiting.isNotEmpty()

    public fun notifyAccountDeleted(accountId: String) {
        awaiting.add(accountId)
        _accountDeleted.tryEmit(accountId)
    }

    public fun retirementDone(accountId: String) {
        awaiting.remove(accountId)
    }

    public fun notifyAgeBelowMinimum() {
        _ageRefused.value = true
    }

    public fun acknowledgeAgeRefusal() {
        _ageRefused.value = false
    }

    private companion object {
        const val BUFFER = 8
    }
}

/**
 * Lit, sur la réponse FINALE, un `401 ACCOUNT_DELETED` et un `403 AGE_BELOW_MINIMUM` (iOS `APIClient`). Le compte nommé
 * n'est retenu que s'il est le PROPRIÉTAIRE du jeton présenté — le JWT d'`Authorization` et, pour `/auth/refresh`, celui du
 * corps — jamais le compte actif au moment de la réponse. Tout autre 401 ou 403 passe sans bruit ; la réponse ressort
 * intacte.
 */
internal class SessionRefusalInterceptor(
    private val notifier: SessionRefusalNotifier,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        if (response.code != UNAUTHORIZED && response.code != FORBIDDEN) return response
        val body = runCatching { response.peekBody(MAX_BODY_BYTES).string() }.getOrNull()
        if (response.code == FORBIDDEN) {
            if (AgeGateSignal.isAgeRefusal(response.code, body)) notifier.notifyAgeBelowMinimum()
            return response
        }
        val named = AccountDeletedSignal.namedAccount(response.code, body) ?: return response
        val request = chain.request()
        val owner = AccountDeletedSignal.presentedOwner(request.header(RequestCredential.AUTHORIZATION), refreshBodyOf(request))
        AccountDeletedSignal.owned(named, owner)?.let(notifier::notifyAccountDeleted)
        return response
    }

    private fun refreshBodyOf(request: okhttp3.Request): String? {
        if (!request.url.encodedPath.endsWith(REFRESH_PATH)) return null
        val body = request.body ?: return null
        if (body.isOneShot() || body.isDuplex()) return null
        return runCatching { Buffer().also(body::writeTo).readUtf8() }.getOrNull()
    }

    private companion object {
        const val UNAUTHORIZED = 401
        const val FORBIDDEN = 403
        const val MAX_BODY_BYTES = 8_192L

        // api-path: la porte RECONNUE pour lire le jeton de son corps, jamais appelée ici.
        const val REFRESH_PATH = "/auth/refresh"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal object SessionRefusalModule {
    @Provides
    @Singleton
    fun providesSessionRefusalNotifier(): SessionRefusalNotifier = SessionRefusalNotifier()

    @Provides
    @IntoSet
    fun providesSessionRefusalContributor(notifier: SessionRefusalNotifier): HttpClientContributor =
        HttpClientContributor.of("session-refusal", HttpPriority.SESSION_REFUSAL) {
            it.addInterceptor(SessionRefusalInterceptor(notifier))
        }
}
