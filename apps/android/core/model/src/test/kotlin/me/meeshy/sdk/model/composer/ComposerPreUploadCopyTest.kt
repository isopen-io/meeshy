package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

class ComposerPreUploadCopyTest {
    private val units = ComposerPreUploadCopy.ByteUnits(kb = "ko", mb = "Mo", gb = "Go")

    @Test
    fun `la montee en cours dit pourcentage et octets, une seule unite a la fin`() {
        val label = ComposerPreUploadCopy.label(
            ComposerPreUploadState.Uploading(4_800_000, 14_200_000), "MONTÉE EN COURS", units, Locale.FRANCE,
        )
        assertThat(label).isEqualTo("MONTÉE EN COURS · 34\u00a0% — 4,8 / 14,2 Mo")
    }

    @Test
    fun `lecriture anglaise suit la locale`() {
        val label = ComposerPreUploadCopy.label(
            ComposerPreUploadState.Uploading(4_800_000, 14_200_000), "UPLOADING", ComposerPreUploadCopy.ByteUnits("KB", "MB", "GB"), Locale.US,
        )
        assertThat(label).isEqualTo("UPLOADING · 34% — 4.8 / 14.2 MB")
    }

    @Test
    fun `prêt, repos et échec ne disent rien`() {
        listOf(ComposerPreUploadState.Idle, ComposerPreUploadState.Failed, ComposerPreUploadState.Ready("m", "u")).forEach {
            assertThat(ComposerPreUploadCopy.label(it, "X", units, Locale.FRANCE)).isNull()
        }
    }

    @Test
    fun `lechelle suit le total, jamais lenvoye`() {
        assertThat(ComposerPreUploadCopy.bytes(12_000, 14_200_000, units, Locale.US)).isEqualTo("0 / 14.2 Mo")
        assertThat(ComposerPreUploadCopy.bytes(500, 900_000, units, Locale.US)).isEqualTo("0.5 / 900 ko")
        assertThat(ComposerPreUploadCopy.bytes(1_500_000_000, 2_000_000_000, units, Locale.US)).isEqualTo("1.5 / 2 Go")
    }

    @Test
    fun `lenvoye est borne au total`() {
        assertThat(ComposerPreUploadCopy.bytes(99_000_000, 14_200_000, units, Locale.US)).isEqualTo("14.2 / 14.2 Mo")
        assertThat(ComposerPreUploadCopy.bytes(-5, 14_200_000, units, Locale.US)).isEqualTo("0 / 14.2 Mo")
    }
}
