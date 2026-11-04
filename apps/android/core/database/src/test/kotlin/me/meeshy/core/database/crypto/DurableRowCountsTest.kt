package me.meeshy.core.database.crypto

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Troisième contre-audit de #15880 : la vérification de la copie chiffrée tenait deux comptages en échec pour égaux. Une
 * copie dont une table durable ne se compte pas, d'un côté ou des deux, est refusée ; une table absente des deux côtés
 * (base d'une version qui ne l'avait pas encore) ne l'empêche pas.
 */
class DurableRowCountsTest {

    private fun counts(vararg overrides: Pair<String, TableCount>): (String) -> TableCount {
        val map = overrides.toMap()
        return { table -> map[table] ?: TableCount.Rows(3) }
    }

    @Test
    fun `des comptages identiques valident la copie`() {
        assertThat(DurableRowCounts.match(counts(), counts())).isTrue()
    }

    @Test
    fun `deux comptages en echec ne valident pas la copie`() {
        val failed = "outbox" to TableCount.Unreadable

        assertThat(DurableRowCounts.match(counts(failed), counts(failed))).isFalse()
    }

    @Test
    fun `un comptage en echec d'un seul cote ne valide pas la copie`() {
        assertThat(DurableRowCounts.match(counts(), counts("messages" to TableCount.Unreadable))).isFalse()
        assertThat(DurableRowCounts.match(counts("messages" to TableCount.Unreadable), counts())).isFalse()
    }

    @Test
    fun `une table absente des deux cotes ne bloque pas la migration d'une base ancienne`() {
        val absent = "e2ee_plaintext_erasures" to TableCount.Absent

        assertThat(DurableRowCounts.match(counts(absent), counts(absent))).isTrue()
    }

    @Test
    fun `une table absente de la copie seule la refuse`() {
        assertThat(DurableRowCounts.match(counts(), counts("outbox" to TableCount.Absent))).isFalse()
    }

    @Test
    fun `des nombres de lignes differents refusent la copie`() {
        assertThat(DurableRowCounts.match(counts(), counts("outbox" to TableCount.Rows(2)))).isFalse()
    }

    @Test
    fun `chaque table durable est comptee`() {
        val asked = mutableListOf<String>()

        DurableRowCounts.match({ asked += it; TableCount.Rows(0) }, { TableCount.Rows(0) })

        assertThat(asked).containsExactly(
            "outbox", "media_blob", "tus_upload_checkpoint", "sync_meta", "e2ee_plaintext_erasures", "messages", "conversations",
        )
    }
}
