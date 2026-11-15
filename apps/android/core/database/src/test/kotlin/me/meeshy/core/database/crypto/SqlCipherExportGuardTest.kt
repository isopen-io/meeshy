package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import java.io.File
import net.zetetic.database.sqlcipher.SQLiteDatabase
import org.junit.Test

/**
 * Contre-audit de #15880 (run 41818032184) : sur le vrai moteur, la migration n'aboutissait jamais. Aucun test JVM ne fait
 * tourner SQLCipher (bibliothèque native) ; le banc émulateur `android-sqlcipher-device.yml` le prouve. Ces gardes tiennent,
 * dans `android.yml`, les deux causes trouvées sur l'émulateur, pour qu'elles ne reviennent pas en silence.
 */
class SqlCipherExportGuardTest {

    private val sources = File("src/main/kotlin")

    @Test
    fun `la connexion en clair de l'export peut creer la copie attachee`() {
        assertThat(SqlCipherRuntime.Engine.PLAINTEXT_EXPORT_FLAGS and SQLiteDatabase.CREATE_IF_NECESSARY)
            .isEqualTo(SQLiteDatabase.CREATE_IF_NECESSARY)
        assertThat(SqlCipherRuntime.Engine.PLAINTEXT_EXPORT_FLAGS and SQLiteDatabase.OPEN_READONLY).isEqualTo(0)
    }

    @Test
    fun `aucune instruction SQLCipher ne passe par rawExecSQL, qui avale les echecs d'execution`() {
        assertThat(sources.isDirectory).isTrue()
        val offenders = sources.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filter { file -> file.readLines().any { line -> CALL.containsMatchIn(line) && !line.trimStart().startsWith("*") } }
            .map { it.name }
            .toList()

        assertThat(offenders).isEmpty()
    }

    private companion object {
        val CALL = Regex("""(\.|::)rawExecSQL\b""")
    }
}
