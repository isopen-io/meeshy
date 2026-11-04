package me.meeshy.core.database

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.io.RandomAccessFile
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.crypto.DatabaseFileState
import me.meeshy.core.database.crypto.DatabaseFileStates
import me.meeshy.core.database.crypto.DatabaseKeyProvider
import me.meeshy.core.database.crypto.EncryptedDatabaseBootstrap
import me.meeshy.core.database.crypto.PlaintextDatabaseMigrator
import me.meeshy.core.database.crypto.SqlCipherRuntime
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.database.entity.PlaintextErasureEntity
import me.meeshy.sdk.model.security.InMemorySecureStore
import net.zetetic.database.sqlcipher.SQLiteDatabase
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Le VRAI SQLCipher (bibliothèque native de l'AAR 4.6.1), sur un appareil : ce qu'aucun test JVM ne peut prouver, faute
 * de build SQLCipher pour la JVM hôte. Une base en clair de la version courante, outbox non vide, passe par l'ouvreur de
 * production ([DatabaseModule.encryptedOpener]) : `ATTACH … KEY ?` (clé brute liée en texte), `sqlcipher_export`,
 * vérification, échange, puis réouverture par le helper Room (clé en octets) d'une copie que l'`ATTACH` a écrite. Une clé
 * erronée rend `SQLITE_NOTADB`, lu comme une corruption. Une migration différée faute de place rouvre la base en clair
 * par le même helper, phrase vide. Une base en clair corrompue fait LEVER l'export (aucune instruction n'avale son échec),
 * et repart chiffrée sans laisser de copie en clair.
 */
@RunWith(AndroidJUnit4::class)
class SqlCipherOnDeviceTest {

    private val context: Context get() = InstrumentationRegistry.getInstrumentation().targetContext

    private val name = "sqlcipher-on-device.db"

    private val file: File get() = context.getDatabasePath(name)

    private val pending = OutboxEntity(
        cmid = "cid_on_device", lane = "message:conv-1", kind = "SEND", targetId = "conv-1",
        payload = "{\"content\":\"bonjour\"}", dependsOn = null, attempts = 2, state = "PENDING", createdAt = 11L,
        updatedAt = 12L, nextAttemptAt = 13L, lastError = "offline", ownerId = "user-1",
    )

    @Before
    fun clean() = wipe()

    @After
    fun wipe() {
        val directory = file.parentFile ?: return
        directory.listFiles().orEmpty().filter { it.name.startsWith(name) }.forEach { it.delete() }
    }

    private fun message(id: String, text: String) = MessageEntity(
        id = id, conversationId = "conv-1", seq = null, payload = "{}", createdAt = 0L, cachedAt = 0L, contentText = text,
    )

