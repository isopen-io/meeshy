package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le porte-jetons recopie la session d'un COMPTE dans la sauvegarde hors de l'app (Block Store, #14058) :
 * à la connexion, à chaque renouvellement, et il l'efface quand la session tombe (déconnexion, refus).
 */
class BackedUpTokenStoreTest {

    private class RecordingBackup : SessionBackup {
        val saved = mutableListOf<BackedUpSession>()
        var erasures = 0
        var held: BackedUpSession? = null

        override suspend fun read(): BackedUpSession? = held

        override fun save(session: BackedUpSession) {
            saved += session
            held = session
        }

        override fun erase() {
            erasures += 1
            held = null
        }
    }

    private fun signIn(store: TokenStore, userId: String = "u1", jwt: String = "jwt-1", session: String = "sess-1") {
        store.jwt = jwt
        store.sessionToken = session
        store.userId = userId
    }

    @Test
    fun `la connexion d'un compte ecrit sa session dans la sauvegarde`() {
        val backup = RecordingBackup()
        val store = BackedUpTokenStore(InMemoryTokenStore(), backup)

        signIn(store)

        assertThat(backup.held).isEqualTo(BackedUpSession(userId = "u1", jwt = "jwt-1", sessionToken = "sess-1"))
    }

    @Test
    fun `le renouvellement du jeton reecrit la sauvegarde avec le jeton neuf`() {
        val backup = RecordingBackup()
        val store = BackedUpTokenStore(InMemoryTokenStore(), backup)
        signIn(store)

        store.jwt = "jwt-2"

        assertThat(backup.held?.jwt).isEqualTo("jwt-2")
        assertThat(backup.held?.sessionToken).isEqualTo("sess-1")
    }

    @Test
    fun `une ecriture qui ne change rien ne repart pas vers la sauvegarde`() {
        val backup = RecordingBackup()
        val store = BackedUpTokenStore(InMemoryTokenStore(), backup)
        signIn(store)
        val writes = backup.saved.size

        store.jwt = "jwt-1"
        store.sessionToken = "sess-1"

        assertThat(backup.saved).hasSize(writes)
    }

    @Test
    fun `une session incomplete n'est jamais sauvegardee`() {
        val backup = RecordingBackup()
        val store = BackedUpTokenStore(InMemoryTokenStore(), backup)

        store.jwt = "jwt-1"
        store.sessionToken = "sess-1"

        assertThat(backup.saved).isEmpty()
    }

    @Test
    fun `la session d'un invite de lien n'est jamais sauvegardee`() {
        val backup = RecordingBackup()
        val store = BackedUpTokenStore(InMemoryTokenStore(), backup)

        store.sessionToken = "guest-token"
        store.userId = "anon"

        assertThat(backup.saved).isEmpty()
    }

    @Test
    fun `la fin de session efface la sauvegarde`() {
        val backup = RecordingBackup()
        val store = BackedUpTokenStore(InMemoryTokenStore(), backup)
        signIn(store)

        store.clear()

        assertThat(backup.held).isNull()
        assertThat(store.isAuthenticated).isFalse()
    }

    @Test
    fun `une session rouverte apres une fin de session est sauvegardee de nouveau`() {
        val backup = RecordingBackup()
        val store = BackedUpTokenStore(InMemoryTokenStore(), backup)
        signIn(store)
        store.clear()

        signIn(store)

        assertThat(backup.held).isEqualTo(BackedUpSession(userId = "u1", jwt = "jwt-1", sessionToken = "sess-1"))
    }

    @Test
    fun `le porte-jetons garde les jetons du porte-jetons qu'il enveloppe`() {
        val inner = InMemoryTokenStore()
        val store = BackedUpTokenStore(inner, RecordingBackup())

        signIn(store)

        assertThat(inner.jwt).isEqualTo("jwt-1")
        assertThat(inner.sessionToken).isEqualTo("sess-1")
        assertThat(inner.userId).isEqualTo("u1")
    }

    @Test
    fun `un renouvellement concurrent d'une deconnexion ne reecrit pas la session fermee`() {
        val backup = RecordingBackup()
        val inner = InMemoryTokenStore(jwt = "jwt-1", sessionToken = "sess-1", userId = "u1")
        val armed = java.util.concurrent.atomic.AtomicBoolean(false)
        val reading = java.util.concurrent.CountDownLatch(1)
        val release = java.util.concurrent.CountDownLatch(1)
        val slow = object : TokenStore by inner {
            override var sessionToken: String?
                get() = inner.sessionToken.also {
                    if (armed.compareAndSet(true, false)) {
                        reading.countDown()
                        release.await()
                    }
                }
                set(value) {
                    inner.sessionToken = value
                }
        }
        val store = BackedUpTokenStore(slow, backup)

        armed.set(true)
        val renewal = Thread { store.jwt = "jwt-2" }.apply { start() }
        reading.await()
        val logout = Thread { store.clear() }.apply { start() }
        logout.join(200)
        release.countDown()
        renewal.join()
        logout.join()

        assertThat(backup.held).isNull()
        assertThat(store.isAuthenticated).isFalse()
    }

    @Test
    fun `un compte qui ne reste pas connecte n'est jamais sauvegarde et efface l'entree existante`() {
        val backup = RecordingBackup().apply { held = BackedUpSession("u0", "old", "old-sess") }
        val store = BackedUpTokenStore(InMemoryTokenStore(), backup) { userId -> userId != "u1" }

        signIn(store)
        store.jwt = "jwt-2"

        assertThat(backup.saved).isEmpty()
        assertThat(backup.held).isNull()
        assertThat(backup.erasures).isEqualTo(1)
    }
}
