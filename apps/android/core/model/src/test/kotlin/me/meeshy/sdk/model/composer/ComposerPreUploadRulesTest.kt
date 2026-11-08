package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerPreUploadRulesTest {

    @Test
    fun `sans total aucune progression nest peinte`() {
        assertThat(ComposerPreUploadState.Idle.fraction).isNull()
        assertThat(ComposerPreUploadState.Uploading(100, 0).fraction).isNull()
        assertThat(ComposerPreUploadState.Failed.fraction).isNull()
    }

    @Test
    fun `la progression est le rapport des octets et reste dans le cadre`() {
        assertThat(ComposerPreUploadState.Uploading(4_800_000, 14_200_000).fraction!!).isWithin(0.001).of(0.338)
        assertThat(ComposerPreUploadState.Uploading(999, 10).fraction).isEqualTo(1.0)
        assertThat(ComposerPreUploadState.Uploading(-5, 10).fraction).isEqualTo(0.0)
    }

    @Test
    fun `seul letat en cours peint une progression`() {
        assertThat(ComposerPreUploadState.Uploading(1, 2).showsProgress).isTrue()
        assertThat(ComposerPreUploadState.Idle.showsProgress).isFalse()
        assertThat(ComposerPreUploadState.Ready("m", "u").showsProgress).isFalse()
        assertThat(ComposerPreUploadState.Failed.showsProgress).isFalse()
    }

    @Test
    fun `mayBegin refuse un fichier minuscule, accepte le seuil, refuse un asset deja distant`() {
        assertThat(ComposerPreUploadPolicy.mayBegin(1_024, alreadyRemote = false)).isFalse()
        assertThat(ComposerPreUploadPolicy.mayBegin(ComposerPreUploadPolicy.MINIMUM_BYTES, alreadyRemote = false)).isTrue()
        assertThat(ComposerPreUploadPolicy.mayBegin(100_000_000, alreadyRemote = true)).isFalse()
    }

    @Test
    fun `les budgets sont ceux de la planche`() {
        assertThat(ComposerPreUploadPolicy.CHUNK_BYTES).isEqualTo(5 * 1024 * 1024)
        assertThat(ComposerPreUploadPolicy.MAXIMUM_CONCURRENT).isEqualTo(2)
    }

    @Test
    fun `seul le canal scene reference une pre-montee`() {
        assertThat(ComposerPreUploadPolicy.pays(ComposerFormat.STORY)).isTrue()
        assertThat(ComposerPreUploadPolicy.pays(ComposerFormat.POST)).isFalse()
        assertThat(ComposerPreUploadPolicy.pays(ComposerFormat.REEL)).isFalse()
        assertThat(ComposerPreUploadPolicy.pays(ComposerFormat.STATUS)).isFalse()
    }

    @Test
    fun `publishReuses ne reutilise que le pret, jamais ne fait attendre`() {
        assertThat(ComposerPreUploadPolicy.publishReuses(ComposerPreUploadState.Ready("m", "https://cdn/x"))).isTrue()
        assertThat(ComposerPreUploadPolicy.publishReuses(ComposerPreUploadState.Uploading(9, 10))).isFalse()
        assertThat(ComposerPreUploadPolicy.publishReuses(ComposerPreUploadState.Failed)).isFalse()
        assertThat(ComposerPreUploadPolicy.publishReuses(ComposerPreUploadState.Idle)).isFalse()
    }

    @Test
    fun `le balayage ne retient que le fichier local sans identifiant distant`() {
        assertThat(ComposerPreUploadSweep.pendingFile("pm1", "file:///tmp/a.jpg")).isNull()
        assertThat(ComposerPreUploadSweep.pendingFile("", "https://cdn/a.jpg")).isNull()
        assertThat(ComposerPreUploadSweep.pendingFile("", null)).isNull()
        assertThat(ComposerPreUploadSweep.pendingFile("", "")).isNull()
        assertThat(ComposerPreUploadSweep.pendingFile("", "file:///tmp/a.jpg")).isEqualTo("/tmp/a.jpg")
        assertThat(ComposerPreUploadSweep.pendingFile("", "/data/user/0/x/a.jpg")).isEqualTo("/data/user/0/x/a.jpg")
    }
}
