package me.meeshy.core.database.crypto

import android.database.sqlite.SQLiteDatabaseCorruptException
import android.database.sqlite.SQLiteException
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.DatabaseRecovery
import me.meeshy.core.database.OpenFailureKind
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * SQLCipher 4.6.1 ne lève que des `android.database.sqlite.*` (l'AAR ne porte aucune classe d'exception
 * `net.zetetic`) : une clé qui ne convient plus arrive en `SQLiteException` portant `SQLITE_NOTADB`.
 */
@RunWith(RobolectricTestRunner::class)
class CipherFailureClassificationTest {

    @Test
    fun `une cle qui ne convient plus est une corruption, donc un redemarrage a froid et non un crash`() {
        val wrongKey = SQLiteException("file is not a database (code 26 SQLITE_NOTADB)")

        assertThat(DatabaseRecovery.classify(IllegalStateException("open", wrongKey))).isEqualTo(OpenFailureKind.CORRUPTION)
    }

    @Test
    fun `une corruption signalee par le moteur chiffre est une corruption`() {
        val corrupt = SQLiteDatabaseCorruptException("file is not a database")

        assertThat(DatabaseRecovery.classify(IllegalStateException("open", corrupt))).isEqualTo(OpenFailureKind.CORRUPTION)
    }

    @Test
    fun `un message qui ressemble a une corruption hors d'une exception SQLite reste un defaut`() {
        val notSqlite = RuntimeException("file is not a database (code 26 SQLITE_NOTADB)")

        assertThat(DatabaseRecovery.classify(IllegalStateException("open", notSqlite))).isEqualTo(OpenFailureKind.DEFECT)
    }

    @Test
    fun `un bug de code reste un defaut`() {
        assertThat(DatabaseRecovery.classify(IllegalStateException("no such column"))).isEqualTo(OpenFailureKind.DEFECT)
    }
}
