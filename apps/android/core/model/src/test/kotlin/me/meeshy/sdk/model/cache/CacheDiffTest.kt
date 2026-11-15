package me.meeshy.sdk.model.cache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CacheDiffTest {

    private fun stored(id: String, position: Int, hash: String? = "h$id") = CacheStoredRow(id, position, hash)
    private fun incoming(id: String, hash: String = "h$id") = CacheIncoming(id, hash)

    @Test
    fun `une liste neuve insere toutes ses lignes dans l'ordre`() {
        val plan = CacheDiff.plan(emptyList(), listOf(incoming("a"), incoming("b")))

        assertThat(plan.upserts).containsExactly(CacheUpsert("a", 0, "ha"), CacheUpsert("b", 1, "hb")).inOrder()
        assertThat(plan.deletes).isEmpty()
        assertThat(plan.isNoOp).isFalse()
    }

    @Test
    fun `une liste identique ne touche aucune ligne`() {
        val plan = CacheDiff.plan(listOf(stored("a", 0), stored("b", 1)), listOf(incoming("a"), incoming("b")))

        assertThat(plan.isNoOp).isTrue()
        assertThat(plan.unchanged).isEqualTo(2)
    }

    @Test
    fun `une ligne au hash change est reecrite et les autres sautees`() {
        val plan = CacheDiff.plan(
            listOf(stored("a", 0), stored("b", 1)),
            listOf(incoming("a"), incoming("b", hash = "nouveau")),
        )

        assertThat(plan.upserts).containsExactly(CacheUpsert("b", 1, "nouveau"))
        assertThat(plan.unchanged).isEqualTo(1)
    }

    @Test
    fun `une ligne sortie de la liste est supprimee`() {
        val plan = CacheDiff.plan(listOf(stored("a", 0), stored("b", 1)), listOf(incoming("b")))

        assertThat(plan.deletes).containsExactly("a")
        assertThat(plan.moves).containsExactly(CacheMove("b", 0))
        assertThat(plan.upserts).isEmpty()
    }

    @Test
    fun `un simple deplacement ne reecrit que le rang`() {
        val plan = CacheDiff.plan(listOf(stored("a", 0), stored("b", 1)), listOf(incoming("b"), incoming("a")))

        assertThat(plan.moves).containsExactly(CacheMove("b", 0), CacheMove("a", 1)).inOrder()
        assertThat(plan.upserts).isEmpty()
    }

    @Test
    fun `une ligne sans empreinte connue est reecrite`() {
        val plan = CacheDiff.plan(listOf(stored("a", 0, hash = null)), listOf(incoming("a")))

        assertThat(plan.upserts).containsExactly(CacheUpsert("a", 0, "ha"))
    }

    @Test
    fun `le plafond garde les derniers elements`() {
        val kept = CacheDiff.bounded(listOf("1", "2", "3", "4"), { it }, maxItemCount = 2)

        assertThat(kept).containsExactly("3", "4").inOrder()
    }

    @Test
    fun `sans plafond ou sous le plafond rien n'est tronque`() {
        assertThat(CacheDiff.bounded(listOf("1", "2"), { it }, maxItemCount = null)).containsExactly("1", "2")
        assertThat(CacheDiff.bounded(listOf("1", "2"), { it }, maxItemCount = 2)).containsExactly("1", "2")
    }

    @Test
    fun `un identifiant duplique garde sa premiere occurrence`() {
        val kept = CacheDiff.bounded(listOf("a" to 1, "b" to 2, "a" to 3), { it.first }, maxItemCount = null)

        assertThat(kept).containsExactly("a" to 1, "b" to 2).inOrder()
    }

    @Test
    fun `l'empreinte est le SHA-256 hexadecimal du contenu`() {
        assertThat(CacheDiff.contentHash("abc"))
            .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test
    fun `le mode Fetched avance l'horloge`() {
        assertThat(FreshnessWriteMode.Fetched.fetchedAt(1_000, 100, 60, 600)).isEqualTo(1_000)
    }

    @Test
    fun `le mode PreserveFreshness garde l'horloge existante`() {
        assertThat(FreshnessWriteMode.PreserveFreshness.fetchedAt(1_000, 100, 60, 600)).isEqualTo(100)
    }

    @Test
    fun `le mode PreserveFreshness d'une cle neuve n'est pas frais`() {
        val at = FreshnessWriteMode.PreserveFreshness.fetchedAt(1_000, null, 60, 600)

        assertThat(1_000 - at).isGreaterThan(60)
    }

    @Test
    fun `le mode AsStale date juste au dela de la fenetre fraiche`() {
        val at = FreshnessWriteMode.AsStale.fetchedAt(1_000, 100, 60, 600)

        assertThat(1_000 - at).isEqualTo(61)
    }

    @Test
    fun `sans fenetre stale AsStale se replie sur une ecriture ordinaire`() {
        assertThat(FreshnessWriteMode.AsStale.fetchedAt(1_000, null, 600, 600)).isEqualTo(1_000)
    }
}
