package me.meeshy.sdk.e2ee

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.core.crypto.keys.E2eeIdentityUnreadableException
import me.meeshy.core.crypto.primitives.CryptoException
import me.meeshy.sdk.model.signal.SignalPreKeyBundle
import me.meeshy.sdk.model.signal.SignalPreKeyUploadResult
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class E2eeBundlePublisherTest {
    private fun bundle(identity: String = "ik") = SignalPreKeyBundle(
        identityKey = identity, registrationId = 1, deviceId = 1, signedPreKeyId = 2,
        signedPreKeyPublic = "spk", signedPreKeySignature = "sig",
    )

    private fun fail(status: Int?, code: String? = null) =
        NetworkResult.Failure(ApiError(message = "x", code = code, httpStatus = status))

    private class FakeGateway(
        var read: NetworkResult<SignalPreKeyBundle>,
        var upload: NetworkResult<SignalPreKeyUploadResult> = NetworkResult.Success(SignalPreKeyUploadResult()),
    ) : SignalBundleGateway {
        var uploads = 0
        var reads = 0
        override suspend fun uploadBundle(bundle: SignalPreKeyBundle): NetworkResult<SignalPreKeyUploadResult> {
            uploads++
            return upload
        }

        override suspend fun fetchBundle(userId: String): NetworkResult<SignalPreKeyBundle> {
            reads++
            return read
        }
    }

    private class Scheduler : E2eeBundlePublishScheduler {
        var scheduled = 0
        override fun schedule() { scheduled++ }
    }

    private fun TestScope.publisher(
        gateway: FakeGateway,
        enabled: Boolean = true,
        user: String? = "u1",
        scheduler: Scheduler = Scheduler(),
        forgotten: MutableList<String> = mutableListOf(),
        resets: MutableList<String> = mutableListOf(),
        unreadable: Boolean = false,
        vaultRefusesWrites: Boolean = false,
    ) = E2eeBundlePublisher(
        local = object : LocalBundleSource {
            override fun bundleFor(userId: String): SignalPreKeyBundle {
                if (unreadable && resets.isEmpty()) throw E2eeIdentityUnreadableException()
                if (vaultRefusesWrites) throw CryptoException("Clé E2EE non persistée")
                return bundle()
            }
            override fun forget(userId: String) { forgotten += userId }
            override fun resetIdentity(userId: String) { resets += userId }
        },
        gateway = gateway,
        flag = E2eeBundlePublicationFlag { enabled },
        accounts = E2eeAccountSource { user },
        scheduler = scheduler,
        io = StandardTestDispatcher(testScheduler),
    )

    @Test
    fun `rien n'est publie quand le drapeau est coupe`() = runTest {
        val gateway = FakeGateway(fail(404))
        val publisher = publisher(gateway, enabled = false)
        assertThat(publisher.publish()).isEqualTo(BundlePublishOutcome.Disabled)
        assertThat(gateway.reads).isEqualTo(0)
        assertThat(gateway.uploads).isEqualTo(0)
    }

    @Test
    fun `aucun compte aucune publication`() = runTest {
        val gateway = FakeGateway(fail(404))
        assertThat(publisher(gateway, user = null).publish()).isEqualTo(BundlePublishOutcome.NoAccount)
        assertThat(gateway.uploads).isEqualTo(0)
    }

    @Test
    fun `le declencheur paresseux programme une seule reprise et reste inerte si desactive`() = runTest {
        val scheduler = Scheduler()
        publisher(FakeGateway(fail(404)), enabled = false, scheduler = scheduler).onEncryptedConversationActive()
        assertThat(scheduler.scheduled).isEqualTo(0)
        publisher(FakeGateway(fail(404)), scheduler = scheduler).onEncryptedConversationActive()
        assertThat(scheduler.scheduled).isEqualTo(1)
    }

    @Test
    fun `un compte sans bundle recoit le sien`() = runTest {
        val gateway = FakeGateway(fail(404))
        val publisher = publisher(gateway)
        assertThat(publisher.publish()).isEqualTo(BundlePublishOutcome.Published)
        assertThat(gateway.uploads).isEqualTo(1)
        assertThat(publisher.state.value).isEqualTo(E2eeBundleState.PUBLISHED)
    }

    @Test
    fun `le bundle d'un autre appareil n'est jamais ecrase`() = runTest {
        val gateway = FakeGateway(NetworkResult.Success(bundle(identity = "autre")))
        val publisher = publisher(gateway)
        assertThat(publisher.publish()).isEqualTo(BundlePublishOutcome.OwnedByAnotherDevice)
        assertThat(gateway.uploads).isEqualTo(0)
        assertThat(publisher.state.value).isEqualTo(E2eeBundleState.OWNED_BY_ANOTHER_DEVICE)
    }

    @Test
    fun `un bundle identique n'est pas republie`() = runTest {
        val gateway = FakeGateway(NetworkResult.Success(bundle()))
        assertThat(publisher(gateway).publish()).isEqualTo(BundlePublishOutcome.AlreadyUpToDate)
        assertThat(gateway.uploads).isEqualTo(0)
    }

    @Test
    fun `la route de soi refusee ne publie pas`() = runTest {
        val gateway = FakeGateway(fail(403))
        assertThat(publisher(gateway).publish()).isEqualTo(BundlePublishOutcome.CannotVerify)
        assertThat(gateway.uploads).isEqualTo(0)
    }

    @Test
    fun `hors ligne la reprise est differee avec recul`() = runTest {
        val gateway = FakeGateway(fail(null, "NETWORK"))
        val publisher = publisher(gateway)
        assertThat(publisher.publish(attempt = 0)).isEqualTo(BundlePublishOutcome.RetryLater)
        assertThat(publisher.state.value).isEqualTo(E2eeBundleState.WAITING_TO_RETRY)
    }

    @Test
    fun `un 429 et un 4xx de publication ne bouclent pas apres le plafond ou sur 4xx`() = runTest {
        val rate = FakeGateway(fail(404), upload = fail(429))
        assertThat(publisher(rate).publish(attempt = 0)).isEqualTo(BundlePublishOutcome.RetryLater)
        assertThat(publisher(rate).publish(attempt = 5)).isEqualTo(BundlePublishOutcome.GaveUp)
        val bad = FakeGateway(fail(404), upload = fail(400))
        assertThat(publisher(bad).publish(attempt = 0)).isEqualTo(BundlePublishOutcome.GaveUp)
    }

    @Test
    fun `la deconnexion efface les cles du compte`() = runTest {
        val forgotten = mutableListOf<String>()
        val publisher = publisher(FakeGateway(fail(404)), forgotten = forgotten)
        publisher.onSignedOut("u1")
        assertThat(forgotten).containsExactly("u1")
        assertThat(publisher.state.value).isEqualTo(E2eeBundleState.IDLE)
    }

    @Test
    fun `une identite illisible ne publie rien et ne se reessaie pas`() = runTest {
        val gateway = FakeGateway(fail(404))
        val scheduler = Scheduler()
        val publisher = publisher(gateway, scheduler = scheduler, unreadable = true)
        assertThat(publisher.publish()).isEqualTo(BundlePublishOutcome.IdentityUnreadable)
        assertThat(publisher.state.value).isEqualTo(E2eeBundleState.IDENTITY_UNREADABLE)
        assertThat(gateway.reads).isEqualTo(0)
        assertThat(gateway.uploads).isEqualTo(0)
        publisher.onEncryptedConversationActive()
        assertThat(scheduler.scheduled).isEqualTo(0)
    }

    @Test
    fun `la reinitialisation consentie remplace l'identite et publie sans lire le bundle distant`() = runTest {
        val gateway = FakeGateway(NetworkResult.Success(bundle(identity = "autre")))
        val resets = mutableListOf<String>()
        val publisher = publisher(gateway, resets = resets, unreadable = true)
        publisher.publish()
        assertThat(publisher.resetIdentity()).isEqualTo(BundlePublishOutcome.Published)
        assertThat(resets).containsExactly("u1")
        assertThat(gateway.uploads).isEqualTo(1)
        assertThat(publisher.state.value).isEqualTo(E2eeBundleState.PUBLISHED)
    }

    @Test
    fun `la reinitialisation sort aussi de l'etat autre appareil mais jamais drapeau coupe ni sans compte`() = runTest {
        val owned = FakeGateway(NetworkResult.Success(bundle(identity = "autre")))
        val publisher = publisher(owned)
        publisher.publish()
        assertThat(publisher.state.value).isEqualTo(E2eeBundleState.OWNED_BY_ANOTHER_DEVICE)
        assertThat(publisher.resetIdentity()).isEqualTo(BundlePublishOutcome.Published)
        assertThat(publisher(owned, enabled = false).resetIdentity()).isEqualTo(BundlePublishOutcome.Disabled)
        assertThat(publisher(owned, user = null).resetIdentity()).isEqualTo(BundlePublishOutcome.NoAccount)
    }

    @Test
    fun `un coffre qui refuse l'ecriture ne laisse pas la publication en cours`() = runTest {
        val gateway = FakeGateway(fail(404))
        val publisher = publisher(gateway, vaultRefusesWrites = true)
        assertThat(publisher.publish()).isEqualTo(BundlePublishOutcome.GaveUp)
        assertThat(publisher.state.value).isEqualTo(E2eeBundleState.UNAVAILABLE)
        assertThat(gateway.reads).isEqualTo(0)
        assertThat(gateway.uploads).isEqualTo(0)
    }

    @Test
    fun `une reinitialisation dont le coffre refuse l'ecriture ne reste pas en cours`() = runTest {
        val gateway = FakeGateway(fail(404))
        val publisher = publisher(gateway, vaultRefusesWrites = true)
        assertThat(publisher.resetIdentity()).isEqualTo(BundlePublishOutcome.GaveUp)
        assertThat(publisher.state.value).isEqualTo(E2eeBundleState.UNAVAILABLE)
        assertThat(gateway.uploads).isEqualTo(0)
    }
}
