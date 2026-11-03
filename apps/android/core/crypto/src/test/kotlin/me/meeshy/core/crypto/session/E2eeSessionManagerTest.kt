package me.meeshy.core.crypto.session

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.core.crypto.keys.E2eeKeyStore
import me.meeshy.sdk.model.security.InMemorySecureStore
import org.junit.Test

internal class SessionTestClock(var now: Long = 0)

@OptIn(ExperimentalCoroutinesApi::class)
class E2eeSessionManagerTest {
    private val alice = "64f0000000000000000000a1"
    private val bob = "64f0000000000000000000b2"

    private class Directory {
        val vaults = HashMap<String, InMemorySecureStore>()
        var lookupOverride: PeerBundleLookup? = null
        var announceResult = true
        var hang = false
        var fetches = 0
        var announces = 0

        fun vault(userId: String) = vaults.getOrPut(userId) { InMemorySecureStore() }

        fun bundleOf(userId: String): PeerBundle {
            val keys = E2eeKeyStore(vault(userId), userId)
            return PeerBundle(keys.getOrGenerateIdentityKey().publicKey, keys.getOrGenerateSignedPreKey().publicKey)
        }
    }

    private class Device(val userId: String, val directory: Directory, val clock: SessionTestClock = SessionTestClock(), scope: kotlinx.coroutines.test.TestScope) {
        var signedInAs: String? = userId
        val vault = directory.vault(userId)
        val manager = E2eeSessionManager(
            vault = vault,
            peers = object : PeerBundleSource {
                override suspend fun fetchBundle(peerId: String): PeerBundleLookup {
                    directory.fetches++
                    if (directory.hang) awaitCancellation()
                    return directory.lookupOverride ?: PeerBundleLookup.Found(directory.bundleOf(peerId))
                }

                override suspend fun announceSession(peerId: String, conversationId: String): Boolean {
                    directory.announces++
                    return directory.announceResult
                }
            },
            currentUserId = { signedInAs },
            nowEpochMillis = { clock.now },
            dispatcher = UnconfinedTestDispatcher(scope.testScheduler),
        )
    }

    private fun kotlinx.coroutines.test.TestScope.device(userId: String, directory: Directory) = Device(userId, directory, scope = this)

    private suspend fun refusal(block: suspend () -> Unit): E2eeSessionFailure {
        try {
            block()
        } catch (refused: E2eeSessionException) {
            return refused.failure
        }
        error("aucun refus")
    }

    @Test
    fun `le premier message recupere le bundle notifie la session la persiste puis les suivants n'ont pas besoin du reseau`() = runTest {
        val directory = Directory()
        val a = device(alice, directory)

        val first = a.manager.encryptMessage("salut".toByteArray(), bob, "c1")
        val second = a.manager.encryptMessage("encore".toByteArray(), bob, "c1")

        assertThat(directory.fetches).isEqualTo(1)
        assertThat(directory.announces).isEqualTo(1)
        assertThat(first.derivationVersion).isEqualTo(SessionKeyDerivation.VERSION)
        assertThat(second.ciphertext).isNotEqualTo(first.ciphertext)
        assertThat(SessionKeyStore(a.vault).load(alice, bob)).isNotNull()
        assertThat(SessionKeyStore(a.vault).knownPeers(alice)).containsExactly(bob)
    }

    @Test
    fun `la session persistee survit a un nouveau gestionnaire sans reseau`() = runTest {
        val directory = Directory()
        device(alice, directory).manager.encryptMessage("x".toByteArray(), bob, "c1")

        device(alice, directory).manager.encryptMessage("y".toByteArray(), bob, "c1")

        assertThat(directory.fetches).isEqualTo(1)
    }

    @Test
    fun `le destinataire sans session prealable dechiffre via le bundle de l'expediteur`() = runTest {
        val directory = Directory()
        val sent = device(alice, directory).manager.encryptMessage("bonjour".toByteArray(), bob, "c1")

        val clear = device(bob, directory).manager.decryptMessage(sent.ciphertext, alice)

        assertThat(String(clear!!)).isEqualTo("bonjour")
        assertThat(directory.announces).isEqualTo(1)
    }

    @Test
    fun `deux premiers messages croises convergent sur la meme cle`() = runTest {
        val directory = Directory()
        val a = device(alice, directory)
        val b = device(bob, directory)

        val fromAlice = a.manager.encryptMessage("a->b".toByteArray(), bob, "c1")
        val fromBob = b.manager.encryptMessage("b->a".toByteArray(), alice, "c1")

        assertThat(String(b.manager.decryptMessage(fromAlice.ciphertext, alice)!!)).isEqualTo("a->b")
        assertThat(String(a.manager.decryptMessage(fromBob.ciphertext, bob)!!)).isEqualTo("b->a")
        assertThat(a.manager.getOrCreateSession(bob, "c1").let { SessionKeyStore(a.vault).load(alice, bob)!!.key })
            .isEqualTo(SessionKeyStore(b.vault).load(bob, alice)!!.key)
    }

    @Test
    fun `un contenu altere se dechiffre en null`() = runTest {
        val directory = Directory()
        val a = device(alice, directory)
        val sent = a.manager.encryptMessage("secret".toByteArray(), bob, "c1")
        sent.ciphertext[sent.ciphertext.size - 1] = (sent.ciphertext.last() + 1).toByte()

        assertThat(device(bob, directory).manager.decryptMessage(sent.ciphertext, alice)).isNull()
    }

