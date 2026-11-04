package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.DatabaseRecovery
import me.meeshy.core.database.OpenFailureKind
import org.junit.Test

class CipherFailureClassificationTest {

    @Test
    fun `une cle qui ne convient plus est une corruption, donc un redemarrage a froid et non un crash`() {
        val wrongKey = RuntimeException("file is not a database (code 26 SQLITE_NOTADB)")

        assertThat(DatabaseRecovery.classify(IllegalStateException("open", wrongKey))).isEqualTo(OpenFailureKind.CORRUPTION)
    }

    @Test
    fun `un bug de code reste un defaut`() {
        assertThat(DatabaseRecovery.classify(IllegalStateException("no such column"))).isEqualTo(OpenFailureKind.DEFECT)
    }
}
