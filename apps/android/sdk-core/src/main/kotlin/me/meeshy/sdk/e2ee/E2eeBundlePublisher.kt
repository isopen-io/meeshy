package me.meeshy.sdk.e2ee

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.crypto.keys.E2eeIdentityUnreadableException
import me.meeshy.sdk.model.signal.BundlePublicationDecision
import me.meeshy.sdk.model.signal.BundlePublicationPolicy
import me.meeshy.sdk.model.signal.BundlePublishRetryPolicy
import me.meeshy.sdk.model.signal.RemoteBundleLookup
import me.meeshy.sdk.model.signal.SignalFailure
import me.meeshy.sdk.model.signal.SignalPreKeyBundle
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject
import javax.inject.Singleton

/** Le bundle PUBLIC local d'un compte (les clés privées ne sortent jamais du coffre). */
interface LocalBundleSource {
    fun bundleFor(userId: String): SignalPreKeyBundle

    /** Réinitialisation CONSENTIE : efface l'identité locale et reconnaît le coffre (aucune lecture distante). */
    fun resetIdentity(userId: String)

    /** Déconnexion : efface les clés E2EE de ce compte. */
    fun forget(userId: String)
}

/** Interrupteur de publication : tant que la passerelle ne tranche pas un bundle par appareil, désactivé. */
fun interface E2eeBundlePublicationFlag {
    fun isEnabled(): Boolean
}

fun interface E2eeAccountSource {
    fun activeUserId(): String?
}

/** Programme (une seule fois) une publication différée, avec réseau et recul. */
fun interface E2eeBundlePublishScheduler {
    fun schedule()
}

/** Ce que l'interface dit de l'E2EE de cet appareil. */
enum class E2eeBundleState { IDLE, PUBLISHING, PUBLISHED, OWNED_BY_ANOTHER_DEVICE, WAITING_TO_RETRY, UNAVAILABLE, IDENTITY_UNREADABLE }

sealed interface BundlePublishOutcome {
    data object Disabled : BundlePublishOutcome
    data object NoAccount : BundlePublishOutcome
    data object Published : BundlePublishOutcome
    data object AlreadyUpToDate : BundlePublishOutcome
    data object OwnedByAnotherDevice : BundlePublishOutcome
    data object CannotVerify : BundlePublishOutcome
    data object RetryLater : BundlePublishOutcome
    data object GaveUp : BundlePublishOutcome
    data object IdentityUnreadable : BundlePublishOutcome
}

/**
 * Publie le bundle E2EE de l'appareil de façon PARESSEUSE : jamais au démarrage, seulement quand une
 * conversation chiffrée est ouverte ou activée ([onEncryptedConversationActive]), hors du chemin du
 * premier écran. Avant tout POST l'appareil relit le bundle du compte et NE l'écrase PAS s'il porte
 * une autre identityKey ([BundlePublicationPolicy]).
 */