    /** La base en clair d'avant la mise à jour : outbox en attente, index de recherche peuplé, `rowid` troués. */
    private fun seedPlaintext() = runBlocking {
        val database = DatabaseModule.meeshyDatabaseBuilder(context, name).build()
        database.outboxDao().upsert(pending)
        database.conversationDao().upsertAll(listOf(ConversationEntity("conv-1", "{}", 1L, 1L)))
        SearchIndexDao(database).replaceConversation("conv-1", "famille", "marie")
        database.messageDao().upsertAll(listOf(message("m-1", "premier"), message("m-2", "deuxieme"), message("m-3", "troisieme")))
        database.messageDao().deleteByIds(listOf("m-1"))
        database.openHelper.writableDatabase.query("PRAGMA wal_checkpoint(TRUNCATE)").use { it.moveToFirst() }
        database.close()
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.PLAINTEXT)
    }

    private fun bootstrap(store: InMemorySecureStore, events: MutableList<String>, free: Long = Long.MAX_VALUE) =
        EncryptedDatabaseBootstrap(
            databaseFile = file,
            keys = DatabaseKeyProvider(store),
            migrator = PlaintextDatabaseMigrator(SqlCipherRuntime.Engine),
            onEvent = events::add,
            freeBytes = { free },
        )

    private fun open(encryption: EncryptedDatabaseBootstrap, health: StorageHealth): MeeshyDatabase =
        DatabaseModule.encryptedOpener(
            context = context,
            primaryName = name,
            diagnostics = DatabaseInitDiagnostics(),
            health = health,
            encryption = encryption,
            secondaryFile = File(context.cacheDir, "$name.fallback"),
        ).open()

    @Test
    fun une_base_en_clair_avec_outbox_devient_chiffree_et_room_la_rouvre_a_l_identique() = runBlocking {
        seedPlaintext()
        val store = InMemorySecureStore()
        val events = mutableListOf<String>()
        val health = StorageHealth()

        val database = open(bootstrap(store, events), health)

        assertThat(health.current.value).isEqualTo(StorageState.Normal)
        assertThat(events.joinToString()).contains(EncryptedDatabaseBootstrap.MIGRATION)
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.ENCRYPTED)
        assertThat(PlaintextDatabaseMigrator.backup(file).exists()).isFalse()
        assertThat(database.outboxDao().find(pending.cmid)).isEqualTo(pending)
        val search = SearchIndexDao(database)
        assertThat(search.searchConversations("\"famille*\"", 10)).containsExactly("conv-1")
        assertThat(search.searchMessages("\"troisieme*\"", 10).map { it.messageId }).containsExactly("m-3")
        assertThat(search.searchMessages("\"deuxieme*\"", 10).map { it.messageId }).containsExactly("m-2")
        database.close()

        val reopenedHealth = StorageHealth()
        val reopened = open(bootstrap(store, mutableListOf()), reopenedHealth)
        assertThat(reopenedHealth.current.value).isEqualTo(StorageState.Normal)
        assertThat(reopened.outboxDao().find(pending.cmid)).isEqualTo(pending)
        reopened.close()
    }

    /** Abîme la page 1 (le catalogue) après l'en-tête de 100 octets : le fichier reste reconnu « en clair ». */
    private fun corruptCatalogue() {
        RandomAccessFile(file, "rw").use { raw ->
            val end = minOf(raw.length(), 4096L)
            raw.seek(100L)
            raw.write(ByteArray((end - 100L).toInt()) { 0xA5.toByte() })
        }
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.PLAINTEXT)
    }

    @Test
    fun une_base_en_clair_corrompue_fait_lever_l_export_et_repart_chiffree_sans_copie_en_clair() {
        seedPlaintext()
        corruptCatalogue()
        val health = StorageHealth()

        val database = open(bootstrap(InMemorySecureStore(), mutableListOf()), health)

        assertThat(health.current.value).isEqualTo(StorageState.Degraded("recreated"))
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.ENCRYPTED)
        database.close()
        val directory = file.parentFile ?: error("no database directory")
        val plaintextLeft = directory.listFiles().orEmpty()
            .filter { it.name.startsWith(name) && DatabaseFileStates.of(it) == DatabaseFileState.PLAINTEXT }
            .map { it.name }
        assertThat(plaintextLeft).isEmpty()
    }

    @Test
    fun une_cle_erronee_rend_notadb_lu_comme_une_corruption() {
        seedPlaintext()
        open(bootstrap(InMemorySecureStore(), mutableListOf()), StorageHealth()).close()
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.ENCRYPTED)
        SqlCipherRuntime.ensureLoaded()
        val wrongKey = "x'" + "00".repeat(32) + "'"

        val failure = assertThrows(Exception::class.java) {
            val db = SQLiteDatabase.openDatabase(file.path, wrongKey, null, SQLiteDatabase.OPEN_READONLY, null, null)
            try {
                db.compileStatement("SELECT count(*) FROM sqlite_master").simpleQueryForLong()
            } finally {
                db.close()
            }
        }

        assertThat(DatabaseRecovery.classify(failure)).isEqualTo(OpenFailureKind.CORRUPTION)
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.ENCRYPTED)
    }

    @Test
    fun une_migration_differee_faute_de_place_rouvre_la_base_en_clair_par_le_helper_sqlcipher() = runBlocking {
        seedPlaintext()
        val events = mutableListOf<String>()
        val health = StorageHealth()
        val encryption = bootstrap(InMemorySecureStore(), events, free = 0L)

        val database = open(encryption, health)

        assertThat(encryption.plaintextDeferred).isTrue()
        assertThat(health.isEphemeral).isFalse()
        assertThat(events.single()).startsWith(EncryptedDatabaseBootstrap.DEFERRED)
        assertThat(database.outboxDao().find(pending.cmid)).isEqualTo(pending)
        database.close()
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.PLAINTEXT)
    }

    @Test
    fun une_base_recreee_pendant_un_report_s_ouvre_avec_la_cle_et_non_la_phrase_vide() = runBlocking {
        seedPlaintext()
        DatabaseRecovery.markCorrupted(file)
        val store = InMemorySecureStore()
        val health = StorageHealth()
        val encryption = bootstrap(store, mutableListOf(), free = 0L)

        val database = open(encryption, health)

        assertThat(health.current.value).isEqualTo(StorageState.Degraded("recreated"))
        assertThat(encryption.plaintextDeferred).isFalse()
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.ENCRYPTED)
        assertThat(database.outboxDao().find(pending.cmid)).isEqualTo(pending)
        database.close()

        val reopenedHealth = StorageHealth()
        val reopened = open(bootstrap(store, mutableListOf()), reopenedHealth)
        assertThat(reopenedHealth.current.value).isEqualTo(StorageState.Normal)
        assertThat(reopened.outboxDao().find(pending.cmid)).isEqualTo(pending)
        reopened.close()
    }

    @Test
    fun une_purge_de_session_due_vide_la_base_chiffree_avant_sa_reouverture_et_garde_les_effacements_dus() = runBlocking {
        seedPlaintext()
        val store = InMemorySecureStore()
        val owed = PlaintextErasureEntity("user-1", "message", "m-erased", "cid_e", "user-1", recordedAt = 3L)
        open(bootstrap(store, mutableListOf()), StorageHealth()).apply {
            plaintextErasureDao().recordMessages(listOf(owed))
            close()
        }
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.ENCRYPTED)
        assertThat(PendingDiskPurge.schedule(file)).isTrue()
        val health = StorageHealth()

        val database = open(bootstrap(store, mutableListOf()), health)

        assertThat(health.current.value).isEqualTo(StorageState.Normal)
        assertThat(PendingDiskPurge.isDue(file)).isFalse()
        assertThat(DatabaseFileStates.of(file)).isEqualTo(DatabaseFileState.ENCRYPTED)
        assertThat(database.outboxDao().find(pending.cmid)).isNull()
        val messages = database.openHelper.readableDatabase.query("SELECT count(*) FROM messages").use {
            it.moveToFirst()
            it.getLong(0)
        }
        assertThat(messages).isEqualTo(0L)
        assertThat(database.plaintextErasureDao().all()).containsExactly(owed)
        database.close()
    }
}
