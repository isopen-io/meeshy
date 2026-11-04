package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.security.InMemorySecureStore
import me.meeshy.sdk.model.security.SecureKeyNamespace
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Une clé que le coffre ne rend pas (malformée, entrée qui lève) n'enferme pas l'app en mémoire pour toujours : si
 * aucun fichier n'en dépend (base en clair ou absente), elle est remplacée et la base se chiffre ; sinon elle est gardée.
 * Le sauvetage, lui, ne crée ni n'écrit jamais de clé. Une vérification qui lève ne laisse pas la copie rejouer en boucle.
 */
class UnusableKeyExitTest {

    @get:Rule
    val folder = TemporaryFolder()

    private val plainHeader = "SQLite format 3\u0000".toByteArray(Charsets.US_ASCII)

    private class FakeEngine(private val verifies: () -> Boolean = { true }) : PlaintextExportEngine {
        override fun export(plain: File, target: File, passphrase: ByteArray) {
            target.writeBytes(ByteArray(2048) { (it * 13 + 5).toByte() })
        }

        override fun verify(source: File?, encrypted: File, passphrase: ByteArray): Boolean = verifies()
    }

    private fun main() = File(folder.root, "meeshy.db")

    private fun encryptedBytes() = ByteArray(4096) { (it * 7 + 3).toByte() }

    private fun bootstrap(store: InMemorySecureStore, events: MutableList<String> = mutableListOf(), engine: FakeEngine = FakeEngine()) =
        EncryptedDatabaseBootstrap(main(), DatabaseKeyProvider(store), PlaintextDatabaseMigrator(engine), events::add)

    private fun malformed() = InMemorySecureStore().also {
        it.put(DatabaseKeyProvider.KEY, "pas-une-cle", DatabaseKeyProvider.ACCOUNT)
    }

    private fun storedKey(store: InMemorySecureStore) = store.get(DatabaseKeyProvider.KEY, DatabaseKeyProvider.ACCOUNT)

    @Test
    fun `une cle malformee devant une base en clair est remplacee et la base se chiffre`() {
        main().writeBytes(plainHeader + ByteArray(4096))
        val store = malformed()
        val events = mutableListOf<String>()

        val key = bootstrap(store, events).prepare()

        assertThat(key.origin).isEqualTo(KeyOrigin.REGENERATED)
        assertThat(storedKey(store)).isEqualTo(key.hex())
        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.ENCRYPTED)
        assertThat(events.first()).isEqualTo("${EncryptedDatabaseBootstrap.KEY_REPLACED}state=PLAINTEXT")
    }

    @Test
    fun `une entree illisible devant une base absente est remplacee`() {
        val composed = SecureKeyNamespace.compose(DatabaseKeyProvider.ACCOUNT, DatabaseKeyProvider.KEY)
        val store = InMemorySecureStore(unreadableKeys = setOf(composed))

        val key = bootstrap(store).prepare()

        assertThat(key.origin).isEqualTo(KeyOrigin.REGENERATED)
        assertThat(storedKey(store)).isEqualTo(key.hex())
    }

    @Test
    fun `une cle malformee devant une base chiffree est gardee et la base reste intacte`() {
        val bytes = encryptedBytes()
        main().writeBytes(bytes)
        val store = malformed()

        assertThrows(DatabaseKeyUnavailableException::class.java) { bootstrap(store).prepare() }

        assertThat(storedKey(store)).isEqualTo("pas-une-cle")
        assertThat(main().readBytes()).isEqualTo(bytes)
    }

    @Test
    fun `une cle malformee devant une copie chiffree en attente de verification est gardee`() {
        PlaintextDatabaseMigrator.backup(main()).writeBytes(plainHeader + ByteArray(4096))
        PlaintextDatabaseMigrator.temp(main()).writeBytes(encryptedBytes())
        val store = malformed()

        assertThrows(DatabaseKeyUnavailableException::class.java) { bootstrap(store).prepare() }

        assertThat(storedKey(store)).isEqualTo("pas-une-cle")
        assertThat(PlaintextDatabaseMigrator.temp(main()).exists()).isTrue()
    }

    @Test
    fun `un coffre qui refuse aussi l'ecriture laisse remonter l'indisponibilite de la cle`() {
        main().writeBytes(plainHeader + ByteArray(4096))
        val composed = SecureKeyNamespace.compose(DatabaseKeyProvider.ACCOUNT, DatabaseKeyProvider.KEY)
        val store = InMemorySecureStore(failWrites = true, unreadableKeys = setOf(composed))

        assertThrows(DatabaseKeyUnavailableException::class.java) { bootstrap(store).prepare() }

        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.PLAINTEXT)
    }

    @Test
    fun `le sauvetage ne cree jamais de cle`() {
        val store = InMemorySecureStore()

        assertThat(bootstrap(store).salvageKey()).isNull()

        assertThat(store.keys(DatabaseKeyProvider.ACCOUNT)).isEmpty()
    }

    @Test
    fun `le sauvetage relit une cle existante sans l'ecrire`() {
        val store = InMemorySecureStore()
        val existing = DatabaseKeyProvider(store).obtain()

        assertThat(bootstrap(store).salvageKey()?.hex()).isEqualTo(existing.hex())
    }

    @Test
    fun `une verification qui leve supprime la copie et le lancement suivant repart de la sauvegarde en clair`() {
        PlaintextDatabaseMigrator.backup(main()).writeBytes(plainHeader + ByteArray(4096))
        PlaintextDatabaseMigrator.temp(main()).writeBytes(encryptedBytes())
        val store = InMemorySecureStore()
        DatabaseKeyProvider(store).obtain()

        assertThrows(PlaintextMigrationException::class.java) {
            bootstrap(store, engine = FakeEngine(verifies = { error("page 1 unreadable") })).prepare()
        }

        assertThat(PlaintextDatabaseMigrator.temp(main()).exists()).isFalse()
        assertThat(PlaintextDatabaseMigrator.backup(main()).exists()).isTrue()

        bootstrap(store).prepare()

        assertThat(DatabaseFileStates.of(main())).isEqualTo(DatabaseFileState.ENCRYPTED)
        assertThat(PlaintextDatabaseMigrator.backup(main()).exists()).isFalse()
    }
}
