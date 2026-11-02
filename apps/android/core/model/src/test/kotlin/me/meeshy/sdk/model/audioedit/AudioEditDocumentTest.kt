package me.meeshy.sdk.model.audioedit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioEditDocumentTest {

    private fun version(id: String, op: AudioEditOperation = AudioEditOperation.Original, duration: Double = 10.0) =
        AudioEditVersion(id = id, fileName = "$id.m4a", durationSeconds = duration, operation = op, createdAtMillis = 1L)

    private fun documentWith(vararg ids: String): AudioEditDocument =
        ids.drop(1).fold(AudioEditDocument("s", version(ids.first()))) { doc, id ->
            doc.commit(version(id, AudioEditOperation.Gain(2.0))).document
        }

    @Test
    fun `un document neuf ne peut ni annuler ni rétablir`() {
        val doc = AudioEditDocument("s", version("o"))
        assertThat(doc.canUndo).isFalse()
        assertThat(doc.canRedo).isFalse()
        assertThat(doc.isModified).isFalse()
        assertThat(doc.active.id).isEqualTo("o")
    }

    @Test
    fun `commit avance le curseur et undo redo le déplacent`() {
        val doc = documentWith("o", "a", "b")
        assertThat(doc.active.id).isEqualTo("b")
        assertThat(doc.undo().active.id).isEqualTo("a")
        assertThat(doc.undo().undo().undo().active.id).isEqualTo("o")
        assertThat(doc.undo().redo().active.id).isEqualTo("b")
        assertThat(doc.redo()).isEqualTo(doc)
        assertThat(doc.original.id).isEqualTo("o")
    }

    @Test
    fun `éditer après un undo supprime la branche abandonnée et la rend`() {
        val doc = documentWith("o", "a", "b").undo()
        val commit = doc.commit(version("c"))
        assertThat(commit.discarded.map { it.id }).containsExactly("b")
        assertThat(commit.document.versions.map { it.id }).containsExactly("o", "a", "c").inOrder()
        assertThat(commit.document.active.id).isEqualTo("c")
    }

    @Test
    fun `moveCursor saute à une version et ignore un id inconnu`() {
        val doc = documentWith("o", "a", "b")
        assertThat(doc.moveCursor("o").active.id).isEqualTo("o")
        assertThat(doc.moveCursor("zzz")).isEqualTo(doc)
    }

    @Test
    fun `updateDuration ne change que la version visée`() {
        val doc = documentWith("o", "a").updateDuration(42.0, "o")
        assertThat(doc.original.durationSeconds).isEqualTo(42.0)
        assertThat(doc.versions[1].durationSeconds).isEqualTo(10.0)
    }

    @Test
    fun `fileNames exclut la version gardée`() {
        val doc = documentWith("o", "a", "b")
        assertThat(doc.fileNames(excluding = doc.active)).containsExactly("o.m4a", "a.m4a")
    }

    @Test
    fun `le manifeste JSON fait l'aller-retour`() {
        val doc = documentWith("o", "a").undo()
        val back = AudioEditDocument.fromManifestJson(doc.toManifestJson())
        assertThat(back).isEqualTo(doc)
    }

    @Test
    fun `le décodeur rejette un manifeste vide ou corrompu`() {
        assertThat(AudioEditDocument.fromManifestJson("""{"sessionId":"s","versions":[],"cursor":0}""")).isNull()
        assertThat(AudioEditDocument.fromManifestJson("pas du json")).isNull()
    }

    @Test
    fun `le décodeur ramène un curseur hors bornes dans la liste`() {
        val json = documentWith("o", "a").toManifestJson().replace("\"cursor\":1", "\"cursor\":99")
        assertThat(AudioEditDocument.fromManifestJson(json)?.cursor).isEqualTo(1)
        val negatif = documentWith("o", "a").toManifestJson().replace("\"cursor\":1", "\"cursor\":-5")
        assertThat(AudioEditDocument.fromManifestJson(negatif)?.cursor).isEqualTo(0)
    }

    @Test
    fun `isIdentity reconnaît les opérations neutres`() {
        assertThat(AudioEditOperation.Original.isIdentity).isTrue()
        assertThat(AudioEditOperation.Fade(false, false).isIdentity).isTrue()
        assertThat(AudioEditOperation.Speed(1.0).isIdentity).isTrue()
        assertThat(AudioEditOperation.Gain(1.0004).isIdentity).isTrue()
        assertThat(AudioEditOperation.Gain(1.5).isIdentity).isFalse()
        assertThat(AudioEditOperation.Trim(0.0, 1.0).isIdentity).isFalse()
    }
}
