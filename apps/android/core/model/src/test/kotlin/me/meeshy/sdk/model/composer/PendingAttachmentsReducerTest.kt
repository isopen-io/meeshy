package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PendingAttachmentsReducerTest {

    private fun item(id: String, store: String? = null, path: String? = "/w/$id", thumb: String? = "/w/$id.t") =
        PendingAttachment(
            id = id, type = PendingAttachmentType.IMAGE, fileName = "$id.jpg",
            localPath = path, thumbnailPath = thumb, mediaStoreId = store,
        )

    private fun filled(count: Int): PendingAttachmentsState =
        (1..count).fold(PendingAttachmentsState()) { s, i -> PendingAttachmentsReducer.add(s, item("a$i")).state }

    @Test
    fun `la 200e pièce est refusée et les 199 premières restent intactes`() {
        val full = filled(199)
        val result = PendingAttachmentsReducer.add(full, item("extra"))
        assertThat(result.outcome).isEqualTo(PendingAttachmentsOutcome.CAP_REACHED)
        assertThat(result.state.items).hasSize(199)
        assertThat(result.state.items.first().id).isEqualTo("a1")
        assertThat(result.state.items.last().id).isEqualTo("a199")
    }

    @Test
    fun `l ordre d ajout est stable`() {
        assertThat(filled(3).items.map { it.id }).containsExactly("a1", "a2", "a3").inOrder()
    }

    @Test
    fun `un id MediaStore déjà présent est dédupliqué`() {
        val s = PendingAttachmentsReducer.add(PendingAttachmentsState(), item("a", store = "42")).state
        val result = PendingAttachmentsReducer.add(s, item("b", store = "42"))
        assertThat(result.outcome).isEqualTo(PendingAttachmentsOutcome.DUPLICATE)
        assertThat(result.state.items).hasSize(1)
    }

    @Test
    fun `retirer supprime la pièce et marque ses fichiers à purger`() {
        val s = PendingAttachmentsReducer.remove(filled(2), "a1").state
        assertThat(s.items.map { it.id }).containsExactly("a2")
        assertThat(s.pendingPurge).containsExactly("/w/a1", "/w/a1.t")
    }

    @Test
    fun `une préparation qui finit après le retrait ne ressuscite pas la pièce`() {
        val removed = PendingAttachmentsReducer.remove(filled(1), "a1").state
        val late = PendingAttachmentsReducer.update(removed, "a1") { it.copy(phase = PendingAttachmentPhase.Ready) }
        assertThat(late.outcome).isEqualTo(PendingAttachmentsOutcome.IGNORED)
        assertThat(late.state.items).isEmpty()
    }

    @Test
    fun `remplacer garde la position et purge l ancien fichier`() {
        val replaced = PendingAttachmentsReducer.replace(filled(3), "a2", item("zzz", path = "/w/new", thumb = "/w/a2.t"))
        assertThat(replaced.state.items.map { it.id }).containsExactly("a1", "a2", "a3").inOrder()
        assertThat(replaced.state.items[1].localPath).isEqualTo("/w/new")
        assertThat(replaced.state.pendingPurge).containsExactly("/w/a2")
    }

    @Test
    fun `remplacer une pièce déjà partie est ignoré`() {
        val sent = PendingAttachmentsReducer.consume(filled(1))
        val result = PendingAttachmentsReducer.replace(sent, "a1", item("a1", path = "/w/x"))
        assertThat(result.outcome).isEqualTo(PendingAttachmentsOutcome.IGNORED)
        assertThat(result.state.items).isEmpty()
    }

    @Test
    fun `consommer vide le plateau et purge tous les fichiers`() {
        val sent = PendingAttachmentsReducer.consume(filled(2))
        assertThat(sent.items).isEmpty()
        assertThat(sent.pendingPurge).hasSize(4)
    }

    @Test
    fun `drainPurge rend les chemins une seule fois`() {
        val (s, paths) = PendingAttachmentsReducer.drainPurge(PendingAttachmentsReducer.remove(filled(1), "a1").state)
        assertThat(paths).hasSize(2)
        assertThat(s.pendingPurge).isEmpty()
    }

    @Test
    fun `un lieu hors bornes est invalide`() {
        assertThat(PendingPlace(91.0, 0.0).isValid).isFalse()
        assertThat(PendingPlace(48.8, 2.3).isValid).isTrue()
    }
}