    @Test
    fun `un echec n'est pas rejoue avant 600 secondes puis il est retente`() = runTest {
        val directory = Directory().apply { lookupOverride = PeerBundleLookup.Unavailable }
        val a = device(alice, directory)
        val failure = suspend { a.manager.encryptMessage("x".toByteArray(), bob, "c1") }
        assertThat(refusal { failure() }).isEqualTo(E2eeSessionFailure.UNAVAILABLE)

        a.clock.now = 599_000
        assertThat(refusal { failure() }).isEqualTo(E2eeSessionFailure.COOLDOWN)
        assertThat(directory.fetches).isEqualTo(1)

        a.clock.now = 600_000
        assertThat(refusal { failure() }).isEqualTo(E2eeSessionFailure.UNAVAILABLE)
        assertThat(directory.fetches).isEqualTo(2)
    }

    @Test
    fun `un pair sans cles publiees est un refus explicite jamais un envoi en clair`() = runTest {
        val directory = Directory().apply { lookupOverride = PeerBundleLookup.NotPublished }

        val failure = refusal { device(alice, directory).manager.encryptMessage("x".toByteArray(), bob, "c1") }

        assertThat(failure).isEqualTo(E2eeSessionFailure.KEYS_NOT_PUBLISHED)
    }

    @Test
    fun `une notification refusee echoue l'etablissement et ne persiste rien`() = runTest {
        val directory = Directory().apply { announceResult = false }
        val a = device(alice, directory)

        val failure = refusal { a.manager.encryptMessage("x".toByteArray(), bob, "c1") }

        assertThat(failure).isEqualTo(E2eeSessionFailure.UNAVAILABLE)
        assertThat(SessionKeyStore(a.vault).load(alice, bob)).isNull()
    }

    @Test
    fun `un bundle mal forme est refuse`() = runTest {
        val directory = Directory().apply { lookupOverride = PeerBundleLookup.Found(PeerBundle(ByteArray(3), ByteArray(3))) }

        val failure = refusal { device(alice, directory).manager.encryptMessage("x".toByteArray(), bob, "c1") }

        assertThat(failure).isEqualTo(E2eeSessionFailure.MALFORMED_BUNDLE)
    }

    @Test
    fun `une annulation de coroutine n'alimente pas le cache negatif`() = runTest {
        val directory = Directory().apply { hang = true }
        val a = device(alice, directory)
        val job = launch { a.manager.encryptMessage("x".toByteArray(), bob, "c1") }
        runCurrent()
        assertThat(directory.fetches).isEqualTo(1)
        job.cancel()
        job.join()

        directory.hang = false
        a.manager.encryptMessage("x".toByteArray(), bob, "c1")

        assertThat(directory.fetches).isEqualTo(2)
    }

    @Test
    fun `sans compte connecte aucune session n'est etablie`() = runTest {
        val directory = Directory()
        val a = device(alice, directory).also { it.signedInAs = null }

        assertThat(refusal { a.manager.encryptMessage("x".toByteArray(), bob, "c1") }).isEqualTo(E2eeSessionFailure.NO_ACCOUNT)
        assertThat(directory.fetches).isEqualTo(0)
    }

    @Test
    fun `clearSessions efface le compte sortant meme quand le compte courant est deja nul`() = runTest {
        val directory = Directory()
        val a = device(alice, directory)
        a.manager.encryptMessage("x".toByteArray(), bob, "c1")
        assertThat(a.vault.get("me.meeshy.e2ee.identityKey", alice)).isNotNull()

        a.signedInAs = null
        a.manager.clearSessions()

        val store = SessionKeyStore(a.vault)
        assertThat(store.load(alice, bob)).isNull()
        assertThat(store.knownPeers(alice)).isEmpty()
        assertThat(a.vault.get("me.meeshy.e2ee.identityKey", alice)).isNull()
        assertThat(a.vault.get("me.meeshy.e2ee.signedPreKey", alice)).isNull()
    }

    @Test
    fun `clearSessions retrouve le compte sortant apres un redemarrage grace au coffre`() = runTest {
        val directory = Directory()
        val before = device(alice, directory)
        before.manager.encryptMessage("x".toByteArray(), bob, "c1")

        val restarted = device(alice, directory).also { it.signedInAs = null }
        restarted.manager.clearSessions()

        assertThat(SessionKeyStore(before.vault).load(alice, bob)).isNull()
        assertThat(before.vault.get("me.meeshy.e2ee.identityKey", alice)).isNull()
    }

    @Test
    fun `apres clearSessions une nouvelle session est reetablie par le reseau`() = runTest {
        val directory = Directory()
        val a = device(alice, directory)
        a.manager.encryptMessage("x".toByteArray(), bob, "c1")
        a.manager.clearSessions()

        a.manager.encryptMessage("y".toByteArray(), bob, "c1")

        assertThat(directory.fetches).isEqualTo(2)
    }

    @Test
    fun `la migration de namespace s'applique au compte courant une seule fois`() = runTest {
        val directory = Directory()
        val a = device(alice, directory)
        a.vault.put("me.meeshy.e2ee.session.${bob}", "2:" + me.meeshy.core.crypto.primitives.CanonicalBase64.encode(ByteArray(32)))
        a.vault.put("me.meeshy.e2ee.knownPeers", bob)

        a.manager.migrateNamespaceIfNeeded()
        a.manager.migrateNamespaceIfNeeded()

        assertThat(SessionKeyStore(a.vault).knownPeers(alice)).containsExactly(bob)
        assertThat(a.vault.get("me.meeshy.e2ee.session.$bob")).isNull()
    }
}