@Singleton
class E2eeBundlePublisher @Inject constructor(
    private val local: LocalBundleSource,
    private val gateway: SignalBundleGateway,
    private val flag: E2eeBundlePublicationFlag,
    private val accounts: E2eeAccountSource,
    private val scheduler: E2eeBundlePublishScheduler,
    @IoDispatcher private val io: CoroutineDispatcher,
) {
    private val _state = MutableStateFlow(E2eeBundleState.IDLE)
    val state: StateFlow<E2eeBundleState> = _state.asStateFlow()

    /** Déclencheur paresseux : non bloquant, sans effet si désactivé ou déjà publié. */
    fun onEncryptedConversationActive() {
        if (!flag.isEnabled()) return
        if (_state.value == E2eeBundleState.PUBLISHED || _state.value == E2eeBundleState.OWNED_BY_ANOTHER_DEVICE ||
            _state.value == E2eeBundleState.IDENTITY_UNREADABLE
        ) return
        scheduler.schedule()
    }

    /** Déconnexion : efface les clés du compte et l'état. */
    suspend fun onSignedOut(userId: String) {
        withContext(io) { local.forget(userId) }
        _state.value = E2eeBundleState.IDLE
    }

    suspend fun publish(attempt: Int = 0): BundlePublishOutcome {
        if (!flag.isEnabled()) return BundlePublishOutcome.Disabled
        val userId = accounts.activeUserId()?.takeIf { it.isNotBlank() } ?: return BundlePublishOutcome.NoAccount
        _state.value = E2eeBundleState.PUBLISHING
        val bundle = try {
            withContext(io) { local.bundleFor(userId) }
        } catch (_: E2eeIdentityUnreadableException) {
            return settle(E2eeBundleState.IDENTITY_UNREADABLE, BundlePublishOutcome.IdentityUnreadable)
        }
        val lookup = when (val remote = gateway.fetchBundle(userId)) {
            is NetworkResult.Success -> RemoteBundleLookup.of(remote.data)
            is NetworkResult.Failure -> lookupFor(remote.error) ?: return failed(remote.error, attempt)
        }
        return when (BundlePublicationPolicy.decide(bundle, lookup)) {
            BundlePublicationDecision.ALREADY_UP_TO_DATE -> settle(E2eeBundleState.PUBLISHED, BundlePublishOutcome.AlreadyUpToDate)
            BundlePublicationDecision.OWNED_BY_ANOTHER_DEVICE ->
                settle(E2eeBundleState.OWNED_BY_ANOTHER_DEVICE, BundlePublishOutcome.OwnedByAnotherDevice)
            BundlePublicationDecision.CANNOT_VERIFY -> settle(E2eeBundleState.UNAVAILABLE, BundlePublishOutcome.CannotVerify)
            BundlePublicationDecision.PUBLISH -> when (val upload = gateway.uploadBundle(bundle)) {
                is NetworkResult.Success -> settle(E2eeBundleState.PUBLISHED, BundlePublishOutcome.Published)
                is NetworkResult.Failure -> failed(upload.error, attempt)
            }
        }
    }

    /**
     * Sortie explicite et CONSENTIE d'une identité illisible ou revendiquée par un autre appareil :
     * l'identité locale est refaite et publiée sans comparaison avec le bundle distant, ce qui remplace
     * celui de l'autre appareil. L'interface doit l'avoir demandé à l'utilisateur.
     */
    suspend fun resetIdentity(attempt: Int = 0): BundlePublishOutcome {
        if (!flag.isEnabled()) return BundlePublishOutcome.Disabled
        val userId = accounts.activeUserId()?.takeIf { it.isNotBlank() } ?: return BundlePublishOutcome.NoAccount
        _state.value = E2eeBundleState.PUBLISHING
        withContext(io) { local.resetIdentity(userId) }
        val bundle = try {
            withContext(io) { local.bundleFor(userId) }
        } catch (_: E2eeIdentityUnreadableException) {
            return settle(E2eeBundleState.IDENTITY_UNREADABLE, BundlePublishOutcome.IdentityUnreadable)
        }
        return when (val upload = gateway.uploadBundle(bundle)) {
            is NetworkResult.Success -> settle(E2eeBundleState.PUBLISHED, BundlePublishOutcome.Published)
            is NetworkResult.Failure -> failed(upload.error, attempt)
        }
    }

    private fun lookupFor(error: ApiError): RemoteBundleLookup? = when (SignalFailure.from(error.httpStatus, error.code)) {
        SignalFailure.KEYS_NOT_PUBLISHED -> RemoteBundleLookup.NotPublished
        SignalFailure.NOT_AUTHORIZED -> RemoteBundleLookup.SelfRouteRefused
        else -> null
    }

    private fun settle(state: E2eeBundleState, outcome: BundlePublishOutcome): BundlePublishOutcome {
        _state.value = state
        return outcome
    }

    private fun failed(error: ApiError, attempt: Int): BundlePublishOutcome =
        if (BundlePublishRetryPolicy.shouldRetry(error.httpStatus, error.code, attempt)) {
            settle(E2eeBundleState.WAITING_TO_RETRY, BundlePublishOutcome.RetryLater)
        } else {
            settle(E2eeBundleState.UNAVAILABLE, BundlePublishOutcome.GaveUp)
        }
}
