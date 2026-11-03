package me.meeshy.core.database

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DatabaseRecoveryTest {

    private fun file(name: String): File =
        ApplicationProvider.getApplicationContext<Context>().getDatabasePath(name).also { it.parentFile?.mkdirs() }

    private fun garbage(target: File) = target.writeBytes(ByteArray(8192) { (it * 31 + 7).toByte() })

    @Test
    fun `un fichier de garbage n'est pas lisible et reste en place pour la quarantaine`() {
        val target = file("garbage.db").also(::garbage)

        assertThat(DatabaseRecovery.isReadable(target)).isFalse()
        assertThat(target.exists()).isTrue()
    }

    @Test
    fun `un fichier absent est lisible puisqu'il sera cree`() {
        assertThat(DatabaseRecovery.isReadable(file("absent.db"))).isTrue()
    }

    @Test
    fun `la quarantaine deplace la base et ses fichiers compagnons sous un nom date`() {
        val target = file("q.db").also(::garbage)
        File(target.path + "-wal").writeText("wal")
        File(target.path + "-shm").writeText("shm")

        val moved = DatabaseRecovery.quarantine(target, atMillis = 1234L)

        assertThat(target.exists()).isFalse()
        assertThat(File(target.path + "-wal").exists()).isFalse()
        assertThat(moved.map { it.name }).containsExactly(
            "q.db.corrupted.1234",
            "q.db.corrupted.1234-wal",
            "q.db.corrupted.1234-shm",
        )
        assertThat(moved.all { it.exists() }).isTrue()
    }

    @Test
    fun `le sauvetage de l'outbox d'un fichier illisible rend une liste vide sans lever`() {
        assertThat(DatabaseRecovery.salvageOutbox(file("g2.db").also(::garbage))).isEmpty()
    }

    @Test
    fun `le sauvetage relit les envois d'une base lisible`() {
        val target = file("salvage.db")
        SQLiteDatabase.openOrCreateDatabase(target, null).use { db ->
            db.execSQL(
                "CREATE TABLE outbox (cmid TEXT PRIMARY KEY, lane TEXT, kind TEXT, targetId TEXT, payload TEXT, " +
                    "dependsOn TEXT, attempts INTEGER, state TEXT, createdAt INTEGER, updatedAt INTEGER)",
            )
            db.execSQL("INSERT INTO outbox VALUES ('c1','message:x','SEND','t','{}',NULL,2,'PENDING',10,11)")
        }

        val rows = DatabaseRecovery.salvageOutbox(target)

        assertThat(rows.map { it.cmid }).containsExactly("c1")
        assertThat(rows.single().attempts).isEqualTo(2)
        assertThat(rows.single().ownerId).isNull()
    }
}
